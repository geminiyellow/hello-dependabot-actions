/**
 * RBAC 系统基本使用示例
 */

import {
  PermissionEvaluator,
  IDataStore,
} from '../src/permission-evaluator';
import {
  PermissionFlags,
  User,
  Group,
  Resource,
  Tenant,
  ResourceType,
  AccessControl,
  ResourcePermission,
} from '../src/types';

// ============================================================================
// 模拟数据存储
// ============================================================================

class MockDataStore implements IDataStore {
  private users: Map<string, User> = new Map();
  private groups: Map<string, Group> = new Map();
  private resources: Map<string, Resource> = new Map();
  private tenants: Map<string, Tenant> = new Map();
  private resourcePermissions: Map<string, ResourcePermission> = new Map();
  private accessControls: Map<string, AccessControl> = new Map();
  private userGroupMappings: Map<string, string[]> = new Map();

  constructor() {
    this.seedData();
  }

  async getUser(userId: string): Promise<User | null> {
    return this.users.get(userId) || null;
  }

  async getUserGroups(userId: string): Promise<Group[]> {
    const groupIds = this.userGroupMappings.get(userId) || [];
    const groups: Group[] = [];

    for (const groupId of groupIds) {
      const group = this.groups.get(groupId);
      if (group) groups.push(group);
    }

    return groups;
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    return this.tenants.get(tenantId) || null;
  }

  async getResource(resourceId: string): Promise<Resource | null> {
    return this.resources.get(resourceId) || null;
  }

  async getResourcePermission(
    resourceId: string,
    subjectId: string,
    subjectType: 'user' | 'group'
  ): Promise<ResourcePermission | null> {
    const key = `${resourceId}:${subjectId}:${subjectType}`;
    return this.resourcePermissions.get(key) || null;
  }

  async getAccessControl(
    userId: string,
    resourceId: string,
    type: 'whitelist' | 'blacklist'
  ): Promise<AccessControl | null> {
    const key = `${userId}:${resourceId}:${type}`;
    return this.accessControls.get(key) || null;
  }

  // 辅助方法：添加数据
  addUser(user: User) {
    this.users.set(user.id, user);
  }

  addGroup(group: Group) {
    this.groups.set(group.id, group);
  }

  addResource(resource: Resource) {
    this.resources.set(resource.id, resource);
  }

  addTenant(tenant: Tenant) {
    this.tenants.set(tenant.id, tenant);
  }

  addUserToGroup(userId: string, groupId: string) {
    const groups = this.userGroupMappings.get(userId) || [];
    groups.push(groupId);
    this.userGroupMappings.set(userId, groups);
  }

  addResourcePermission(perm: ResourcePermission) {
    const key = `${perm.resourceId}:${perm.subjectId}:${perm.subjectType}`;
    this.resourcePermissions.set(key, perm);
  }

  addAccessControl(ac: AccessControl) {
    const key = `${ac.userId}:${ac.resourceId}:${ac.type}`;
    this.accessControls.set(key, ac);
  }

  // 初始化示例数据
  private seedData() {
    // 创建租户
    const tenant: Tenant = {
      id: 'tenant-1',
      name: '示例公司',
      defaultPermissions: PermissionFlags.READ, // 默认只读
      settings: {},
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.addTenant(tenant);

    // 创建组
    const devGroup: Group = {
      id: 'group-dev',
      tenantId: 'tenant-1',
      name: '开发组',
      permissions: PermissionFlags.READ | PermissionFlags.WRITE,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.addGroup(devGroup);

    const adminGroup: Group = {
      id: 'group-admin',
      tenantId: 'tenant-1',
      name: '管理员组',
      permissions: PermissionFlags.READ | PermissionFlags.WRITE | PermissionFlags.DELETE | PermissionFlags.ADMIN,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.addGroup(adminGroup);

    // 创建用户
    const user1: User = {
      id: 'user-1',
      tenantId: 'tenant-1',
      username: '开发者张三',
      email: 'zhangsan@example.com',
      groupIds: ['group-dev'],
      directPermissions: PermissionFlags.NONE,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.addUser(user1);
    this.addUserToGroup('user-1', 'group-dev');

    const user2: User = {
      id: 'user-2',
      tenantId: 'tenant-1',
      username: '管理员李四',
      email: 'lisi@example.com',
      groupIds: ['group-admin'],
      directPermissions: PermissionFlags.NONE,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.addUser(user2);
    this.addUserToGroup('user-2', 'group-admin');

    const user3: User = {
      id: 'user-3',
      tenantId: 'tenant-1',
      username: '实习生王五',
      email: 'wangwu@example.com',
      groupIds: [],
      directPermissions: PermissionFlags.READ,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.addUser(user3);

    // 创建资源
    const resource1: Resource = {
      id: 'resource-doc-1',
      tenantId: 'tenant-1',
      type: ResourceType.FILE,
      name: '开发文档.md',
      path: '/docs/development',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.addResource(resource1);

    const resource2: Resource = {
      id: 'resource-config-1',
      tenantId: 'tenant-1',
      type: ResourceType.FILE,
      name: '生产环境配置',
      path: '/config/production',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.addResource(resource2);

    // 添加资源权限：生产环境配置只有管理员可以访问
    const prodConfigPerm: ResourcePermission = {
      id: 'perm-1',
      tenantId: 'tenant-1',
      resourceId: 'resource-config-1',
      subjectId: 'group-admin',
      subjectType: 'group',
      permissions: PermissionFlags.READ | PermissionFlags.WRITE | PermissionFlags.DELETE,
      inherited: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.addResourcePermission(prodConfigPerm);

    // 添加黑名单：实习生王五不能访问配置文件
    const blacklistEntry: AccessControl = {
      id: 'blacklist-1',
      tenantId: 'tenant-1',
      userId: 'user-3',
      resourceId: 'resource-config-1',
      type: 'blacklist',
      reason: '实习生权限不足',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.addAccessControl(blacklistEntry);
  }
}

// ============================================================================
// 使用示例
// ============================================================================

async function main() {
  console.log('='.repeat(80));
  console.log('RBAC 系统示例');
  console.log('='.repeat(80));
  console.log();

  // 初始化
  const dataStore = new MockDataStore();
  const evaluator = new PermissionEvaluator(dataStore, {
    enableCache: true,
    cacheTTL: 300000, // 5分钟
    enableAudit: true,
  });

  // 示例 1：开发者访问开发文档
  console.log('示例 1：开发者张三访问开发文档');
  console.log('-'.repeat(80));
  const result1 = await evaluator.checkPermission(
    'user-1',
    'resource-doc-1',
    PermissionFlags.READ | PermissionFlags.WRITE
  );
  console.log('结果:', result1.allowed ? '✅ 允许' : '❌ 拒绝');
  console.log('有效权限:', result1.effectivePermission.toString(2).padStart(5, '0'));
  console.log('权限来源:', result1.source);
  console.log('原因:', result1.reason || 'N/A');
  console.log();

  // 示例 2：开发者访问生产配置（应该被拒绝）
  console.log('示例 2：开发者张三访问生产配置');
  console.log('-'.repeat(80));
  const result2 = await evaluator.checkPermission(
    'user-1',
    'resource-config-1',
    PermissionFlags.READ
  );
  console.log('结果:', result2.allowed ? '✅ 允许' : '❌ 拒绝');
  console.log('有效权限:', result2.effectivePermission.toString(2).padStart(5, '0'));
  console.log('权限来源:', result2.source);
  console.log('原因:', result2.reason || 'N/A');
  console.log();

  // 示例 3：管理员访问生产配置（应该允许）
  console.log('示例 3：管理员李四访问生产配置');
  console.log('-'.repeat(80));
  const result3 = await evaluator.checkPermission(
    'user-2',
    'resource-config-1',
    PermissionFlags.READ | PermissionFlags.WRITE | PermissionFlags.DELETE
  );
  console.log('结果:', result3.allowed ? '✅ 允许' : '❌ 拒绝');
  console.log('有效权限:', result3.effectivePermission.toString(2).padStart(5, '0'));
  console.log('权限来源:', result3.source);
  console.log('原因:', result3.reason || 'N/A');
  console.log();

  // 示例 4：实习生访问生产配置（黑名单拒绝）
  console.log('示例 4：实习生王五访问生产配置（黑名单）');
  console.log('-'.repeat(80));
  const result4 = await evaluator.checkPermission(
    'user-3',
    'resource-config-1',
    PermissionFlags.READ
  );
  console.log('结果:', result4.allowed ? '✅ 允许' : '❌ 拒绝');
  console.log('有效权限:', result4.effectivePermission.toString(2).padStart(5, '0'));
  console.log('权限来源:', result4.source);
  console.log('原因:', result4.reason || 'N/A');
  console.log();

  // 示例 5：批量权限检查
  console.log('示例 5：开发者张三批量权限检查');
  console.log('-'.repeat(80));
  const batchResults = await evaluator.checkPermissionBatch('user-1', [
    { resourceId: 'resource-doc-1', permission: PermissionFlags.READ },
    { resourceId: 'resource-doc-1', permission: PermissionFlags.WRITE },
    { resourceId: 'resource-config-1', permission: PermissionFlags.READ },
  ]);

  for (const result of batchResults) {
    console.log(`资源 ${result.resourceId}:`, result.allowed ? '✅ 允许' : '❌ 拒绝');
  }
  console.log();

  // 示例 6：获取权限详情
  console.log('示例 6：获取管理员李四的权限详情');
  console.log('-'.repeat(80));
  const details = await evaluator.getPermissionDetails('user-2', 'resource-config-1');
  console.log('用户:', details.user?.username);
  console.log('租户:', details.tenant?.name);
  console.log('所属组:', details.groups.map(g => g.name).join(', '));
  console.log('资源:', details.resource?.name);
  console.log('黑名单:', details.blacklisted ? '是' : '否');
  console.log('白名单:', details.whitelisted ? '是' : '否');
  console.log('有效权限:', details.effectivePermission.toString(2).padStart(5, '0'));
  console.log('权限来源:', details.source);
  console.log();

  console.log('='.repeat(80));
  console.log('示例完成');
  console.log('='.repeat(80));
}

// 运行示例
if (require.main === module) {
  main().catch(console.error);
}

export { main, MockDataStore };
