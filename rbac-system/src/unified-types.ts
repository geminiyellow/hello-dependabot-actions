/**
 * 统一权限系统类型定义
 * 包含所有高级功能的类型
 */

// ==================== 权限标志 ====================

export enum PermissionFlags {
  NONE = 0,
  READ = 1 << 0,      // 1
  WRITE = 1 << 1,     // 2
  DELETE = 1 << 2,    // 4
  EXECUTE = 1 << 3,   // 8
  ADMIN = 1 << 4,     // 16
  SHARE = 1 << 5,     // 32
  APPROVE = 1 << 6,   // 64
  AUDIT = 1 << 7,     // 128
  EXPORT = 1 << 8,    // 256
  IMPORT = 1 << 9,    // 512
}

export type PermissionBits = number;

// ==================== 基础实体 ====================

export interface Tenant {
  id: string;
  name: string;
  defaultPermissions: PermissionBits;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Group {
  id: string;
  tenantId: string;
  name: string;
  parentGroupId?: string;
  permissions: PermissionBits;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserAttributes {
  department: string;
  jobTitle: string;
  securityLevel: number;
  location: string;
  employeeType: 'full-time' | 'contractor' | 'intern';
  manager?: string;
  [key: string]: any;
}

export interface User {
  id: string;
  tenantId: string;
  groupIds: string[];
  username: string;
  email: string;
  permissions: PermissionBits;
  attributes: UserAttributes;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface ResourceState {
  status: 'draft' | 'pending_review' | 'approved' | 'published' | 'archived';
  workflowStage?: string;
  version: number;
  lockedBy?: string;
  lockedUntil?: Date;
}

export interface ResourceAttributes {
  classification: 'public' | 'internal' | 'confidential' | 'secret';
  dataCategory: string[];
  compliance: string[];
  region: string;
  [key: string]: any;
}

export interface Resource {
  id: string;
  tenantId: string;
  type: string;
  name: string;
  parentResourceId?: string;
  ownerId: string;
  creatorId: string;
  state: ResourceState;
  attributes: ResourceAttributes;
  permissions: PermissionBits;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== 资源层级 ====================

export interface ResourceHierarchy {
  resourceId: string;
  parentResourceId: string;
  inheritPermissions: boolean;
  overridePermissions?: PermissionBits;
  depth: number;
  path: string;
}

// ==================== 权限授予 ====================

export interface ResourcePermission {
  id: string;
  resourceId: string;
  subjectType: 'user' | 'group';
  subjectId: string;
  permissions: PermissionBits;
  source: 'direct' | 'inherited' | 'role' | 'dynamic';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccessControl {
  id: string;
  resourceId: string;
  userId: string;
  controlType: 'blacklist' | 'whitelist';
  permissions: PermissionBits;
  reason?: string;
  createdBy: string;
  createdAt: Date;
  expiresAt?: Date;
}

// ==================== 动态权限 ====================

export interface DynamicPermission {
  id: string;
  resourceType: string;
  relationship: 'owner' | 'creator' | 'participant' | 'reviewer' | 'approver' | string;
  permissions: PermissionBits;
  description: string;
  createdAt: Date;
}

export interface ResourceRelationship {
  id: string;
  resourceId: string;
  userId: string;
  relationship: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

// ==================== ABAC ====================

export interface PolicyCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater_than' | 'less_than' | 'matches' | 'between';
  value: any;
  logicalOperator?: 'AND' | 'OR';
}

export interface ABACPolicy {
  id: string;
  name: string;
  description: string;
  priority: number;
  resourceType?: string;
  conditions: PolicyCondition[];
  effect: 'allow' | 'deny';
  permissions: PermissionBits;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccessContext {
  currentTime: Date;
  isWorkingHours: boolean;
  ipAddress: string;
  isInOffice: boolean;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  isTrustedDevice: boolean;
  location?: {
    country: string;
    region: string;
    city: string;
  };
  resourceAttributes?: Record<string, any>;
  userAttributes?: Record<string, any>;
  sessionId?: string;
  requestId?: string;
}

// ==================== 临时权限 ====================

export interface TemporaryPermission {
  id: string;
  userId: string;
  resourceId: string;
  permissions: PermissionBits;
  grantedBy: string;
  reason: string;
  grantedAt: Date;
  expiresAt: Date;
  autoRevoke: boolean;
  revoked?: boolean;
  revokedAt?: Date;
  revokedBy?: string;
}

export interface PermissionDelegation {
  id: string;
  delegatorId: string;
  delegateeId: string;
  resourceId?: string;
  permissions: PermissionBits;
  startDate: Date;
  endDate: Date;
  requireApproval: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  status: 'pending' | 'active' | 'expired' | 'revoked';
  createdAt: Date;
}

// ==================== SOD ====================

export interface SODConstraint {
  id: string;
  name: string;
  description: string;
  constraintType: 'role_conflict' | 'permission_conflict' | 'resource_conflict';
  conflictingPermissions?: PermissionBits[];
  conflictingRoles?: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: 'warn' | 'block';
  enabled: boolean;
  createdAt: Date;
}

export interface SODViolation {
  id: string;
  constraintId: string;
  userId: string;
  violationType: string;
  details: Record<string, any>;
  detectedAt: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: string;
}

// ==================== 审批流程 ====================

export interface ApprovalStage {
  stageNumber: number;
  name: string;
  approverType: 'specific_user' | 'role' | 'manager' | 'resource_owner';
  approverIds?: string[];
  requiredApprovals: number;
  timeoutHours?: number;
  onTimeout: 'escalate' | 'reject' | 'approve';
}

export interface ApprovalWorkflow {
  id: string;
  name: string;
  resourceType?: string;
  permissionThreshold: PermissionBits;
  stages: ApprovalStage[];
  autoEscalationHours?: number;
  enabled: boolean;
  createdAt: Date;
}

export interface Approval {
  stageNumber: number;
  approverId: string;
  decision: 'approved' | 'rejected';
  comments?: string;
  decidedAt: Date;
}

export interface PermissionRequest {
  id: string;
  userId: string;
  resourceId: string;
  requestedPermissions: PermissionBits;
  reason: string;
  workflowId?: string;
  currentStage: number;
  status: 'pending' | 'approved' | 'rejected' | 'escalated' | 'expired';
  approvals: Approval[];
  createdAt: Date;
  updatedAt: Date;
  decidedAt?: Date;
  expiresAt?: Date;
}

// ==================== 数据级权限 ====================

export interface DataLevelPolicy {
  id: string;
  name: string;
  resourceType: string;
  field: string;
  filterType: 'equals' | 'in' | 'user_attribute' | 'custom';
  filterValue?: any;
  userAttributeField?: string;
  customFilter?: string;
  priority: number;
  enabled: boolean;
  createdAt: Date;
}

// ==================== 字段级权限 ====================

export interface MaskingRule {
  type: 'none' | 'full' | 'partial' | 'hash' | 'custom';
  partialMaskConfig?: {
    keepPrefix: number;
    keepSuffix: number;
    maskChar: string;
  };
  customFunction?: string;
}

export interface FieldLevelPolicy {
  id: string;
  name: string;
  resourceType: string;
  fieldName: string;
  requiredPermission: PermissionBits;
  maskingRule?: MaskingRule;
  userGroups?: string[];
  priority: number;
  enabled: boolean;
  createdAt: Date;
}

// ==================== 版本控制 ====================

export interface PermissionVersion {
  id: string;
  entityType: 'user' | 'group' | 'resource' | 'policy';
  entityId: string;
  version: number;
  changeType: 'grant' | 'revoke' | 'update' | 'create' | 'delete';
  previousState: any;
  newState: any;
  changedBy: string;
  changeReason?: string;
  timestamp: Date;
  canRollback: boolean;
}

// ==================== 冲突检测 ====================

export interface PermissionConflict {
  id: string;
  conflictType: 'sod_violation' | 'overlapping_grants' | 'inheritance_conflict';
  severity: 'low' | 'medium' | 'high' | 'critical';
  entities: {
    type: string;
    id: string;
    name: string;
  }[];
  description: string;
  detectedAt: Date;
  autoResolvable: boolean;
  suggestedResolution?: string;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

// ==================== 审计 ====================

export interface AuditLog {
  id: string;
  timestamp: Date;
  userId: string;
  action: 'check' | 'grant' | 'revoke' | 'request' | 'approve' | 'deny';
  resourceId?: string;
  permission?: PermissionBits;
  result: 'allowed' | 'denied';
  reason?: string;
  context?: AccessContext;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

// ==================== 合规性 ====================

export interface ComplianceFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  description: string;
  affectedEntities: string[];
  recommendation?: string;
  remediated: boolean;
}

export interface ComplianceReport {
  id: string;
  reportType: 'SOX' | 'GDPR' | 'HIPAA' | 'SOC2' | 'custom';
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  generatedAt: Date;
  generatedBy: string;
  findings: ComplianceFinding[];
  status: 'pass' | 'fail' | 'warning';
  metadata: Record<string, any>;
}

// ==================== 权限推荐 ====================

export interface PermissionRecommendation {
  id: string;
  userId: string;
  recommendationType: 'role_based' | 'peer_based' | 'usage_based' | 'anomaly';
  suggestedPermissions: {
    resourceId: string;
    permissions: PermissionBits;
    confidence: number;
    reason: string;
  }[];
  generatedAt: Date;
  appliedAt?: Date;
  appliedBy?: string;
  status: 'pending' | 'applied' | 'rejected' | 'expired';
}

// ==================== 权限模拟 ====================

export interface SimulationImpact {
  affectedUsers: number;
  affectedResources: number;
  newConflicts: PermissionConflict[];
  resolvedConflicts: string[];
  complianceImpact: {
    beforeStatus: string;
    afterStatus: string;
    newViolations: number;
  };
  recommendations: string[];
}

export interface PermissionSimulation {
  id: string;
  simulationType: 'user_grant' | 'user_revoke' | 'policy_change' | 'org_change';
  targetEntityType: 'user' | 'group' | 'resource' | 'policy';
  targetEntityId: string;
  proposedChanges: any;
  impact: SimulationImpact;
  runAt: Date;
  runBy: string;
}
