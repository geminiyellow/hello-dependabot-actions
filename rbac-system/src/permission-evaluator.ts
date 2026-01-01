/**
 * 权限评估器 - 核心权限计算逻辑
 */

import {
  PermissionBits,
  PermissionFlags,
  PermissionCheckRequest,
  PermissionCheckResult,
  User,
  Resource,
  AccessControl,
  ResourcePermission,
  Group,
  Tenant,
} from './types';
import { PermissionCache } from './permission-cache';
import { AuditLogger } from './audit-logger';

export interface IDataStore {
  // 用户相关
  getUser(userId: string): Promise<User | null>;
  getUserGroups(userId: string): Promise<Group[]>;
  getTenant(tenantId: string): Promise<Tenant | null>;

  // 资源相关
  getResource(resourceId: string): Promise<Resource | null>;
  getResourcePermission(
    resourceId: string,
    subjectId: string,
    subjectType: 'user' | 'group'
  ): Promise<ResourcePermission | null>;

  // 访问控制
  getAccessControl(
    userId: string,
    resourceId: string,
    type: 'whitelist' | 'blacklist'
  ): Promise<AccessControl | null>;
}

export class PermissionEvaluator {
  private cache: PermissionCache;
  private auditLogger: AuditLogger;
  private dataStore: IDataStore;

  constructor(dataStore: IDataStore, options?: {
    enableCache?: boolean;
    cacheTTL?: number;
    enableAudit?: boolean;
  }) {
    this.dataStore = dataStore;
    this.cache = new PermissionCache(options?.cacheTTL);
    this.auditLogger = new AuditLogger(options?.enableAudit ?? true);
  }

  /**
   * 检查用户是否有权限访问资源
   *
   * @param userId 用户ID
   * @param resourceId 资源ID
   * @param requiredPermission 所需权限
   * @returns 权限检查结果
   */
  async checkPermission(
    userId: string,
    resourceId: string,
    requiredPermission: PermissionBits
  ): Promise<PermissionCheckResult> {
    const startTime = Date.now();

    try {
      // 1. 尝试从缓存获取
      const cachedPermission = this.cache.get(userId, resourceId);
      if (cachedPermission !== null) {
        const allowed = (cachedPermission & requiredPermission) === requiredPermission;

        await this.auditLogger.log({
          userId,
          resourceId,
          action: 'permission_check',
          result: allowed ? 'success' : 'denied',
          metadata: {
            cached: true,
            duration: Date.now() - startTime,
          },
        });

        return {
          allowed,
          effectivePermission: cachedPermission,
          source: 'cache' as any,
        };
      }

      // 2. 检查黑名单 - 最高优先级
      const blacklisted = await this.isBlacklisted(userId, resourceId);
      if (blacklisted) {
        await this.auditLogger.log({
          userId,
          resourceId,
          action: 'permission_check',
          result: 'denied',
          reason: 'blacklisted',
        });

        return {
          allowed: false,
          effectivePermission: PermissionFlags.NONE,
          source: 'blacklist',
          reason: 'User is blacklisted for this resource',
        };
      }

      // 3. 检查白名单
      const whitelisted = await this.isWhitelisted(userId, resourceId);
      if (whitelisted) {
        // 白名单授予所有权限
        const allPermissions = this.getAllPermissions();
        this.cache.set(userId, resourceId, allPermissions);

        await this.auditLogger.log({
          userId,
          resourceId,
          action: 'permission_check',
          result: 'success',
          reason: 'whitelisted',
        });

        return {
          allowed: true,
          effectivePermission: allPermissions,
          source: 'whitelist',
          reason: 'User is whitelisted for this resource',
        };
      }

      // 4. 计算有效权限
      const result = await this.calculateEffectivePermission(userId, resourceId);

      // 5. 缓存结果
      this.cache.set(userId, resourceId, result.effectivePermission);

      // 6. 检查是否满足所需权限
      const allowed = (result.effectivePermission & requiredPermission) === requiredPermission;

      await this.auditLogger.log({
        userId,
        resourceId,
        action: 'permission_check',
        result: allowed ? 'success' : 'denied',
        metadata: {
          source: result.source,
          effectivePermission: result.effectivePermission.toString(2),
          requiredPermission: requiredPermission.toString(2),
          duration: Date.now() - startTime,
        },
      });

      return {
        allowed,
        effectivePermission: result.effectivePermission,
        source: result.source,
      };

    } catch (error) {
      await this.auditLogger.log({
        userId,
        resourceId,
        action: 'permission_check',
        result: 'error',
        reason: error.message,
      });

      throw error;
    }
  }

  /**
   * 批量权限检查
   */
  async checkPermissionBatch(
    userId: string,
    checks: Array<{ resourceId: string; permission: PermissionBits }>
  ): Promise<Array<PermissionCheckResult & { resourceId: string }>> {
    const results = await Promise.all(
      checks.map(async (check) => {
        const result = await this.checkPermission(
          userId,
          check.resourceId,
          check.permission
        );
        return {
          resourceId: check.resourceId,
          ...result,
        };
      })
    );

    return results;
  }

  /**
   * 计算有效权限
   */
  private async calculateEffectivePermission(
    userId: string,
    resourceId: string
  ): Promise<PermissionCheckResult> {
    const user = await this.dataStore.getUser(userId);
    if (!user) {
      return {
        allowed: false,
        effectivePermission: PermissionFlags.NONE,
        source: 'none',
        reason: 'User not found',
      };
    }

    const resource = await this.dataStore.getResource(resourceId);
    if (!resource) {
      return {
        allowed: false,
        effectivePermission: PermissionFlags.NONE,
        source: 'none',
        reason: 'Resource not found',
      };
    }

    // 租户隔离检查
    if (user.tenantId !== resource.tenantId) {
      return {
        allowed: false,
        effectivePermission: PermissionFlags.NONE,
        source: 'none',
        reason: 'Cross-tenant access denied',
      };
    }

    // 优先级 4: 资源权限（用户级）
    const resourceUserPerm = await this.getResourcePermission(userId, resourceId, 'user');
    if (resourceUserPerm !== null) {
      return {
        allowed: resourceUserPerm !== PermissionFlags.NONE,
        effectivePermission: resourceUserPerm,
        source: 'resource',
      };
    }

    // 优先级 3: 用户直接权限
    if (user.directPermissions !== PermissionFlags.NONE) {
      return {
        allowed: true,
        effectivePermission: user.directPermissions,
        source: 'user',
      };
    }

    // 优先级 2: 组权限（合并所有组）
    const groupPermissions = await this.getUserGroupPermissions(userId, resourceId);
    if (groupPermissions.length > 0) {
      const mergedPermission = this.mergePermissions(groupPermissions);
      if (mergedPermission !== PermissionFlags.NONE) {
        return {
          allowed: true,
          effectivePermission: mergedPermission,
          source: 'group',
        };
      }
    }

    // 优先级 1: 租户默认权限
    const tenant = await this.dataStore.getTenant(user.tenantId);
    if (tenant && tenant.defaultPermissions !== PermissionFlags.NONE) {
      return {
        allowed: true,
        effectivePermission: tenant.defaultPermissions,
        source: 'tenant',
      };
    }

    // 默认拒绝
    return {
      allowed: false,
      effectivePermission: PermissionFlags.NONE,
      source: 'none',
      reason: 'No permissions found',
    };
  }

  /**
   * 检查黑名单
   */
  private async isBlacklisted(userId: string, resourceId: string): Promise<boolean> {
    const blacklist = await this.dataStore.getAccessControl(userId, resourceId, 'blacklist');

    if (!blacklist) return false;

    // 检查是否过期
    if (blacklist.expiresAt && new Date() > blacklist.expiresAt) {
      return false;
    }

    return true;
  }

  /**
   * 检查白名单
   */
  private async isWhitelisted(userId: string, resourceId: string): Promise<boolean> {
    const whitelist = await this.dataStore.getAccessControl(userId, resourceId, 'whitelist');

    if (!whitelist) return false;

    // 检查是否过期
    if (whitelist.expiresAt && new Date() > whitelist.expiresAt) {
      return false;
    }

    return true;
  }

  /**
   * 获取资源权限
   */
  private async getResourcePermission(
    userId: string,
    resourceId: string,
    subjectType: 'user' | 'group'
  ): Promise<PermissionBits | null> {
    const permission = await this.dataStore.getResourcePermission(
      resourceId,
      userId,
      subjectType
    );

    return permission ? permission.permissions : null;
  }

  /**
   * 获取用户的所有组权限
   */
  private async getUserGroupPermissions(
    userId: string,
    resourceId: string
  ): Promise<PermissionBits[]> {
    const groups = await this.dataStore.getUserGroups(userId);
    const permissions: PermissionBits[] = [];

    for (const group of groups) {
      // 获取组的直接权限
      permissions.push(group.permissions);

      // 获取组对特定资源的权限
      const resourcePerm = await this.dataStore.getResourcePermission(
        resourceId,
        group.id,
        'group'
      );

      if (resourcePerm) {
        permissions.push(resourcePerm.permissions);
      }
    }

    return permissions;
  }

  /**
   * 合并权限（按位或运算）
   */
  private mergePermissions(permissions: PermissionBits[]): PermissionBits {
    return permissions.reduce((acc, perm) => acc | perm, PermissionFlags.NONE);
  }

  /**
   * 获取所有权限
   */
  private getAllPermissions(): PermissionBits {
    return PermissionFlags.READ |
           PermissionFlags.WRITE |
           PermissionFlags.DELETE |
           PermissionFlags.EXECUTE |
           PermissionFlags.ADMIN;
  }

  /**
   * 清除缓存
   */
  invalidateCache(userId?: string, resourceId?: string): void {
    this.cache.invalidate(userId, resourceId);
  }

  /**
   * 获取权限详情（用于调试）
   */
  async getPermissionDetails(
    userId: string,
    resourceId: string
  ): Promise<{
    user: User | null;
    resource: Resource | null;
    tenant: Tenant | null;
    groups: Group[];
    blacklisted: boolean;
    whitelisted: boolean;
    effectivePermission: PermissionBits;
    source: string;
  }> {
    const user = await this.dataStore.getUser(userId);
    const resource = await this.dataStore.getResource(resourceId);
    const tenant = user ? await this.dataStore.getTenant(user.tenantId) : null;
    const groups = user ? await this.dataStore.getUserGroups(userId) : [];

    const blacklisted = await this.isBlacklisted(userId, resourceId);
    const whitelisted = await this.isWhitelisted(userId, resourceId);

    const result = await this.calculateEffectivePermission(userId, resourceId);

    return {
      user,
      resource,
      tenant,
      groups,
      blacklisted,
      whitelisted,
      effectivePermission: result.effectivePermission,
      source: result.source,
    };
  }
}
