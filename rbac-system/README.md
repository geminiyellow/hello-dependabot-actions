# RBAC 系统 - 基于角色的多租户访问控制

一个灵活、高性能的分层权限控制系统，支持从租户到资源的细粒度权限管理。

## 🎯 核心特性

- ✅ **多租户隔离** - 完全的数据和权限隔离
- ✅ **分层权限** - 5层权限控制（租户 → 组 → 用户 → 资源 → 黑白名单）
- ✅ **优先级规则** - 底层权限覆盖顶层权限
- ✅ **黑白名单** - 最高优先级的显式允许/拒绝
- ✅ **权限继承** - 自动继承父层级权限
- ✅ **高性能缓存** - 权限结果缓存，快速响应
- ✅ **审计日志** - 完整的权限检查日志
- ✅ **易于扩展** - 支持自定义权限类型

## 📋 层级结构

```
优先级从低到高：

1️⃣ Tenant (租户)
   ↓ 租户默认权限，影响所有资源

2️⃣ Group (组)
   ↓ 组权限，覆盖租户权限

3️⃣ User (用户)
   ↓ 用户权限，覆盖组权限

4️⃣ Resource (资源)
   ↓ 资源权限，覆盖用户权限

5️⃣ Blacklist/Whitelist (黑白名单)
   ↓ 最高优先级，直接允许或拒绝
```

## 🚀 快速开始

### 安装依赖

```bash
npm install
# or
yarn install
```

### 基本使用

```typescript
import { PermissionEvaluator } from './src/permission-evaluator';
import { PermissionFlags } from './src/types';

// 1. 创建数据存储实现
const dataStore = new YourDataStore();

// 2. 创建权限评估器
const evaluator = new PermissionEvaluator(dataStore, {
  enableCache: true,
  cacheTTL: 300000, // 5分钟
  enableAudit: true,
});

// 3. 检查权限
const result = await evaluator.checkPermission(
  'user-123',              // 用户ID
  'resource-456',          // 资源ID
  PermissionFlags.READ     // 所需权限
);

if (result.allowed) {
  console.log('✅ 访问允许');
} else {
  console.log('❌ 访问拒绝:', result.reason);
}
```

### 运行示例

```bash
# 查看完整示例
ts-node examples/basic-usage.ts
```

## 📖 文档

### 核心文档

- [设计文档](./docs/DESIGN.md) - 完整的系统设计说明
- [API 文档](./docs/API.md) - API 接口文档
- [数据模型](./docs/DESIGN.md#数据模型) - 数据库设计

### 代码结构

```
rbac-system/
├── docs/                   # 文档
│   └── DESIGN.md          # 设计文档
├── src/                    # 源代码
│   ├── types.ts           # 类型定义
│   ├── permission-evaluator.ts  # 核心评估器
│   ├── permission-cache.ts      # 缓存模块
│   └── audit-logger.ts          # 审计日志
├── examples/               # 示例代码
│   └── basic-usage.ts     # 基本使用示例
└── tests/                  # 测试用例
```

## 💡 使用场景

### 场景 1：企业文档管理

```typescript
// 租户：公司A
// 组：技术部（读写权限）、管理层（全部权限）
// 用户：实习生（只读，机密文档黑名单）

// 开发者访问技术文档 → ✅ 允许（组权限）
await evaluator.checkPermission('dev-user', 'tech-doc', PermissionFlags.WRITE);

// 实习生访问机密文档 → ❌ 拒绝（黑名单）
await evaluator.checkPermission('intern-user', 'confidential-doc', PermissionFlags.READ);
```

### 场景 2：多租户 SaaS

```typescript
// 租户隔离 - 不同租户完全隔离
// Premium 用户组 - 额外权限
// API 端点资源 - 细粒度控制

// 检查用户是否可以调用 API
await evaluator.checkPermission(
  'user-id',
  'api-endpoint',
  PermissionFlags.EXECUTE
);
```

### 场景 3：医疗系统

```typescript
// 医生组 - 读写病历
// 护士组 - 只读病历
// 主治医生 - 自己患者的完全权限
// 紧急访问白名单 - 临时全部权限

// 医生访问自己的患者
await evaluator.checkPermission('doctor-id', 'patient-record', PermissionFlags.WRITE);

// 紧急情况临时授权（白名单）
await evaluator.checkPermission('emergency-user', 'patient-record', PermissionFlags.ADMIN);
```

## 🔧 权限计算规则

### 优先级（从高到低）

```
1. Blacklist (黑名单)     → 直接拒绝 ❌
2. Whitelist (白名单)     → 直接允许 ✅
3. Resource Permission    → 使用资源权限
4. User Permission        → 使用用户权限
5. Group Permission       → 合并所有组权限
6. Tenant Permission      → 使用租户默认权限
7. Default Deny           → 默认拒绝 ❌
```

### 权限合并（多个组）

```typescript
// 用户属于多个组时，权限按位或运算
Group1: READ  (001)
Group2: WRITE (010)
Result: READ | WRITE (011)
```

### 权限类型（位标志）

```typescript
enum PermissionFlags {
  NONE = 0,      // 0000
  READ = 1,      // 0001
  WRITE = 2,     // 0010
  DELETE = 4,    // 0100
  EXECUTE = 8,   // 1000
  ADMIN = 16,    // 10000
}
```

## 🎨 API 示例

### 基本权限检查

```typescript
const result = await evaluator.checkPermission(
  userId,
  resourceId,
  PermissionFlags.READ | PermissionFlags.WRITE
);

console.log(result.allowed);              // true/false
console.log(result.effectivePermission);  // 实际权限值
console.log(result.source);               // 权限来源
console.log(result.reason);               // 拒绝原因（如果有）
```

### 批量权限检查

```typescript
const results = await evaluator.checkPermissionBatch(userId, [
  { resourceId: 'res-1', permission: PermissionFlags.READ },
  { resourceId: 'res-2', permission: PermissionFlags.WRITE },
  { resourceId: 'res-3', permission: PermissionFlags.DELETE },
]);

for (const result of results) {
  console.log(`${result.resourceId}: ${result.allowed ? '✅' : '❌'}`);
}
```

### 获取权限详情

```typescript
const details = await evaluator.getPermissionDetails(userId, resourceId);

console.log('用户:', details.user?.username);
console.log('组:', details.groups.map(g => g.name));
console.log('黑名单:', details.blacklisted);
console.log('白名单:', details.whitelisted);
console.log('有效权限:', details.effectivePermission);
console.log('权限来源:', details.source);
```

### 缓存管理

```typescript
// 清除特定缓存
evaluator.invalidateCache(userId, resourceId);

// 清除用户的所有缓存
evaluator.invalidateCache(userId);

// 清除所有缓存
evaluator.invalidateCache();
```

## 🔒 安全最佳实践

1. **最小权限原则** - 默认拒绝，显式授权
2. **审计日志** - 记录所有权限检查
3. **定期审查** - 定期审查权限配置
4. **黑名单优先** - 黑名单高于一切权限
5. **租户隔离** - 严格的租户数据隔离
6. **时效性** - 支持权限过期时间

## 📊 性能优化

### 缓存策略

- 权限结果缓存（默认5分钟）
- 自动清理过期缓存
- 支持手动失效缓存

### 数据库优化

- 适当的索引设计
- 避免 N+1 查询
- 批量查询优化

### 推荐配置

```typescript
const evaluator = new PermissionEvaluator(dataStore, {
  enableCache: true,
  cacheTTL: 300000,  // 5分钟
  enableAudit: true,
});
```

## 🧪 测试

```bash
# 运行测试
npm test

# 运行示例
npm run example

# 性能测试
npm run benchmark
```

## 📝 实现数据存储

你需要实现 `IDataStore` 接口来连接你的数据库：

```typescript
import { IDataStore } from './src/permission-evaluator';

class MyDataStore implements IDataStore {
  async getUser(userId: string): Promise<User | null> {
    // 从数据库获取用户
    return await db.users.findById(userId);
  }

  async getUserGroups(userId: string): Promise<Group[]> {
    // 获取用户所属的组
    return await db.groups.findByUserId(userId);
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    // 获取租户信息
    return await db.tenants.findById(tenantId);
  }

  async getResource(resourceId: string): Promise<Resource | null> {
    // 获取资源信息
    return await db.resources.findById(resourceId);
  }

  async getResourcePermission(
    resourceId: string,
    subjectId: string,
    subjectType: 'user' | 'group'
  ): Promise<ResourcePermission | null> {
    // 获取资源权限
    return await db.resourcePermissions.findOne({
      resourceId,
      subjectId,
      subjectType,
    });
  }

  async getAccessControl(
    userId: string,
    resourceId: string,
    type: 'whitelist' | 'blacklist'
  ): Promise<AccessControl | null> {
    // 获取访问控制（黑白名单）
    return await db.accessControls.findOne({
      userId,
      resourceId,
      type,
    });
  }
}
```

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

## 📄 许可证

MIT License

---

## 🎓 了解更多

- [完整设计文档](./docs/DESIGN.md)
- [权限计算算法](./docs/DESIGN.md#核心算法)
- [数据模型详解](./docs/DESIGN.md#数据模型)
- [使用场景](./docs/DESIGN.md#使用场景)
