/**
 * 统一权限管理引擎
 *
 * 集成所有权限检查功能：
 * - RBAC 层级权限
 * - ABAC 属性基础权限
 * - 动态权限（基于关系）
 * - 条件权限（基于资源状态）
 * - 临时权限和委托
 * - SOD 约束检查
 * - 资源层级继承
 * - 数据级过滤（RLS）
 * - 字段级过滤（CLS）
 * - 审计日志
 */

import {
  PermissionFlags,
  PermissionBits,
  User,
  Resource,
  AccessContext,
  ABACPolicy,
  DynamicPermission,
  TemporaryPermission,
  PermissionDelegation,
  SODConstraint,
  DataLevelPolicy,
  FieldLevelPolicy,
  ResourceHierarchy,
  AuditLog,
} from './unified-types';

export interface PermissionCheckResult {
  allowed: boolean;
  effectivePermissions: PermissionBits;
  reasons: string[];
  appliedPolicies: string[];
  dataFilters?: string[]; // SQL filters for RLS
  fieldMasks?: FieldMaskConfig[]; // Field masking rules
  warnings?: string[];
}

export interface FieldMaskConfig {
  fieldName: string;
  maskingType: 'none' | 'full' | 'partial' | 'hash';
  maskingConfig?: any;
}

export interface PermissionEvaluationContext {
  user: User;
  resource: Resource;
  requiredPermission: PermissionBits;
  accessContext: AccessContext;
  skipCache?: boolean;
}

/**
 * 数据存储接口（需要实现）
 */
export interface IPermissionDataStore {
  // 基础实体
  getUser(userId: string): Promise<User | null>;
  getResource(resourceId: string): Promise<Resource | null>;
  getUserGroups(userId: string): Promise<string[]>;
  getGroupPermissions(groupId: string): Promise<PermissionBits>;

  // 直接权限授予
  getResourcePermissions(resourceId: string, userId: string): Promise<PermissionBits>;
  getAccessControl(resourceId: string, userId: string): Promise<{
    blacklist?: PermissionBits;
    whitelist?: PermissionBits;
  }>;

  // ABAC
  getABACPolicies(resourceType: string): Promise<ABACPolicy[]>;

  // 动态权限
  getDynamicPermissions(resourceType: string): Promise<DynamicPermission[]>;
  getResourceRelationships(resourceId: string, userId: string): Promise<string[]>;

  // 临时权限
  getTemporaryPermissions(userId: string, resourceId: string): Promise<TemporaryPermission[]>;
  getActiveDelegations(userId: string, resourceId?: string): Promise<PermissionDelegation[]>;

  // SOD
  getSODConstraints(): Promise<SODConstraint[]>;

  // 资源层级
  getResourceHierarchy(resourceId: string): Promise<ResourceHierarchy[]>;

  // 数据级权限
  getDataLevelPolicies(resourceType: string): Promise<DataLevelPolicy[]>;

  // 字段级权限
  getFieldLevelPolicies(resourceType: string): Promise<FieldLevelPolicy[]>;

  // 审计
  saveAuditLog(log: AuditLog): Promise<void>;
}

export class UnifiedPermissionEngine {
  constructor(
    private dataStore: IPermissionDataStore,
    private cacheEnabled: boolean = true,
    private cacheTTL: number = 5 * 60 * 1000 // 5 minutes
  ) {}

  /**
   * 主入口：统一权限检查
   */
  async checkPermission(
    userId: string,
    resourceId: string,
    requiredPermission: PermissionBits,
    context?: Partial<AccessContext>
  ): Promise<PermissionCheckResult> {
    const startTime = Date.now();

    // 1. 加载基础数据
    const [user, resource] = await Promise.all([
      this.dataStore.getUser(userId),
      this.dataStore.getResource(resourceId),
    ]);

    if (!user || !resource) {
      return this.createDeniedResult('User or resource not found');
    }

    // 2. 构建完整上下文
    const accessContext: AccessContext = {
      currentTime: new Date(),
      isWorkingHours: this.isWorkingHours(new Date()),
      ipAddress: context?.ipAddress || '',
      isInOffice: context?.isInOffice || false,
      deviceType: context?.deviceType || 'desktop',
      isTrustedDevice: context?.isTrustedDevice || false,
      location: context?.location,
      resourceAttributes: resource.attributes,
      userAttributes: user.attributes,
      sessionId: context?.sessionId,
      requestId: context?.requestId,
    };

    const evaluationContext: PermissionEvaluationContext = {
      user,
      resource,
      requiredPermission,
      accessContext,
    };

    // 3. 执行分层权限检查
    const result = await this.evaluatePermissions(evaluationContext);

    // 4. 审计日志
    await this.dataStore.saveAuditLog({
      id: this.generateId(),
      timestamp: new Date(),
      userId,
      action: 'check',
      resourceId,
      permission: requiredPermission,
      result: result.allowed ? 'allowed' : 'denied',
      reason: result.reasons.join('; '),
      context: accessContext,
      ipAddress: accessContext.ipAddress,
      metadata: {
        evaluationTimeMs: Date.now() - startTime,
        appliedPolicies: result.appliedPolicies,
      },
    });

    return result;
  }

  /**
   * 分层权限评估
   */
  private async evaluatePermissions(
    ctx: PermissionEvaluationContext
  ): Promise<PermissionCheckResult> {
    const reasons: string[] = [];
    const appliedPolicies: string[] = [];
    const warnings: string[] = [];
    let effectivePermissions: PermissionBits = PermissionFlags.NONE;

    // Step 1: 检查黑名单（最高优先级）
    const blacklistCheck = await this.checkBlacklist(ctx);
    if (blacklistCheck.denied) {
      return this.createDeniedResult(
        `Blacklisted: ${blacklistCheck.reason}`,
        effectivePermissions,
        appliedPolicies
      );
    }

    // Step 2: 检查白名单
    const whitelistCheck = await this.checkWhitelist(ctx);
    if (whitelistCheck.granted) {
      reasons.push(`Whitelist: ${whitelistCheck.reason}`);
      effectivePermissions |= whitelistCheck.permissions;
      appliedPolicies.push('whitelist');

      if (this.hasPermission(effectivePermissions, ctx.requiredPermission)) {
        return this.createAllowedResult(effectivePermissions, reasons, appliedPolicies);
      }
    }

    // Step 3: ABAC 策略检查（上下文感知）
    const abacCheck = await this.checkABACPolicies(ctx);
    if (abacCheck.effect === 'deny') {
      return this.createDeniedResult(
        `ABAC Policy Denied: ${abacCheck.reason}`,
        effectivePermissions,
        [...appliedPolicies, ...abacCheck.appliedPolicies]
      );
    }
    if (abacCheck.effect === 'allow') {
      reasons.push(`ABAC: ${abacCheck.reason}`);
      effectivePermissions |= abacCheck.permissions;
      appliedPolicies.push(...abacCheck.appliedPolicies);
    }

    // Step 4: 条件权限检查（基于资源状态）
    const conditionalCheck = await this.checkConditionalPermissions(ctx);
    if (conditionalCheck.denied) {
      return this.createDeniedResult(
        `Conditional: ${conditionalCheck.reason}`,
        effectivePermissions,
        appliedPolicies
      );
    }
    if (conditionalCheck.granted) {
      reasons.push(`Conditional: ${conditionalCheck.reason}`);
      effectivePermissions |= conditionalCheck.permissions;
    }

    // Step 5: 动态权限检查（基于关系）
    const dynamicCheck = await this.checkDynamicPermissions(ctx);
    if (dynamicCheck.granted) {
      reasons.push(`Dynamic: ${dynamicCheck.reason}`);
      effectivePermissions |= dynamicCheck.permissions;
      appliedPolicies.push('dynamic_permissions');
    }

    // Step 6: 临时权限和委托
    const temporaryCheck = await this.checkTemporaryPermissions(ctx);
    if (temporaryCheck.granted) {
      reasons.push(`Temporary: ${temporaryCheck.reason}`);
      effectivePermissions |= temporaryCheck.permissions;
      appliedPolicies.push('temporary_permissions');
    }

    // Step 7: 资源层级继承
    const inheritedCheck = await this.checkInheritedPermissions(ctx);
    if (inheritedCheck.granted) {
      reasons.push(`Inherited: ${inheritedCheck.reason}`);
      effectivePermissions |= inheritedCheck.permissions;
      appliedPolicies.push('resource_hierarchy');
    }

    // Step 8: 直接资源权限
    const resourceCheck = await this.checkResourcePermissions(ctx);
    if (resourceCheck.granted) {
      reasons.push(`Resource: ${resourceCheck.reason}`);
      effectivePermissions |= resourceCheck.permissions;
      appliedPolicies.push('resource_permissions');
    }

    // Step 9: 用户直接权限
    effectivePermissions |= ctx.user.permissions;
    if (ctx.user.permissions > 0) {
      reasons.push('User direct permissions');
      appliedPolicies.push('user_permissions');
    }

    // Step 10: 组权限
    const groupCheck = await this.checkGroupPermissions(ctx);
    effectivePermissions |= groupCheck.permissions;
    if (groupCheck.permissions > 0) {
      reasons.push(`Group: ${groupCheck.reason}`);
      appliedPolicies.push('group_permissions');
    }

    // Step 11: 租户默认权限
    const tenant = await this.getTenantPermissions(ctx.user.tenantId);
    effectivePermissions |= tenant.permissions;
    if (tenant.permissions > 0) {
      reasons.push('Tenant default permissions');
      appliedPolicies.push('tenant_permissions');
    }

    // Step 12: SOD 约束检查
    const sodCheck = await this.checkSODConstraints(ctx, effectivePermissions);
    if (sodCheck.violated) {
      if (sodCheck.action === 'block') {
        return this.createDeniedResult(
          `SOD Violation: ${sodCheck.reason}`,
          effectivePermissions,
          appliedPolicies
        );
      } else {
        warnings.push(`SOD Warning: ${sodCheck.reason}`);
      }
    }

    // Step 13: 检查是否满足所需权限
    const hasRequired = this.hasPermission(effectivePermissions, ctx.requiredPermission);

    if (!hasRequired) {
      return this.createDeniedResult(
        'Insufficient permissions',
        effectivePermissions,
        appliedPolicies
      );
    }

    // Step 14: 数据级过滤（RLS）
    const dataFilters = await this.getDataLevelFilters(ctx);

    // Step 15: 字段级过滤（CLS）
    const fieldMasks = await this.getFieldLevelMasks(ctx, effectivePermissions);

    return {
      allowed: true,
      effectivePermissions,
      reasons,
      appliedPolicies,
      dataFilters,
      fieldMasks,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * 黑名单检查
   */
  private async checkBlacklist(ctx: PermissionEvaluationContext): Promise<{
    denied: boolean;
    reason?: string;
  }> {
    const accessControl = await this.dataStore.getAccessControl(
      ctx.resource.id,
      ctx.user.id
    );

    if (accessControl.blacklist && accessControl.blacklist > 0) {
      if (this.hasPermission(accessControl.blacklist, ctx.requiredPermission)) {
        return {
          denied: true,
          reason: 'User is blacklisted for this resource',
        };
      }
    }

    return { denied: false };
  }

  /**
   * 白名单检查
   */
  private async checkWhitelist(ctx: PermissionEvaluationContext): Promise<{
    granted: boolean;
    permissions: PermissionBits;
    reason?: string;
  }> {
    const accessControl = await this.dataStore.getAccessControl(
      ctx.resource.id,
      ctx.user.id
    );

    if (accessControl.whitelist && accessControl.whitelist > 0) {
      return {
        granted: true,
        permissions: accessControl.whitelist,
        reason: 'User is whitelisted',
      };
    }

    return { granted: false, permissions: PermissionFlags.NONE };
  }

  /**
   * ABAC 策略检查
   */
  private async checkABACPolicies(ctx: PermissionEvaluationContext): Promise<{
    effect: 'allow' | 'deny' | 'none';
    permissions: PermissionBits;
    reason?: string;
    appliedPolicies: string[];
  }> {
    const policies = await this.dataStore.getABACPolicies(ctx.resource.type);
    const appliedPolicies: string[] = [];
    let grantedPermissions: PermissionBits = PermissionFlags.NONE;

    // 按优先级排序
    policies.sort((a, b) => b.priority - a.priority);

    for (const policy of policies) {
      if (!policy.enabled) continue;

      const matches = this.evaluatePolicyConditions(
        policy.conditions,
        ctx.user,
        ctx.resource,
        ctx.accessContext
      );

      if (matches) {
        appliedPolicies.push(policy.name);

        if (policy.effect === 'deny') {
          return {
            effect: 'deny',
            permissions: PermissionFlags.NONE,
            reason: policy.description || policy.name,
            appliedPolicies,
          };
        } else {
          grantedPermissions |= policy.permissions;
        }
      }
    }

    if (grantedPermissions > 0) {
      return {
        effect: 'allow',
        permissions: grantedPermissions,
        reason: `ABAC policies: ${appliedPolicies.join(', ')}`,
        appliedPolicies,
      };
    }

    return {
      effect: 'none',
      permissions: PermissionFlags.NONE,
      appliedPolicies: [],
    };
  }

  /**
   * 评估 ABAC 策略条件
   */
  private evaluatePolicyConditions(
    conditions: any[],
    user: User,
    resource: Resource,
    context: AccessContext
  ): boolean {
    let currentResult = true;
    let currentLogicalOp: 'AND' | 'OR' = 'AND';

    for (const condition of conditions) {
      const value = this.getConditionValue(condition.field, user, resource, context);
      const matches = this.evaluateCondition(value, condition.operator, condition.value);

      if (currentLogicalOp === 'AND') {
        currentResult = currentResult && matches;
      } else {
        currentResult = currentResult || matches;
      }

      currentLogicalOp = condition.logicalOperator || 'AND';
    }

    return currentResult;
  }

  private getConditionValue(
    field: string,
    user: User,
    resource: Resource,
    context: AccessContext
  ): any {
    const parts = field.split('.');

    if (parts[0] === 'user') {
      if (parts[1] === 'attributes') {
        return user.attributes[parts[2]];
      }
      return (user as any)[parts[1]];
    }

    if (parts[0] === 'resource') {
      if (parts[1] === 'attributes') {
        return resource.attributes[parts[2]];
      }
      if (parts[1] === 'state') {
        return (resource.state as any)[parts[2]];
      }
      return (resource as any)[parts[1]];
    }

    if (parts[0] === 'context') {
      return (context as any)[parts[1]];
    }

    return undefined;
  }

  private evaluateCondition(value: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'equals':
        return value === expected;
      case 'not_equals':
        return value !== expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(value);
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(value);
      case 'greater_than':
        return value > expected;
      case 'less_than':
        return value < expected;
      case 'matches':
        return new RegExp(expected).test(String(value));
      case 'between':
        return value >= expected[0] && value <= expected[1];
      default:
        return false;
    }
  }

  /**
   * 条件权限检查（基于资源状态）
   */
  private async checkConditionalPermissions(ctx: PermissionEvaluationContext): Promise<{
    granted: boolean;
    denied: boolean;
    permissions: PermissionBits;
    reason?: string;
  }> {
    const { resource, requiredPermission, user } = ctx;

    // 示例：只有草稿状态才能编辑
    if (this.hasPermission(requiredPermission, PermissionFlags.WRITE)) {
      if (resource.state.status === 'published') {
        return {
          granted: false,
          denied: true,
          permissions: PermissionFlags.NONE,
          reason: 'Cannot edit published resources',
        };
      }

      if (resource.state.status === 'approved' && resource.creatorId !== user.id) {
        return {
          granted: false,
          denied: true,
          permissions: PermissionFlags.NONE,
          reason: 'Only creator can edit approved resources',
        };
      }
    }

    // 示例：资源锁定检查
    if (resource.state.lockedBy && resource.state.lockedBy !== user.id) {
      if (resource.state.lockedUntil && resource.state.lockedUntil > new Date()) {
        return {
          granted: false,
          denied: true,
          permissions: PermissionFlags.NONE,
          reason: `Resource locked by another user until ${resource.state.lockedUntil}`,
        };
      }
    }

    return {
      granted: false,
      denied: false,
      permissions: PermissionFlags.NONE,
    };
  }

  /**
   * 动态权限检查（基于关系）
   */
  private async checkDynamicPermissions(ctx: PermissionEvaluationContext): Promise<{
    granted: boolean;
    permissions: PermissionBits;
    reason?: string;
  }> {
    const relationships = await this.dataStore.getResourceRelationships(
      ctx.resource.id,
      ctx.user.id
    );

    if (relationships.length === 0) {
      return { granted: false, permissions: PermissionFlags.NONE };
    }

    const dynamicPermissions = await this.dataStore.getDynamicPermissions(ctx.resource.type);
    let grantedPermissions: PermissionBits = PermissionFlags.NONE;
    const grantedRelationships: string[] = [];

    for (const relationship of relationships) {
      const permission = dynamicPermissions.find(dp => dp.relationship === relationship);
      if (permission) {
        grantedPermissions |= permission.permissions;
        grantedRelationships.push(relationship);
      }
    }

    if (grantedPermissions > 0) {
      return {
        granted: true,
        permissions: grantedPermissions,
        reason: `Relationships: ${grantedRelationships.join(', ')}`,
      };
    }

    return { granted: false, permissions: PermissionFlags.NONE };
  }

  /**
   * 临时权限检查
   */
  private async checkTemporaryPermissions(ctx: PermissionEvaluationContext): Promise<{
    granted: boolean;
    permissions: PermissionBits;
    reason?: string;
  }> {
    const [tempPerms, delegations] = await Promise.all([
      this.dataStore.getTemporaryPermissions(ctx.user.id, ctx.resource.id),
      this.dataStore.getActiveDelegations(ctx.user.id, ctx.resource.id),
    ]);

    let grantedPermissions: PermissionBits = PermissionFlags.NONE;
    const reasons: string[] = [];

    // 临时权限
    const now = new Date();
    for (const temp of tempPerms) {
      if (!temp.revoked && temp.expiresAt > now) {
        grantedPermissions |= temp.permissions;
        reasons.push(`Temporary grant until ${temp.expiresAt}`);
      }
    }

    // 委托权限
    for (const delegation of delegations) {
      if (delegation.status === 'active' && delegation.endDate > now) {
        grantedPermissions |= delegation.permissions;
        reasons.push(`Delegated by user ${delegation.delegatorId}`);
      }
    }

    if (grantedPermissions > 0) {
      return {
        granted: true,
        permissions: grantedPermissions,
        reason: reasons.join('; '),
      };
    }

    return { granted: false, permissions: PermissionFlags.NONE };
  }

  /**
   * 资源层级继承权限
   */
  private async checkInheritedPermissions(ctx: PermissionEvaluationContext): Promise<{
    granted: boolean;
    permissions: PermissionBits;
    reason?: string;
  }> {
    const hierarchy = await this.dataStore.getResourceHierarchy(ctx.resource.id);
    let inheritedPermissions: PermissionBits = PermissionFlags.NONE;

    for (const parent of hierarchy) {
      if (parent.inheritPermissions) {
        const parentPermissions = await this.dataStore.getResourcePermissions(
          parent.parentResourceId,
          ctx.user.id
        );

        if (parent.overridePermissions) {
          inheritedPermissions |= parent.overridePermissions;
        } else {
          inheritedPermissions |= parentPermissions;
        }
      }
    }

    if (inheritedPermissions > 0) {
      return {
        granted: true,
        permissions: inheritedPermissions,
        reason: `Inherited from ${hierarchy.length} parent resource(s)`,
      };
    }

    return { granted: false, permissions: PermissionFlags.NONE };
  }

  /**
   * 资源直接权限
   */
  private async checkResourcePermissions(ctx: PermissionEvaluationContext): Promise<{
    granted: boolean;
    permissions: PermissionBits;
    reason?: string;
  }> {
    const permissions = await this.dataStore.getResourcePermissions(
      ctx.resource.id,
      ctx.user.id
    );

    if (permissions > 0) {
      return {
        granted: true,
        permissions,
        reason: 'Direct resource permission',
      };
    }

    return { granted: false, permissions: PermissionFlags.NONE };
  }

  /**
   * 组权限
   */
  private async checkGroupPermissions(ctx: PermissionEvaluationContext): Promise<{
    permissions: PermissionBits;
    reason?: string;
  }> {
    const groupIds = await this.dataStore.getUserGroups(ctx.user.id);
    let groupPermissions: PermissionBits = PermissionFlags.NONE;

    for (const groupId of groupIds) {
      const permissions = await this.dataStore.getGroupPermissions(groupId);
      groupPermissions |= permissions;
    }

    if (groupPermissions > 0) {
      return {
        permissions: groupPermissions,
        reason: `${groupIds.length} group(s)`,
      };
    }

    return { permissions: PermissionFlags.NONE };
  }

  /**
   * SOD 约束检查
   */
  private async checkSODConstraints(
    ctx: PermissionEvaluationContext,
    effectivePermissions: PermissionBits
  ): Promise<{
    violated: boolean;
    action?: 'warn' | 'block';
    reason?: string;
  }> {
    const constraints = await this.dataStore.getSODConstraints();

    for (const constraint of constraints) {
      if (!constraint.enabled) continue;

      if (constraint.constraintType === 'permission_conflict') {
        // 检查是否同时拥有冲突的权限
        const conflicts = constraint.conflictingPermissions || [];
        let hasConflict = false;
        let conflictCount = 0;

        for (const conflictPerm of conflicts) {
          if (this.hasPermission(effectivePermissions, conflictPerm)) {
            conflictCount++;
          }
        }

        if (conflictCount >= 2) {
          hasConflict = true;
        }

        if (hasConflict) {
          return {
            violated: true,
            action: constraint.action,
            reason: constraint.description || constraint.name,
          };
        }
      }
    }

    return { violated: false };
  }

  /**
   * 数据级过滤器（RLS）
   */
  private async getDataLevelFilters(ctx: PermissionEvaluationContext): Promise<string[]> {
    const policies = await this.dataStore.getDataLevelPolicies(ctx.resource.type);
    const filters: string[] = [];

    for (const policy of policies) {
      if (!policy.enabled) continue;

      let filterClause = '';

      switch (policy.filterType) {
        case 'equals':
          filterClause = `${policy.field} = '${policy.filterValue}'`;
          break;
        case 'in':
          const values = Array.isArray(policy.filterValue)
            ? policy.filterValue.map(v => `'${v}'`).join(',')
            : '';
          filterClause = `${policy.field} IN (${values})`;
          break;
        case 'user_attribute':
          const userAttrValue = policy.userAttributeField
            ? this.getConditionValue(policy.userAttributeField, ctx.user, ctx.resource, ctx.accessContext)
            : null;
          if (userAttrValue) {
            filterClause = `${policy.field} = '${userAttrValue}'`;
          }
          break;
        case 'custom':
          if (policy.customFilter) {
            filterClause = policy.customFilter;
          }
          break;
      }

      if (filterClause) {
        filters.push(filterClause);
      }
    }

    return filters;
  }

  /**
   * 字段级掩码配置（CLS）
   */
  private async getFieldLevelMasks(
    ctx: PermissionEvaluationContext,
    effectivePermissions: PermissionBits
  ): Promise<FieldMaskConfig[]> {
    const policies = await this.dataStore.getFieldLevelPolicies(ctx.resource.type);
    const masks: FieldMaskConfig[] = [];

    for (const policy of policies) {
      if (!policy.enabled) continue;

      // 检查用户是否有足够权限访问该字段
      const hasPermission = this.hasPermission(effectivePermissions, policy.requiredPermission);

      if (!hasPermission && policy.maskingRule) {
        masks.push({
          fieldName: policy.fieldName,
          maskingType: policy.maskingRule.type,
          maskingConfig: policy.maskingRule,
        });
      }
    }

    return masks;
  }

  /**
   * 辅助方法
   */
  private hasPermission(granted: PermissionBits, required: PermissionBits): boolean {
    return (granted & required) === required;
  }

  private async getTenantPermissions(tenantId: string): Promise<{ permissions: PermissionBits }> {
    // 简化实现，实际应从数据库获取
    return { permissions: PermissionFlags.READ };
  }

  private isWorkingHours(date: Date): boolean {
    const hour = date.getHours();
    const day = date.getDay();
    return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private createAllowedResult(
    effectivePermissions: PermissionBits,
    reasons: string[],
    appliedPolicies: string[]
  ): PermissionCheckResult {
    return {
      allowed: true,
      effectivePermissions,
      reasons,
      appliedPolicies,
    };
  }

  private createDeniedResult(
    reason: string,
    effectivePermissions: PermissionBits = PermissionFlags.NONE,
    appliedPolicies: string[] = []
  ): PermissionCheckResult {
    return {
      allowed: false,
      effectivePermissions,
      reasons: [reason],
      appliedPolicies,
    };
  }

  /**
   * 批量权限检查（性能优化）
   */
  async checkPermissionsBatch(
    requests: Array<{
      userId: string;
      resourceId: string;
      requiredPermission: PermissionBits;
      context?: Partial<AccessContext>;
    }>
  ): Promise<PermissionCheckResult[]> {
    // 并行处理所有请求
    return Promise.all(
      requests.map(req =>
        this.checkPermission(req.userId, req.resourceId, req.requiredPermission, req.context)
      )
    );
  }

  /**
   * 获取用户的所有有效权限（用于调试/审计）
   */
  async getUserEffectivePermissions(
    userId: string,
    resourceId: string
  ): Promise<{
    totalPermissions: PermissionBits;
    breakdown: Record<string, PermissionBits>;
    details: string[];
  }> {
    const user = await this.dataStore.getUser(userId);
    const resource = await this.dataStore.getResource(resourceId);

    if (!user || !resource) {
      throw new Error('User or resource not found');
    }

    const breakdown: Record<string, PermissionBits> = {};
    const details: string[] = [];

    // 收集各层权限
    breakdown.user = user.permissions;
    breakdown.resource = await this.dataStore.getResourcePermissions(resourceId, userId);

    const groupCheck = await this.checkGroupPermissions({
      user,
      resource,
      requiredPermission: PermissionFlags.NONE,
      accessContext: {} as AccessContext,
    });
    breakdown.groups = groupCheck.permissions;

    const dynamicCheck = await this.checkDynamicPermissions({
      user,
      resource,
      requiredPermission: PermissionFlags.NONE,
      accessContext: {} as AccessContext,
    });
    breakdown.dynamic = dynamicCheck.permissions;

    const tempCheck = await this.checkTemporaryPermissions({
      user,
      resource,
      requiredPermission: PermissionFlags.NONE,
      accessContext: {} as AccessContext,
    });
    breakdown.temporary = tempCheck.permissions;

    // 计算总权限
    let total = PermissionFlags.NONE;
    for (const [key, perms] of Object.entries(breakdown)) {
      total |= perms;
      if (perms > 0) {
        details.push(`${key}: ${this.permissionsToString(perms)}`);
      }
    }

    return {
      totalPermissions: total,
      breakdown,
      details,
    };
  }

  private permissionsToString(permissions: PermissionBits): string {
    const perms: string[] = [];
    if (permissions & PermissionFlags.READ) perms.push('READ');
    if (permissions & PermissionFlags.WRITE) perms.push('WRITE');
    if (permissions & PermissionFlags.DELETE) perms.push('DELETE');
    if (permissions & PermissionFlags.EXECUTE) perms.push('EXECUTE');
    if (permissions & PermissionFlags.ADMIN) perms.push('ADMIN');
    return perms.join(' | ');
  }
}
