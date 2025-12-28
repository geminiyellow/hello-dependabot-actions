/**
 * RBAC 系统类型定义
 */

// ============================================================================
// 权限定义
// ============================================================================

/**
 * 权限标志（位运算）
 */
export enum PermissionFlags {
  NONE = 0,       // 0000
  READ = 1,       // 0001
  WRITE = 2,      // 0010
  DELETE = 4,     // 0100
  EXECUTE = 8,    // 1000
  ADMIN = 16,     // 10000
}

/**
 * 权限位
 */
export type PermissionBits = number;

/**
 * 权限对象表示
 */
export interface Permission {
  read: boolean;
  write: boolean;
  delete: boolean;
  execute?: boolean;
  admin?: boolean;
  custom?: Record<string, boolean>;
}

// ============================================================================
// 实体定义
// ============================================================================

/**
 * 租户
 */
export interface Tenant {
  id: string;
  name: string;
  description?: string;
  defaultPermissions: PermissionBits;
  settings: {
    maxUsers?: number;
    maxGroups?: number;
    maxResources?: number;
  };
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 组
 */
export interface Group {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  parentGroupId?: string;
  permissions: PermissionBits;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 用户
 */
export interface User {
  id: string;
  tenantId: string;
  username: string;
  email: string;
  groupIds: string[];
  directPermissions: PermissionBits;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 资源类型
 */
export enum ResourceType {
  FILE = 'file',
  FOLDER = 'folder',
  API = 'api',
  DATABASE = 'database',
  SERVICE = 'service',
  CUSTOM = 'custom',
}

/**
 * 资源
 */
export interface Resource {
  id: string;
  tenantId: string;
  type: ResourceType;
  name: string;
  path?: string;
  ownerId?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 资源权限
 */
export interface ResourcePermission {
  id: string;
  tenantId: string;
  resourceId: string;
  subjectId: string;
  subjectType: 'user' | 'group';
  permissions: PermissionBits;
  inherited: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 访问控制类型
 */
export type AccessControlType = 'whitelist' | 'blacklist';

/**
 * 访问控制（黑白名单）
 */
export interface AccessControl {
  id: string;
  tenantId: string;
  userId: string;
  resourceId: string;
  type: AccessControlType;
  reason?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// 权限检查相关
// ============================================================================

/**
 * 权限检查请求
 */
export interface PermissionCheckRequest {
  userId: string;
  resourceId: string;
  permission: PermissionBits;
}

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  allowed: boolean;
  effectivePermission: PermissionBits;
  source: 'blacklist' | 'whitelist' | 'resource' | 'user' | 'group' | 'tenant' | 'none';
  reason?: string;
}

/**
 * 批量权限检查请求
 */
export interface BatchPermissionCheckRequest {
  userId: string;
  checks: Array<{
    resourceId: string;
    permission: PermissionBits;
  }>;
}

/**
 * 权限分配请求
 */
export interface AssignPermissionRequest {
  subjectType: 'user' | 'group';
  subjectId: string;
  resourceId: string;
  permissions: PermissionBits;
}

// ============================================================================
// 缓存相关
// ============================================================================

/**
 * 缓存条目
 */
export interface CacheEntry {
  permission: PermissionBits;
  expiresAt: number;
}

// ============================================================================
// 审计日志
// ============================================================================

/**
 * 审计日志
 */
export interface AuditLog {
  id: string;
  tenantId: string;
  userId: string;
  action: string;
  resourceId?: string;
  permissionBefore?: PermissionBits;
  permissionAfter?: PermissionBits;
  result: 'success' | 'denied' | 'error';
  reason?: string;
  ip?: string;
  userAgent?: string;
  metadata: Record<string, any>;
  createdAt: Date;
}
