/**
 * 统一权限系统完整示例
 *
 * 展示如何使用集成了所有高级功能的统一权限引擎
 */

import {
  UnifiedPermissionEngine,
  IPermissionDataStore,
  PermissionCheckResult,
} from '../src/unified-permission-engine';
import {
  PermissionFlags,
  PermissionBits,
  User,
  Resource,
  ABACPolicy,
  DynamicPermission,
  TemporaryPermission,
  PermissionDelegation,
  SODConstraint,
  DataLevelPolicy,
  FieldLevelPolicy,
  ResourceHierarchy,
  AuditLog,
  UserAttributes,
  ResourceState,
  ResourceAttributes,
} from '../src/unified-types';

/**
 * 模拟数据存储实现
 */
class MockDataStore implements IPermissionDataStore {
  private users: Map<string, User> = new Map();
  private resources: Map<string, Resource> = new Map();
  private groups: Map<string, { permissions: PermissionBits }> = new Map();
  private userGroups: Map<string, string[]> = new Map();
  private resourcePermissions: Map<string, Map<string, PermissionBits>> = new Map();
  private accessControls: Map<
    string,
    Map<string, { blacklist?: PermissionBits; whitelist?: PermissionBits }>
  > = new Map();
  private abacPolicies: Map<string, ABACPolicy[]> = new Map();
  private dynamicPermissions: Map<string, DynamicPermission[]> = new Map();
  private resourceRelationships: Map<string, Map<string, string[]>> = new Map();
  private temporaryPermissions: Map<string, Map<string, TemporaryPermission[]>> = new Map();
  private delegations: PermissionDelegation[] = [];
  private sodConstraints: SODConstraint[] = [];
  private resourceHierarchies: Map<string, ResourceHierarchy[]> = new Map();
  private dataLevelPolicies: Map<string, DataLevelPolicy[]> = new Map();
  private fieldLevelPolicies: Map<string, FieldLevelPolicy[]> = new Map();
  private auditLogs: AuditLog[] = [];

  // 添加测试数据
  addUser(user: User) {
    this.users.set(user.id, user);
  }

  addResource(resource: Resource) {
    this.resources.set(resource.id, resource);
  }

  addGroup(groupId: string, permissions: PermissionBits) {
    this.groups.set(groupId, { permissions });
  }

  addUserToGroup(userId: string, groupId: string) {
    const groups = this.userGroups.get(userId) || [];
    groups.push(groupId);
    this.userGroups.set(userId, groups);
  }

  addResourcePermission(resourceId: string, userId: string, permissions: PermissionBits) {
    if (!this.resourcePermissions.has(resourceId)) {
      this.resourcePermissions.set(resourceId, new Map());
    }
    this.resourcePermissions.get(resourceId)!.set(userId, permissions);
  }

  addAccessControl(
    resourceId: string,
    userId: string,
    type: 'blacklist' | 'whitelist',
    permissions: PermissionBits
  ) {
    if (!this.accessControls.has(resourceId)) {
      this.accessControls.set(resourceId, new Map());
    }
    const control = this.accessControls.get(resourceId)!.get(userId) || {};
    control[type] = permissions;
    this.accessControls.get(resourceId)!.set(userId, control);
  }

  addABACPolicy(policy: ABACPolicy) {
    const type = policy.resourceType || 'default';
    if (!this.abacPolicies.has(type)) {
      this.abacPolicies.set(type, []);
    }
    this.abacPolicies.get(type)!.push(policy);
  }

  addDynamicPermission(permission: DynamicPermission) {
    if (!this.dynamicPermissions.has(permission.resourceType)) {
      this.dynamicPermissions.set(permission.resourceType, []);
    }
    this.dynamicPermissions.get(permission.resourceType)!.push(permission);
  }

  addResourceRelationship(resourceId: string, userId: string, relationship: string) {
    if (!this.resourceRelationships.has(resourceId)) {
      this.resourceRelationships.set(resourceId, new Map());
    }
    const relationships = this.resourceRelationships.get(resourceId)!.get(userId) || [];
    relationships.push(relationship);
    this.resourceRelationships.get(resourceId)!.set(userId, relationships);
  }

  addTemporaryPermission(permission: TemporaryPermission) {
    if (!this.temporaryPermissions.has(permission.userId)) {
      this.temporaryPermissions.set(permission.userId, new Map());
    }
    const userPerms = this.temporaryPermissions.get(permission.userId)!;
    if (!userPerms.has(permission.resourceId)) {
      userPerms.set(permission.resourceId, []);
    }
    userPerms.get(permission.resourceId)!.push(permission);
  }

  addDelegation(delegation: PermissionDelegation) {
    this.delegations.push(delegation);
  }

  addSODConstraint(constraint: SODConstraint) {
    this.sodConstraints.push(constraint);
  }

  addResourceHierarchy(hierarchy: ResourceHierarchy) {
    if (!this.resourceHierarchies.has(hierarchy.resourceId)) {
      this.resourceHierarchies.set(hierarchy.resourceId, []);
    }
    this.resourceHierarchies.get(hierarchy.resourceId)!.push(hierarchy);
  }

  addDataLevelPolicy(policy: DataLevelPolicy) {
    if (!this.dataLevelPolicies.has(policy.resourceType)) {
      this.dataLevelPolicies.set(policy.resourceType, []);
    }
    this.dataLevelPolicies.get(policy.resourceType)!.push(policy);
  }

  addFieldLevelPolicy(policy: FieldLevelPolicy) {
    if (!this.fieldLevelPolicies.has(policy.resourceType)) {
      this.fieldLevelPolicies.set(policy.resourceType, []);
    }
    this.fieldLevelPolicies.get(policy.resourceType)!.push(policy);
  }

  // IPermissionDataStore 接口实现
  async getUser(userId: string): Promise<User | null> {
    return this.users.get(userId) || null;
  }

  async getResource(resourceId: string): Promise<Resource | null> {
    return this.resources.get(resourceId) || null;
  }

  async getUserGroups(userId: string): Promise<string[]> {
    return this.userGroups.get(userId) || [];
  }

  async getGroupPermissions(groupId: string): Promise<PermissionBits> {
    return this.groups.get(groupId)?.permissions || PermissionFlags.NONE;
  }

  async getResourcePermissions(resourceId: string, userId: string): Promise<PermissionBits> {
    return this.resourcePermissions.get(resourceId)?.get(userId) || PermissionFlags.NONE;
  }

  async getAccessControl(
    resourceId: string,
    userId: string
  ): Promise<{ blacklist?: PermissionBits; whitelist?: PermissionBits }> {
    return this.accessControls.get(resourceId)?.get(userId) || {};
  }

  async getABACPolicies(resourceType: string): Promise<ABACPolicy[]> {
    return this.abacPolicies.get(resourceType) || [];
  }

  async getDynamicPermissions(resourceType: string): Promise<DynamicPermission[]> {
    return this.dynamicPermissions.get(resourceType) || [];
  }

  async getResourceRelationships(resourceId: string, userId: string): Promise<string[]> {
    return this.resourceRelationships.get(resourceId)?.get(userId) || [];
  }

  async getTemporaryPermissions(
    userId: string,
    resourceId: string
  ): Promise<TemporaryPermission[]> {
    return this.temporaryPermissions.get(userId)?.get(resourceId) || [];
  }

  async getActiveDelegations(
    userId: string,
    resourceId?: string
  ): Promise<PermissionDelegation[]> {
    return this.delegations.filter(
      d =>
        d.delegateeId === userId &&
        d.status === 'active' &&
        (!resourceId || d.resourceId === resourceId)
    );
  }

  async getSODConstraints(): Promise<SODConstraint[]> {
    return this.sodConstraints;
  }

  async getResourceHierarchy(resourceId: string): Promise<ResourceHierarchy[]> {
    return this.resourceHierarchies.get(resourceId) || [];
  }

  async getDataLevelPolicies(resourceType: string): Promise<DataLevelPolicy[]> {
    return this.dataLevelPolicies.get(resourceType) || [];
  }

  async getFieldLevelPolicies(resourceType: string): Promise<FieldLevelPolicy[]> {
    return this.fieldLevelPolicies.get(resourceType) || [];
  }

  async saveAuditLog(log: AuditLog): Promise<void> {
    this.auditLogs.push(log);
  }

  getAuditLogs(): AuditLog[] {
    return this.auditLogs;
  }
}

/**
 * 示例场景
 */
async function runExamples() {
  const dataStore = new MockDataStore();
  const engine = new UnifiedPermissionEngine(dataStore);

  // 创建租户
  const tenantId = 'tenant-1';

  // 创建用户
  const alice: User = {
    id: 'user-alice',
    tenantId,
    username: 'alice',
    email: 'alice@example.com',
    groupIds: [],
    permissions: PermissionFlags.NONE,
    attributes: {
      department: 'Engineering',
      jobTitle: 'Senior Developer',
      securityLevel: 3,
      location: 'US',
      employeeType: 'full-time',
    },
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const bob: User = {
    id: 'user-bob',
    tenantId,
    username: 'bob',
    email: 'bob@example.com',
    groupIds: [],
    permissions: PermissionFlags.NONE,
    attributes: {
      department: 'Finance',
      jobTitle: 'Accountant',
      securityLevel: 2,
      location: 'UK',
      employeeType: 'full-time',
    },
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const intern: User = {
    id: 'user-intern',
    tenantId,
    username: 'intern',
    email: 'intern@example.com',
    groupIds: [],
    permissions: PermissionFlags.NONE,
    attributes: {
      department: 'Engineering',
      jobTitle: 'Intern',
      securityLevel: 1,
      location: 'US',
      employeeType: 'intern',
    },
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  dataStore.addUser(alice);
  dataStore.addUser(bob);
  dataStore.addUser(intern);

  // 创建资源
  const prodDocument: Resource = {
    id: 'resource-prod-doc',
    tenantId,
    type: 'document',
    name: 'Production Deployment Guide',
    ownerId: alice.id,
    creatorId: alice.id,
    state: {
      status: 'published',
      version: 2,
    },
    attributes: {
      classification: 'confidential',
      dataCategory: ['production', 'deployment'],
      compliance: ['SOC2'],
      region: 'US',
    },
    permissions: PermissionFlags.NONE,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const draftDocument: Resource = {
    id: 'resource-draft-doc',
    tenantId,
    type: 'document',
    name: 'Team Meeting Notes',
    ownerId: alice.id,
    creatorId: alice.id,
    state: {
      status: 'draft',
      version: 1,
    },
    attributes: {
      classification: 'internal',
      dataCategory: ['team', 'notes'],
      compliance: [],
      region: 'US',
    },
    permissions: PermissionFlags.NONE,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const financialReport: Resource = {
    id: 'resource-finance',
    tenantId,
    type: 'spreadsheet',
    name: 'Q4 Financial Report',
    ownerId: bob.id,
    creatorId: bob.id,
    state: {
      status: 'published',
      version: 3,
    },
    attributes: {
      classification: 'secret',
      dataCategory: ['finance', 'pii'],
      compliance: ['SOX', 'GDPR'],
      region: 'UK',
    },
    permissions: PermissionFlags.NONE,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  dataStore.addResource(prodDocument);
  dataStore.addResource(draftDocument);
  dataStore.addResource(financialReport);

  // 配置组权限
  const engineeringGroup = 'group-engineering';
  const financeGroup = 'group-finance';

  dataStore.addGroup(engineeringGroup, PermissionFlags.READ);
  dataStore.addGroup(financeGroup, PermissionFlags.READ | PermissionFlags.WRITE);

  dataStore.addUserToGroup(alice.id, engineeringGroup);
  dataStore.addUserToGroup(bob.id, financeGroup);
  dataStore.addUserToGroup(intern.id, engineeringGroup);

  // 配置 ABAC 策略：工作时间 + 高安全级别才能访问机密文档
  const abacPolicy: ABACPolicy = {
    id: 'policy-confidential-access',
    name: 'Confidential Document Access',
    description: 'Only high-security users during working hours can access confidential documents',
    priority: 100,
    resourceType: 'document',
    conditions: [
      {
        field: 'resource.attributes.classification',
        operator: 'equals',
        value: 'confidential',
        logicalOperator: 'AND',
      },
      {
        field: 'user.attributes.securityLevel',
        operator: 'greater_than',
        value: 2,
        logicalOperator: 'AND',
      },
      {
        field: 'context.isWorkingHours',
        operator: 'equals',
        value: true,
      },
    ],
    effect: 'allow',
    permissions: PermissionFlags.READ,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  dataStore.addABACPolicy(abacPolicy);

  // 配置动态权限：文档所有者拥有完全权限
  const ownerPermission: DynamicPermission = {
    id: 'dynamic-owner',
    resourceType: 'document',
    relationship: 'owner',
    permissions: PermissionFlags.READ | PermissionFlags.WRITE | PermissionFlags.DELETE,
    description: 'Document owners have full access',
    createdAt: new Date(),
  };

  dataStore.addDynamicPermission(ownerPermission);
  dataStore.addResourceRelationship(prodDocument.id, alice.id, 'owner');
  dataStore.addResourceRelationship(draftDocument.id, alice.id, 'owner');
  dataStore.addResourceRelationship(financialReport.id, bob.id, 'owner');

  // 配置黑名单：实习生不能访问生产文档
  dataStore.addAccessControl(
    prodDocument.id,
    intern.id,
    'blacklist',
    PermissionFlags.READ | PermissionFlags.WRITE | PermissionFlags.DELETE
  );

  // 配置临时权限：Bob 临时获得查看生产文档的权限（2小时）
  const tempPermission: TemporaryPermission = {
    id: 'temp-1',
    userId: bob.id,
    resourceId: prodDocument.id,
    permissions: PermissionFlags.READ,
    grantedBy: alice.id,
    reason: 'Need to review deployment procedures for audit',
    grantedAt: new Date(),
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours
    autoRevoke: true,
    revoked: false,
  };

  dataStore.addTemporaryPermission(tempPermission);

  // 配置 SOD 约束：不能同时拥有创建和批准权限
  const sodConstraint: SODConstraint = {
    id: 'sod-create-approve',
    name: 'Segregation: Create vs Approve',
    description: 'Users cannot have both CREATE and APPROVE permissions',
    constraintType: 'permission_conflict',
    conflictingPermissions: [PermissionFlags.WRITE, PermissionFlags.APPROVE],
    severity: 'high',
    action: 'warn',
    enabled: true,
    createdAt: new Date(),
  };

  dataStore.addSODConstraint(sodConstraint);

  // 配置数据级过滤：用户只能看到自己部门的数据
  const dataPolicy: DataLevelPolicy = {
    id: 'data-policy-dept',
    name: 'Department Data Isolation',
    resourceType: 'document',
    field: 'department',
    filterType: 'user_attribute',
    userAttributeField: 'user.attributes.department',
    priority: 10,
    enabled: true,
    createdAt: new Date(),
  };

  dataStore.addDataLevelPolicy(dataPolicy);

  // 配置字段级掩码：PII 数据需要高权限才能完整查看
  const fieldPolicy: FieldLevelPolicy = {
    id: 'field-policy-pii',
    name: 'PII Field Masking',
    resourceType: 'spreadsheet',
    fieldName: 'socialSecurityNumber',
    requiredPermission: PermissionFlags.ADMIN,
    maskingRule: {
      type: 'partial',
      partialMaskConfig: {
        keepPrefix: 3,
        keepSuffix: 2,
        maskChar: '*',
      },
    },
    priority: 100,
    enabled: true,
    createdAt: new Date(),
  };

  dataStore.addFieldLevelPolicy(fieldPolicy);

  console.log('========================================');
  console.log('统一权限系统示例');
  console.log('========================================\n');

  // 场景 1: Alice（所有者）访问生产文档 - 应该通过（动态权限）
  console.log('场景 1: Alice (所有者) 访问生产文档');
  const result1 = await engine.checkPermission(
    alice.id,
    prodDocument.id,
    PermissionFlags.READ,
    {
      isWorkingHours: true,
      ipAddress: '10.0.0.1',
      isInOffice: true,
      deviceType: 'desktop',
      isTrustedDevice: true,
    }
  );
  console.log('允许:', result1.allowed);
  console.log('原因:', result1.reasons);
  console.log('应用的策略:', result1.appliedPolicies);
  console.log('');

  // 场景 2: Intern 访问生产文档 - 应该拒绝（黑名单）
  console.log('场景 2: Intern 访问生产文档');
  const result2 = await engine.checkPermission(
    intern.id,
    prodDocument.id,
    PermissionFlags.READ,
    {
      isWorkingHours: true,
      ipAddress: '10.0.0.2',
      isInOffice: true,
      deviceType: 'desktop',
      isTrustedDevice: true,
    }
  );
  console.log('允许:', result2.allowed);
  console.log('原因:', result2.reasons);
  console.log('');

  // 场景 3: Bob 通过临时权限访问生产文档
  console.log('场景 3: Bob 通过临时权限访问生产文档');
  const result3 = await engine.checkPermission(
    bob.id,
    prodDocument.id,
    PermissionFlags.READ,
    {
      isWorkingHours: true,
      ipAddress: '10.0.0.3',
      isInOffice: true,
      deviceType: 'desktop',
      isTrustedDevice: true,
    }
  );
  console.log('允许:', result3.allowed);
  console.log('原因:', result3.reasons);
  console.log('应用的策略:', result3.appliedPolicies);
  console.log('');

  // 场景 4: Alice 在非工作时间访问机密文档（ABAC策略拒绝）
  console.log('场景 4: Alice 在非工作时间访问草稿文档');
  const result4 = await engine.checkPermission(
    alice.id,
    draftDocument.id,
    PermissionFlags.WRITE,
    {
      isWorkingHours: false, // 非工作时间
      ipAddress: '192.168.1.100', // 不在办公室
      isInOffice: false,
      deviceType: 'mobile',
      isTrustedDevice: false,
    }
  );
  console.log('允许:', result4.allowed);
  console.log('原因:', result4.reasons);
  console.log('应用的策略:', result4.appliedPolicies);
  console.log('');

  // 场景 5: Bob 访问财务报表（带数据级和字段级过滤）
  console.log('场景 5: Bob 访问财务报表（所有者）');
  const result5 = await engine.checkPermission(
    bob.id,
    financialReport.id,
    PermissionFlags.READ,
    {
      isWorkingHours: true,
      ipAddress: '10.0.0.4',
      isInOffice: true,
      deviceType: 'desktop',
      isTrustedDevice: true,
    }
  );
  console.log('允许:', result5.allowed);
  console.log('原因:', result5.reasons);
  console.log('数据过滤器 (RLS):', result5.dataFilters);
  console.log('字段掩码 (CLS):', result5.fieldMasks);
  console.log('');

  // 场景 6: 获取 Alice 的所有有效权限
  console.log('场景 6: Alice 对生产文档的有效权限分解');
  const effectivePerms = await engine.getUserEffectivePermissions(alice.id, prodDocument.id);
  console.log('总权限:', effectivePerms.totalPermissions);
  console.log('权限分解:', effectivePerms.breakdown);
  console.log('详细说明:', effectivePerms.details);
  console.log('');

  // 场景 7: 批量权限检查
  console.log('场景 7: 批量权限检查');
  const batchResults = await engine.checkPermissionsBatch([
    { userId: alice.id, resourceId: prodDocument.id, requiredPermission: PermissionFlags.READ },
    { userId: bob.id, resourceId: prodDocument.id, requiredPermission: PermissionFlags.READ },
    { userId: intern.id, resourceId: draftDocument.id, requiredPermission: PermissionFlags.READ },
  ]);
  batchResults.forEach((result, index) => {
    console.log(`请求 ${index + 1}: ${result.allowed ? '✓ 允许' : '✗ 拒绝'} - ${result.reasons[0]}`);
  });
  console.log('');

  // 显示审计日志
  console.log('========================================');
  console.log('审计日志');
  console.log('========================================');
  const auditLogs = dataStore.getAuditLogs();
  auditLogs.slice(-5).forEach((log, index) => {
    console.log(`${index + 1}. [${log.timestamp.toISOString()}] ${log.userId} - ${log.action}`);
    console.log(`   资源: ${log.resourceId}, 结果: ${log.result}`);
    console.log(`   原因: ${log.reason}`);
    console.log('');
  });
}

// 运行示例
runExamples().catch(console.error);
