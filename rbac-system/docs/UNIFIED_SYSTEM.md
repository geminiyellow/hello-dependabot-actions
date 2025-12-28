# 统一权限管理系统 (Unified Permission System)

## 概述

这是一个集成了所有高级权限场景的统一权限管理系统，将 RBAC、ABAC、数据级权限、字段级权限、临时权限、SOD、审批流程等所有功能整合到一个系统中。

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Permission Request                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Unified Permission Engine                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  1. Context Collection (ABAC)                          │ │
│  │     - User attributes, Device, Time, Location          │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  2. Hierarchical Permission Check (RBAC)               │ │
│  │     - Blacklist → Whitelist → Resource → User → Group  │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  3. Dynamic Permission Check                           │ │
│  │     - Owner, Creator, Participant relationships        │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  4. Conditional Permission Check                       │ │
│  │     - Resource state, workflow stage                   │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  5. Temporal Permission Check                          │ │
│  │     - Temporary grants, delegation, expiration         │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  6. SOD Constraint Check                               │ │
│  │     - Conflict detection, segregation rules            │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  7. Hierarchical Resource Permission                   │ │
│  │     - Inheritance, propagation                         │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  8. Data-Level Filtering (RLS)                         │ │
│  │     - Row-level security filters                       │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  9. Field-Level Filtering (CLS)                        │ │
│  │     - Column masking, field restrictions               │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  10. Cache Layer                                       │ │
│  │      - Multi-level caching, invalidation               │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  11. Audit & Compliance                                │ │
│  │      - Logging, reporting, compliance checks           │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    ┌──────────────────┐
                    │ Permission Result │
                    │ + Data Filters    │
                    │ + Field Masks     │
                    └──────────────────┘
```

## 核心功能模块

### 1. 基础 RBAC (已实现)
- 5层权限层级：Tenant → Group → User → Resource → Blacklist/Whitelist
- 权限优先级规则
- 位运算权限标志

### 2. ABAC - 属性基础访问控制 (已实现)
- 上下文感知权限
- 时间、地点、设备属性
- 动态策略评估

### 3. 数据级权限 - RLS (已实现)
- SQL 过滤器生成
- 多租户数据隔离
- 部门/区域数据限制

### 4. 字段级权限 - CLS (已实现)
- 字段可见性控制
- 数据脱敏（部分/完全/哈希）
- 动态字段过滤

### 5. 临时权限与委托 (已实现)
- 时间限制的权限授予
- 权限委托机制
- 自动过期和清理

### 6. SOD - 职责分离 (已实现)
- 冲突权限检测
- 业务规则约束
- 合规性检查

### 7. 审批工作流 (已实现)
- 多级审批流程
- 权限申请/批准
- 自动升级机制

### 8. 跨系统权限 (已实现)
- SSO 集成
- OAuth 授权
- 联邦身份管理

### 9. 性能优化 (已实现)
- 预计算权限
- 位图索引
- 分布式缓存

### 10. 资源层级与继承 (新增)
- 树形资源结构
- 权限继承规则
- 权限覆盖机制

### 11. 动态权限 (新增)
- 基于关系的权限（所有者、创建者、参与者）
- 运行时权限计算
- 关系图权限

### 12. 条件权限 (新增)
- 基于资源状态的权限
- 工作流阶段权限
- 生命周期权限

### 13. 权限传播 (新增)
- 权限变更级联
- 批量更新优化
- 增量传播

### 14. 冲突检测与解决 (新增)
- 权限冲突识别
- 自动解决策略
- 冲突报告

### 15. 权限模拟 (新增)
- What-if 分析
- 权限影响预测
- 安全性评估

### 16. 版本控制 (新增)
- 权限变更历史
- 回滚机制
- 审计追踪

### 17. 批量操作 (新增)
- 批量权限授予/撤销
- 批量用户导入
- 性能优化

### 18. 导入导出 (新增)
- 权限模板
- 跨系统迁移
- 备份恢复

### 19. 合规性报告 (新增)
- SOX 合规
- GDPR 合规
- 自动化报告生成

### 20. 可视化 (新增)
- 权限矩阵
- 权限树
- 关系图谱

### 21. 智能推荐 (新增)
- 基于角色的权限推荐
- 异常检测
- 权限优化建议

## 数据模型

### 完整的统一数据模型

```typescript
// ==================== 基础实体 ====================

interface Tenant {
  id: string;
  name: string;
  defaultPermissions: PermissionBits;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface Group {
  id: string;
  tenantId: string;
  name: string;
  parentGroupId?: string; // 支持组层级
  permissions: PermissionBits;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface User {
  id: string;
  tenantId: string;
  groupIds: string[];
  username: string;
  email: string;
  permissions: PermissionBits;
  attributes: UserAttributes; // ABAC
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

interface UserAttributes {
  department: string;
  jobTitle: string;
  securityLevel: number;
  location: string;
  employeeType: 'full-time' | 'contractor' | 'intern';
  manager?: string;
  [key: string]: any;
}

// ==================== 资源管理 ====================

interface Resource {
  id: string;
  tenantId: string;
  type: string; // 'document', 'api', 'database', 'folder' 等
  name: string;
  parentResourceId?: string; // 支持资源层级
  ownerId: string; // 资源所有者
  creatorId: string; // 资源创建者
  state: ResourceState; // 资源状态（用于条件权限）
  attributes: ResourceAttributes; // ABAC
  permissions: PermissionBits;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface ResourceState {
  status: 'draft' | 'pending_review' | 'approved' | 'published' | 'archived';
  workflowStage?: string;
  version: number;
  lockedBy?: string;
  lockedUntil?: Date;
}

interface ResourceAttributes {
  classification: 'public' | 'internal' | 'confidential' | 'secret';
  dataCategory: string[];
  compliance: string[]; // GDPR, SOX, HIPAA 等
  region: string;
  [key: string]: any;
}

// ==================== 资源层级与继承 ====================

interface ResourceHierarchy {
  resourceId: string;
  parentResourceId: string;
  inheritPermissions: boolean; // 是否继承父资源权限
  overridePermissions?: PermissionBits; // 覆盖的权限
  depth: number; // 层级深度（优化查询）
  path: string; // 路径（如 "/folder1/folder2/file"）
}

// ==================== 权限授予 ====================

interface ResourcePermission {
  id: string;
  resourceId: string;
  subjectType: 'user' | 'group';
  subjectId: string;
  permissions: PermissionBits;
  source: 'direct' | 'inherited' | 'role' | 'dynamic'; // 权限来源
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface AccessControl {
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

// ==================== 动态权限（基于关系） ====================

interface DynamicPermission {
  id: string;
  resourceType: string;
  relationship: 'owner' | 'creator' | 'participant' | 'reviewer' | 'approver' | string;
  permissions: PermissionBits;
  description: string;
  createdAt: Date;
}

interface ResourceRelationship {
  id: string;
  resourceId: string;
  userId: string;
  relationship: string; // 对应 DynamicPermission.relationship
  metadata?: Record<string, any>;
  createdAt: Date;
}

// ==================== ABAC 策略 ====================

interface ABACPolicy {
  id: string;
  name: string;
  description: string;
  priority: number;
  resourceType?: string; // 应用的资源类型
  conditions: PolicyCondition[];
  effect: 'allow' | 'deny';
  permissions: PermissionBits;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface PolicyCondition {
  field: string; // 如 'user.department', 'resource.classification', 'context.time'
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater_than' | 'less_than' | 'matches' | 'between';
  value: any;
  logicalOperator?: 'AND' | 'OR'; // 与下一个条件的关系
}

// ==================== 临时权限与委托 ====================

interface TemporaryPermission {
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

interface PermissionDelegation {
  id: string;
  delegatorId: string; // 委托人
  delegateeId: string; // 被委托人
  resourceId?: string; // 可选，特定资源
  permissions: PermissionBits;
  startDate: Date;
  endDate: Date;
  requireApproval: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  status: 'pending' | 'active' | 'expired' | 'revoked';
  createdAt: Date;
}

// ==================== SOD 约束 ====================

interface SODConstraint {
  id: string;
  name: string;
  description: string;
  constraintType: 'role_conflict' | 'permission_conflict' | 'resource_conflict';
  conflictingPermissions: PermissionBits[];
  conflictingRoles?: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: 'warn' | 'block';
  enabled: boolean;
  createdAt: Date;
}

interface SODViolation {
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

// ==================== 审批工作流 ====================

interface ApprovalWorkflow {
  id: string;
  name: string;
  resourceType?: string;
  permissionThreshold: PermissionBits; // 需要审批的权限阈值
  stages: ApprovalStage[];
  autoEscalationHours?: number;
  enabled: boolean;
  createdAt: Date;
}

interface ApprovalStage {
  stageNumber: number;
  name: string;
  approverType: 'specific_user' | 'role' | 'manager' | 'resource_owner';
  approverIds?: string[];
  requiredApprovals: number; // 需要多少人批准
  timeoutHours?: number;
  onTimeout: 'escalate' | 'reject' | 'approve';
}

interface PermissionRequest {
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

interface Approval {
  stageNumber: number;
  approverId: string;
  decision: 'approved' | 'rejected';
  comments?: string;
  decidedAt: Date;
}

// ==================== 数据级权限（RLS） ====================

interface DataLevelPolicy {
  id: string;
  name: string;
  resourceType: string; // 应用的资源/表类型
  field: string; // 过滤字段，如 'tenantId', 'departmentId', 'region'
  filterType: 'equals' | 'in' | 'user_attribute' | 'custom';
  filterValue?: any; // 静态值
  userAttributeField?: string; // 用户属性字段，如 'user.department'
  customFilter?: string; // 自定义 SQL 片段
  priority: number;
  enabled: boolean;
  createdAt: Date;
}

// ==================== 字段级权限（CLS） ====================

interface FieldLevelPolicy {
  id: string;
  name: string;
  resourceType: string;
  fieldName: string;
  requiredPermission: PermissionBits;
  maskingRule?: MaskingRule;
  userGroups?: string[]; // 应用的用户组
  priority: number;
  enabled: boolean;
  createdAt: Date;
}

interface MaskingRule {
  type: 'none' | 'full' | 'partial' | 'hash' | 'custom';
  partialMaskConfig?: {
    keepPrefix: number;
    keepSuffix: number;
    maskChar: string;
  };
  customFunction?: string; // 自定义脱敏函数名
}

// ==================== 权限版本控制 ====================

interface PermissionVersion {
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

// ==================== 权限冲突 ====================

interface PermissionConflict {
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

// ==================== 审计日志 ====================

interface AuditLog {
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

interface AccessContext {
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

// ==================== 合规性 ====================

interface ComplianceReport {
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

interface ComplianceFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  description: string;
  affectedEntities: string[];
  recommendation?: string;
  remediated: boolean;
}

// ==================== 权限推荐 ====================

interface PermissionRecommendation {
  id: string;
  userId: string;
  recommendationType: 'role_based' | 'peer_based' | 'usage_based' | 'anomaly';
  suggestedPermissions: {
    resourceId: string;
    permissions: PermissionBits;
    confidence: number; // 0-1
    reason: string;
  }[];
  generatedAt: Date;
  appliedAt?: Date;
  appliedBy?: string;
  status: 'pending' | 'applied' | 'rejected' | 'expired';
}

// ==================== 权限模拟 ====================

interface PermissionSimulation {
  id: string;
  simulationType: 'user_grant' | 'user_revoke' | 'policy_change' | 'org_change';
  targetEntityType: 'user' | 'group' | 'resource' | 'policy';
  targetEntityId: string;
  proposedChanges: any;
  impact: SimulationImpact;
  runAt: Date;
  runBy: string;
}

interface SimulationImpact {
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

// ==================== 权限标志 ====================

enum PermissionFlags {
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

type PermissionBits = number;
```

## 数据库 Schema (PostgreSQL)

```sql
-- ==================== 基础表 ====================

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    default_permissions INTEGER NOT NULL DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    permissions INTEGER NOT NULL DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_groups_tenant ON groups(tenant_id);
CREATE INDEX idx_groups_parent ON groups(parent_group_id);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    permissions INTEGER NOT NULL DEFAULT 0,
    attributes JSONB NOT NULL DEFAULT '{}',
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMP,
    UNIQUE(tenant_id, username),
    UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_attributes ON users USING gin(attributes);

CREATE TABLE user_groups (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY(user_id, group_id)
);

CREATE INDEX idx_user_groups_user ON user_groups(user_id);
CREATE INDEX idx_user_groups_group ON user_groups(group_id);

CREATE TABLE resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_resource_id UUID REFERENCES resources(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id),
    creator_id UUID NOT NULL REFERENCES users(id),
    state JSONB NOT NULL DEFAULT '{"status": "draft", "version": 1}',
    attributes JSONB NOT NULL DEFAULT '{}',
    permissions INTEGER NOT NULL DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_resources_tenant ON resources(tenant_id);
CREATE INDEX idx_resources_type ON resources(type);
CREATE INDEX idx_resources_owner ON resources(owner_id);
CREATE INDEX idx_resources_creator ON resources(creator_id);
CREATE INDEX idx_resources_parent ON resources(parent_resource_id);
CREATE INDEX idx_resources_state ON resources USING gin(state);
CREATE INDEX idx_resources_attributes ON resources USING gin(attributes);

-- ==================== 资源层级 ====================

CREATE TABLE resource_hierarchy (
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    parent_resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    inherit_permissions BOOLEAN NOT NULL DEFAULT true,
    override_permissions INTEGER,
    depth INTEGER NOT NULL,
    path TEXT NOT NULL,
    PRIMARY KEY(resource_id, parent_resource_id)
);

CREATE INDEX idx_resource_hierarchy_resource ON resource_hierarchy(resource_id);
CREATE INDEX idx_resource_hierarchy_parent ON resource_hierarchy(parent_resource_id);
CREATE INDEX idx_resource_hierarchy_path ON resource_hierarchy(path);

-- ==================== 权限授予 ====================

CREATE TABLE resource_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    subject_type VARCHAR(20) NOT NULL CHECK (subject_type IN ('user', 'group')),
    subject_id UUID NOT NULL,
    permissions INTEGER NOT NULL,
    source VARCHAR(20) NOT NULL CHECK (source IN ('direct', 'inherited', 'role', 'dynamic')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_resource_permissions_resource ON resource_permissions(resource_id);
CREATE INDEX idx_resource_permissions_subject ON resource_permissions(subject_type, subject_id);
CREATE INDEX idx_resource_permissions_source ON resource_permissions(source);

CREATE TABLE access_control (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    control_type VARCHAR(20) NOT NULL CHECK (control_type IN ('blacklist', 'whitelist')),
    permissions INTEGER NOT NULL,
    reason TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP
);

CREATE INDEX idx_access_control_resource ON access_control(resource_id);
CREATE INDEX idx_access_control_user ON access_control(user_id);
CREATE INDEX idx_access_control_type ON access_control(control_type);
CREATE INDEX idx_access_control_expires ON access_control(expires_at) WHERE expires_at IS NOT NULL;

-- ==================== 动态权限 ====================

CREATE TABLE dynamic_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(100) NOT NULL,
    relationship VARCHAR(100) NOT NULL,
    permissions INTEGER NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(resource_type, relationship)
);

CREATE INDEX idx_dynamic_permissions_type ON dynamic_permissions(resource_type);

CREATE TABLE resource_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    relationship VARCHAR(100) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(resource_id, user_id, relationship)
);

CREATE INDEX idx_resource_relationships_resource ON resource_relationships(resource_id);
CREATE INDEX idx_resource_relationships_user ON resource_relationships(user_id);
CREATE INDEX idx_resource_relationships_type ON resource_relationships(relationship);

-- ==================== ABAC 策略 ====================

CREATE TABLE abac_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    resource_type VARCHAR(100),
    conditions JSONB NOT NULL,
    effect VARCHAR(10) NOT NULL CHECK (effect IN ('allow', 'deny')),
    permissions INTEGER NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_abac_policies_type ON abac_policies(resource_type);
CREATE INDEX idx_abac_policies_enabled ON abac_policies(enabled);
CREATE INDEX idx_abac_policies_priority ON abac_policies(priority DESC);

-- ==================== 临时权限 ====================

CREATE TABLE temporary_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    permissions INTEGER NOT NULL,
    granted_by UUID NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    auto_revoke BOOLEAN NOT NULL DEFAULT true,
    revoked BOOLEAN NOT NULL DEFAULT false,
    revoked_at TIMESTAMP,
    revoked_by UUID REFERENCES users(id)
);

CREATE INDEX idx_temporary_permissions_user ON temporary_permissions(user_id);
CREATE INDEX idx_temporary_permissions_resource ON temporary_permissions(resource_id);
CREATE INDEX idx_temporary_permissions_expires ON temporary_permissions(expires_at);
CREATE INDEX idx_temporary_permissions_active ON temporary_permissions(user_id, resource_id) WHERE NOT revoked AND expires_at > NOW();

CREATE TABLE permission_delegations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delegator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delegatee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_id UUID REFERENCES resources(id) ON DELETE CASCADE,
    permissions INTEGER NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    require_approval BOOLEAN NOT NULL DEFAULT false,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'active', 'expired', 'revoked')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delegations_delegator ON permission_delegations(delegator_id);
CREATE INDEX idx_delegations_delegatee ON permission_delegations(delegatee_id);
CREATE INDEX idx_delegations_status ON permission_delegations(status);
CREATE INDEX idx_delegations_active ON permission_delegations(delegatee_id, status) WHERE status = 'active';

-- ==================== SOD 约束 ====================

CREATE TABLE sod_constraints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    constraint_type VARCHAR(50) NOT NULL,
    conflicting_permissions INTEGER[],
    conflicting_roles UUID[],
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    action VARCHAR(10) NOT NULL CHECK (action IN ('warn', 'block')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sod_constraints_enabled ON sod_constraints(enabled);
CREATE INDEX idx_sod_constraints_type ON sod_constraints(constraint_type);

CREATE TABLE sod_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    constraint_id UUID NOT NULL REFERENCES sod_constraints(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    violation_type VARCHAR(100) NOT NULL,
    details JSONB NOT NULL,
    detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES users(id),
    resolution TEXT
);

CREATE INDEX idx_sod_violations_constraint ON sod_violations(constraint_id);
CREATE INDEX idx_sod_violations_user ON sod_violations(user_id);
CREATE INDEX idx_sod_violations_resolved ON sod_violations(resolved);

-- ==================== 审批工作流 ====================

CREATE TABLE approval_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100),
    permission_threshold INTEGER NOT NULL,
    stages JSONB NOT NULL,
    auto_escalation_hours INTEGER,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_approval_workflows_type ON approval_workflows(resource_type);
CREATE INDEX idx_approval_workflows_enabled ON approval_workflows(enabled);

CREATE TABLE permission_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    requested_permissions INTEGER NOT NULL,
    reason TEXT NOT NULL,
    workflow_id UUID REFERENCES approval_workflows(id),
    current_stage INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'escalated', 'expired')),
    approvals JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMP,
    expires_at TIMESTAMP
);

CREATE INDEX idx_permission_requests_user ON permission_requests(user_id);
CREATE INDEX idx_permission_requests_resource ON permission_requests(resource_id);
CREATE INDEX idx_permission_requests_status ON permission_requests(status);
CREATE INDEX idx_permission_requests_pending ON permission_requests(status, created_at) WHERE status = 'pending';

-- ==================== 数据级权限 ====================

CREATE TABLE data_level_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    field VARCHAR(100) NOT NULL,
    filter_type VARCHAR(50) NOT NULL,
    filter_value JSONB,
    user_attribute_field VARCHAR(100),
    custom_filter TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_level_policies_type ON data_level_policies(resource_type);
CREATE INDEX idx_data_level_policies_enabled ON data_level_policies(enabled);

-- ==================== 字段级权限 ====================

CREATE TABLE field_level_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    required_permission INTEGER NOT NULL,
    masking_rule JSONB,
    user_groups UUID[],
    priority INTEGER NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_field_level_policies_type ON field_level_policies(resource_type);
CREATE INDEX idx_field_level_policies_enabled ON field_level_policies(enabled);

-- ==================== 版本控制 ====================

CREATE TABLE permission_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    version INTEGER NOT NULL,
    change_type VARCHAR(20) NOT NULL,
    previous_state JSONB,
    new_state JSONB NOT NULL,
    changed_by UUID NOT NULL REFERENCES users(id),
    change_reason TEXT,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    can_rollback BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_permission_versions_entity ON permission_versions(entity_type, entity_id);
CREATE INDEX idx_permission_versions_timestamp ON permission_versions(timestamp DESC);
CREATE INDEX idx_permission_versions_changed_by ON permission_versions(changed_by);

-- ==================== 冲突检测 ====================

CREATE TABLE permission_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conflict_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    entities JSONB NOT NULL,
    description TEXT NOT NULL,
    detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
    auto_resolvable BOOLEAN NOT NULL DEFAULT false,
    suggested_resolution TEXT,
    resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES users(id)
);

CREATE INDEX idx_permission_conflicts_type ON permission_conflicts(conflict_type);
CREATE INDEX idx_permission_conflicts_severity ON permission_conflicts(severity);
CREATE INDEX idx_permission_conflicts_resolved ON permission_conflicts(resolved);

-- ==================== 审计日志 ====================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    resource_id UUID REFERENCES resources(id) ON DELETE SET NULL,
    permission INTEGER,
    result VARCHAR(20) NOT NULL,
    reason TEXT,
    context JSONB,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB
);

CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_result ON audit_logs(result);

-- 分区审计日志表（按月）
CREATE TABLE audit_logs_partitioned (
    LIKE audit_logs INCLUDING ALL
) PARTITION BY RANGE (timestamp);

-- ==================== 合规性 ====================

CREATE TABLE compliance_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type VARCHAR(50) NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    generated_by UUID NOT NULL REFERENCES users(id),
    findings JSONB NOT NULL,
    status VARCHAR(20) NOT NULL,
    metadata JSONB
);

CREATE INDEX idx_compliance_reports_tenant ON compliance_reports(tenant_id);
CREATE INDEX idx_compliance_reports_type ON compliance_reports(report_type);
CREATE INDEX idx_compliance_reports_generated ON compliance_reports(generated_at DESC);

-- ==================== 权限推荐 ====================

CREATE TABLE permission_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recommendation_type VARCHAR(50) NOT NULL,
    suggested_permissions JSONB NOT NULL,
    generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    applied_at TIMESTAMP,
    applied_by UUID REFERENCES users(id),
    status VARCHAR(20) NOT NULL
);

CREATE INDEX idx_permission_recommendations_user ON permission_recommendations(user_id);
CREATE INDEX idx_permission_recommendations_status ON permission_recommendations(status);

-- ==================== 权限模拟 ====================

CREATE TABLE permission_simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_type VARCHAR(50) NOT NULL,
    target_entity_type VARCHAR(50) NOT NULL,
    target_entity_id UUID NOT NULL,
    proposed_changes JSONB NOT NULL,
    impact JSONB NOT NULL,
    run_at TIMESTAMP NOT NULL DEFAULT NOW(),
    run_by UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_permission_simulations_target ON permission_simulations(target_entity_type, target_entity_id);
CREATE INDEX idx_permission_simulations_run_by ON permission_simulations(run_by);
```

## 补充场景说明

除了上述已实现的功能，系统还支持以下高级场景：

### 22. 权限预计算与缓存

对于频繁访问的权限检查，系统支持预计算和多级缓存：

```typescript
interface PrecomputedPermission {
  userId: string;
  resourceId: string;
  effectivePermissions: PermissionBits;
  computedAt: Date;
  expiresAt: Date;
  dependencies: string[]; // 影响该权限的因素
}

class PermissionPrecomputer {
  /**
   * 预计算用户对资源的权限
   */
  async precomputePermissions(userId: string, resourceIds: string[]): Promise<void> {
    for (const resourceId of resourceIds) {
      const result = await engine.checkPermission(userId, resourceId, PermissionFlags.NONE);

      // 存储预计算结果
      await cache.set(
        `perm:${userId}:${resourceId}`,
        result.effectivePermissions,
        TTL
      );
    }
  }

  /**
   * 智能缓存失效
   */
  async invalidateCache(changeEvent: PermissionChangeEvent): Promise<void> {
    switch (changeEvent.type) {
      case 'user_group_change':
        // 使该用户的所有权限缓存失效
        await cache.deletePattern(`perm:${changeEvent.userId}:*`);
        break;
      case 'resource_permission_change':
        // 使该资源的所有权限缓存失效
        await cache.deletePattern(`perm:*:${changeEvent.resourceId}`);
        break;
      case 'policy_change':
        // 使所有受影响的缓存失效
        await cache.flush();
        break;
    }
  }
}
```

### 23. 权限继承策略

系统支持多种权限继承策略：

```typescript
enum InheritanceStrategy {
  ADDITIVE = 'additive',         // 累加所有父级权限
  OVERRIDE = 'override',          // 子级完全覆盖父级
  MERGE_WITH_DENY = 'merge_deny', // 合并，但拒绝优先
  CLOSEST_WINS = 'closest_wins',  // 最近的父级生效
}

interface ResourceHierarchyConfig {
  resourceId: string;
  inheritanceStrategy: InheritanceStrategy;
  inheritFromParent: boolean;
  maxInheritanceDepth?: number; // 最大继承层级
}

// 示例：文件夹权限继承
// /projects (READ for all)
//   /project-a (inherited READ + WRITE for team-a)
//     /docs (inherited READ + WRITE)
//       /secret.md (OVERRIDE: only owner can READ)
```

### 24. 权限委托链

支持多级权限委托：

```typescript
interface DelegationChain {
  originalOwner: string;
  delegationPath: {
    fromUser: string;
    toUser: string;
    permissions: PermissionBits;
    delegatedAt: Date;
    canRedelegate: boolean;
  }[];
  currentHolder: string;
  maxChainLength: number; // 最大委托层级
}

// 示例：Alice → Bob → Charlie
// Alice 委托 READ 权限给 Bob (可再委托)
// Bob 委托 READ 权限给 Charlie (不可再委托)
// Charlie 可以读取资源，但不能再委托给其他人
```

### 25. 权限申请自动化

基于规则的权限自动审批：

```typescript
interface AutoApprovalRule {
  id: string;
  name: string;
  conditions: {
    requestedPermission: PermissionBits;
    userAttributes?: Record<string, any>;
    resourceAttributes?: Record<string, any>;
    timeConstraints?: {
      maxDuration: number; // 最长授权时间
      allowedHours?: string; // "09:00-18:00"
    };
  };
  action: 'auto_approve' | 'auto_reject' | 'require_approval';
  grantDuration?: number; // 自动授权的时长
}

// 示例：
// - 同部门用户请求 READ 权限 → 自动批准（24小时）
// - 跨部门用户请求 WRITE 权限 → 需要批准
// - 实习生请求 ADMIN 权限 → 自动拒绝
```

### 26. 风险评分系统

为权限授予计算风险评分：

```typescript
interface PermissionRiskAssessment {
  riskScore: number; // 0-100
  factors: {
    factor: string;
    weight: number;
    score: number;
  }[];
  recommendation: 'approve' | 'review' | 'deny';
  requiredApprovers: number; // 基于风险的审批人数
}

class RiskAssessor {
  async assessPermissionRequest(
    userId: string,
    resourceId: string,
    requestedPermission: PermissionBits
  ): Promise<PermissionRiskAssessment> {
    let totalScore = 0;
    const factors = [];

    // 因素1：资源敏感度
    const resource = await getResource(resourceId);
    const sensitivityScore = this.getResourceSensitivity(resource);
    factors.push({ factor: 'Resource Sensitivity', weight: 0.4, score: sensitivityScore });
    totalScore += sensitivityScore * 0.4;

    // 因素2：权限级别
    const permissionLevel = this.getPermissionLevel(requestedPermission);
    factors.push({ factor: 'Permission Level', weight: 0.3, score: permissionLevel });
    totalScore += permissionLevel * 0.3;

    // 因素3：用户信任度
    const trustScore = await this.getUserTrustScore(userId);
    factors.push({ factor: 'User Trust', weight: 0.2, score: 100 - trustScore });
    totalScore += (100 - trustScore) * 0.2;

    // 因素4：异常检测
    const anomalyScore = await this.detectAnomaly(userId, resourceId);
    factors.push({ factor: 'Anomaly Detection', weight: 0.1, score: anomalyScore });
    totalScore += anomalyScore * 0.1;

    // 决策规则
    let recommendation: 'approve' | 'review' | 'deny';
    let requiredApprovers = 1;

    if (totalScore < 30) {
      recommendation = 'approve';
      requiredApprovers = 1;
    } else if (totalScore < 70) {
      recommendation = 'review';
      requiredApprovers = 2;
    } else {
      recommendation = 'deny';
      requiredApprovers = 3;
    }

    return {
      riskScore: totalScore,
      factors,
      recommendation,
      requiredApprovers,
    };
  }
}
```

### 27. 权限使用分析

追踪和分析权限的实际使用情况：

```typescript
interface PermissionUsageAnalytics {
  userId: string;
  grantedPermissions: PermissionBits;
  usedPermissions: PermissionBits;
  unusedPermissions: PermissionBits;
  usageRate: number; // 0-1
  lastUsed: Map<PermissionBits, Date>;
  accessPatterns: {
    resourceType: string;
    frequency: number;
    avgDuration: number;
    timeOfDay: string[];
  }[];
}

class PermissionAnalyzer {
  /**
   * 识别过度授权
   */
  async findOverprivilegedUsers(): Promise<{
    userId: string;
    unnecessaryPermissions: PermissionBits;
    recommendation: string;
  }[]> {
    const users = await getAllUsers();
    const overprivileged = [];

    for (const user of users) {
      const analytics = await this.analyzeUserPermissions(user.id);

      // 如果有权限超过90天未使用
      if (analytics.usageRate < 0.3 && analytics.unusedPermissions > 0) {
        overprivileged.push({
          userId: user.id,
          unnecessaryPermissions: analytics.unusedPermissions,
          recommendation: `Revoke unused permissions: ${this.describePermissions(analytics.unusedPermissions)}`,
        });
      }
    }

    return overprivileged;
  }

  /**
   * 识别权限不足
   */
  async findUnderprivilegedUsers(): Promise<{
    userId: string;
    frequentlyDeniedPermissions: PermissionBits;
    recommendation: string;
  }[]> {
    // 分析审计日志，找出经常被拒绝的权限请求
    const deniedRequests = await this.analyzeDeniedRequests();

    return deniedRequests
      .filter(req => req.denialCount > 5 && req.lastDenialRecent)
      .map(req => ({
        userId: req.userId,
        frequentlyDeniedPermissions: req.permission,
        recommendation: `Consider granting ${this.describePermissions(req.permission)}`,
      }));
  }
}
```

### 28. 时间窗口权限

基于时间窗口的权限控制：

```typescript
interface TimeWindowPermission {
  id: string;
  userId: string;
  resourceId: string;
  permissions: PermissionBits;
  timeWindows: {
    dayOfWeek: number[]; // 0-6 (Sunday-Saturday)
    startTime: string;    // "09:00"
    endTime: string;      // "17:00"
    timezone: string;     // "America/New_York"
  }[];
  exceptionDates?: {
    date: string;         // "2024-12-25"
    allowed: boolean;     // 这一天是否允许
  }[];
}

// 示例：
// - 工作日 9:00-17:00 可以访问
// - 周末禁止访问
// - 假期例外（如圣诞节禁止）
```

### 29. 地理围栏权限

基于地理位置的权限控制：

```typescript
interface GeofencePermission {
  id: string;
  name: string;
  allowedRegions: {
    type: 'country' | 'region' | 'ip_range' | 'coordinates';
    value: string | { lat: number; lng: number; radius: number };
  }[];
  deniedRegions?: {
    type: 'country' | 'region' | 'ip_range';
    value: string;
  }[];
  permissions: PermissionBits;
}

// 示例：
// - 机密文档只能在公司 IP 范围内访问
// - 财务数据只能在美国境内访问
// - 某些资源禁止从高风险国家访问
```

### 30. 设备绑定权限

将权限绑定到特定设备：

```typescript
interface DeviceBinding {
  id: string;
  userId: string;
  deviceFingerprint: string; // 设备指纹
  deviceType: 'desktop' | 'mobile' | 'tablet';
  trustedDevice: boolean;
  permissions: PermissionBits; // 该设备上允许的权限
  registeredAt: Date;
  lastSeenAt: Date;
}

// 示例：
// - ADMIN 权限只能在受信任的设备上使用
// - 移动设备上限制某些敏感操作
// - 新设备需要二次验证
```

### 31. 会话权限

基于会话的临时权限提升：

```typescript
interface SessionPermission {
  sessionId: string;
  userId: string;
  elevatedPermissions: PermissionBits;
  reason: string;
  approvedBy?: string;
  startTime: Date;
  maxDuration: number; // 秒
  requiresReauth: boolean; // 是否需要重新认证
  mfaVerified: boolean;
}

// 示例：
// - 用户请求临时 ADMIN 权限进行紧急操作
// - 需要 MFA 验证
// - 权限提升仅在当前会话有效
// - 最长持续30分钟
```

### 32. 批量操作权限控制

控制批量操作的权限：

```typescript
interface BatchOperationPolicy {
  operation: string; // "bulk_delete", "bulk_update"
  maxItems: number; // 单次最多操作多少项
  requiresApproval: boolean;
  approvalThreshold: number; // 超过多少项需要审批
  rateLimiting: {
    maxOperationsPerHour: number;
    maxItemsPerDay: number;
  };
}

// 示例：
// - 批量删除超过100项需要审批
// - 每小时最多执行5次批量操作
// - 每天最多批量操作1000项资源
```

### 33. 权限调试和模拟工具

帮助管理员调试权限问题：

```typescript
class PermissionDebugger {
  /**
   * 解释为什么用户有/没有权限
   */
  async explainPermission(
    userId: string,
    resourceId: string,
    permission: PermissionBits
  ): Promise<{
    hasPermission: boolean;
    grantedBy: string[]; // 权限来源
    deniedBy: string[];  // 拒绝原因
    explanation: string;
    decisionTree: DecisionNode[];
  }> {
    // 返回详细的权限决策路径
  }

  /**
   * 模拟权限变更的影响
   */
  async simulatePermissionChange(
    change: PermissionChange
  ): Promise<{
    affectedUsers: number;
    affectedResources: number;
    wouldBeAllowed: string[]; // 变更后会被允许的操作
    wouldBeDenied: string[];  // 变更后会被拒绝的操作
    risks: string[];
  }> {
    // 模拟变更影响
  }

  /**
   * 比较两个用户的权限
   */
  async compareUsers(userId1: string, userId2: string): Promise<{
    commonPermissions: PermissionBits;
    user1Only: PermissionBits;
    user2Only: PermissionBits;
    differences: string[];
  }> {
    // 比较用户权限差异
  }
}
```

## 实现优先级建议

根据实际需求，建议按以下优先级实现：

**第一阶段（核心功能）- 已完成 ✓**
1. RBAC 基础层级
2. ABAC 策略引擎
3. 动态权限（基于关系）
4. 黑白名单
5. 审计日志

**第二阶段（高级功能）- 已完成 ✓**
6. 临时权限和委托
7. SOD 约束
8. 数据级权限（RLS）
9. 字段级权限（CLS）
10. 审批工作流

**第三阶段（优化功能）**
11. 权限预计算和缓存
12. 资源层级继承
13. 条件权限
14. 批量操作
15. 权限分析工具

**第四阶段（扩展功能）**
16. 风险评分
17. 时间窗口/地理围栏
18. 设备绑定
19. 权限推荐
20. 权限模拟工具

**第五阶段（合规和报告）**
21. 合规性报告
22. 权限可视化
23. 权限导入导出
24. 版本控制和回滚

## 性能优化策略

### 数据库优化

```sql
-- 复合索引优化权限查询
CREATE INDEX idx_permission_lookup ON resource_permissions(resource_id, subject_type, subject_id);

-- 分区审计日志表
CREATE TABLE audit_logs_y2024m01 PARTITION OF audit_logs_partitioned
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- 物化视图：用户有效权限
CREATE MATERIALIZED VIEW user_effective_permissions AS
SELECT
  u.id as user_id,
  r.id as resource_id,
  (u.permissions | rp.permissions | gp.permissions) as effective_permissions
FROM users u
CROSS JOIN resources r
LEFT JOIN resource_permissions rp ON rp.resource_id = r.id AND rp.subject_id = u.id
LEFT JOIN user_groups ug ON ug.user_id = u.id
LEFT JOIN resource_permissions gp ON gp.resource_id = r.id AND gp.subject_id = ug.group_id;

-- 定期刷新
REFRESH MATERIALIZED VIEW CONCURRENTLY user_effective_permissions;
```

### 缓存策略

```typescript
// 三级缓存架构
class PermissionCacheManager {
  // L1: 进程内存缓存（最快，TTL 1分钟）
  private l1Cache = new Map<string, CacheEntry>();

  // L2: Redis 缓存（快，TTL 5分钟）
  private l2Cache: Redis;

  // L3: 数据库物化视图（较快，定期刷新）
  private db: Database;

  async getPermission(userId: string, resourceId: string): Promise<PermissionBits | null> {
    const key = `${userId}:${resourceId}`;

    // L1 查找
    const l1Result = this.l1Cache.get(key);
    if (l1Result && !l1Result.isExpired()) {
      return l1Result.value;
    }

    // L2 查找
    const l2Result = await this.l2Cache.get(key);
    if (l2Result) {
      this.l1Cache.set(key, { value: l2Result, expiresAt: Date.now() + 60000 });
      return l2Result;
    }

    // L3 查找（物化视图）
    const l3Result = await this.db.query(
      'SELECT effective_permissions FROM user_effective_permissions WHERE user_id = $1 AND resource_id = $2',
      [userId, resourceId]
    );

    if (l3Result.rows.length > 0) {
      const permissions = l3Result.rows[0].effective_permissions;
      await this.l2Cache.set(key, permissions, 'EX', 300);
      this.l1Cache.set(key, { value: permissions, expiresAt: Date.now() + 60000 });
      return permissions;
    }

    return null;
  }
}
```

## 安全考虑

1. **最小权限原则**: 默认拒绝，显式授权
2. **权限审计**: 所有权限检查和变更都记录日志
3. **权限过期**: 临时权限自动过期，定期审查长期权限
4. **SOD 约束**: 防止权限冲突导致的安全风险
5. **加密存储**: 敏感数据加密存储
6. **安全传输**: API 通信使用 HTTPS/TLS
7. **防重放攻击**: 使用 nonce 和时间戳
8. **审计合规**: 满足 SOX、GDPR、HIPAA 等法规要求

## 总结

这个统一权限管理系统提供了：

✅ **21+ 核心功能模块**，覆盖企业级权限管理的所有场景
✅ **完整的数据模型**，支持复杂的权限关系
✅ **高性能实现**，多级缓存 + 预计算 + 索引优化
✅ **安全合规**，审计日志 + SOD + 风险评分
✅ **易于扩展**，模块化设计，支持自定义策略

系统可以满足从小型应用到大型企业的各种权限管理需求。
