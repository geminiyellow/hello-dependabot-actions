# 企业级统一权限管理系统 (Unified RBAC System)

一个功能完整、生产就绪的企业级权限管理系统，集成了 RBAC、ABAC、数据级权限、字段级权限等 30+ 高级功能。

## 🌟 核心特性

### 基础权限管理
- ✅ **RBAC** - 基于角色的访问控制（Tenant → Group → User → Resource → Blacklist/Whitelist）
- ✅ **ABAC** - 基于属性的访问控制（时间、地点、设备、上下文）
- ✅ **黑白名单** - 最高优先级的权限控制
- ✅ **审计日志** - 完整的操作追踪和合规性审计

### 高级功能
- ✅ **动态权限** - 基于关系的权限（所有者、创建者、参与者）
- ✅ **条件权限** - 基于资源状态的权限（草稿/已发布/已归档）
- ✅ **临时权限** - 时间限制的权限授予和自动过期
- ✅ **权限委托** - 用户间的权限委托和委托链
- ✅ **SOD 约束** - 职责分离，防止权限冲突
- ✅ **审批工作流** - 多级审批、自动升级、超时处理
- ✅ **数据级权限** (RLS) - 行级安全，SQL 过滤器生成
- ✅ **字段级权限** (CLS) - 列级安全，字段脱敏
- ✅ **资源层级** - 树形结构、权限继承、覆盖机制

### 扩展功能
- ⚡ **性能优化** - 三级缓存、预计算、位图索引
- 📊 **权限分析** - 使用情况分析、过度授权检测、推荐系统
- 🔍 **权限模拟** - What-if 分析、影响评估
- 🛡️ **风险评分** - 多因素风险评估、智能审批
- 📈 **合规报告** - SOX、GDPR、HIPAA 等合规性检查
- 🔧 **调试工具** - 权限解释、用户比较、决策树可视化

## 📁 项目结构

```
rbac-system/
├── docs/
│   ├── DESIGN.md                # 系统设计文档
│   ├── ADVANCED_SCENARIOS.md    # 高级场景实现
│   └── UNIFIED_SYSTEM.md        # 统一系统完整文档（30+ 功能）
├── src/
│   ├── types.ts                 # 基础类型定义
│   ├── unified-types.ts         # 统一系统类型定义
│   ├── permission-evaluator.ts  # 基础权限评估器
│   ├── unified-permission-engine.ts  # 统一权限引擎 ⭐
│   ├── permission-cache.ts      # 缓存管理
│   └── audit-logger.ts          # 审计日志
├── examples/
│   ├── basic-usage.ts           # 基础使用示例
│   └── unified-system-example.ts # 统一系统完整示例 ⭐
└── README.md                    # 本文件
```

## 🚀 快速开始

### 安装

```bash
npm install
```

### 统一系统使用（推荐）

```typescript
import { UnifiedPermissionEngine } from './src/unified-permission-engine';
import { PermissionFlags } from './src/unified-types';

// 创建权限引擎
const dataStore = new YourDataStoreImplementation();
const engine = new UnifiedPermissionEngine(dataStore);

// 检查权限（自动应用所有策略）
const result = await engine.checkPermission(
  'user-123',
  'resource-456',
  PermissionFlags.READ,
  {
    ipAddress: '10.0.0.1',
    isWorkingHours: true,
    deviceType: 'desktop',
    isTrustedDevice: true,
  }
);

if (result.allowed) {
  console.log('✅ 访问允许');
  console.log('原因:', result.reasons);
  console.log('应用的策略:', result.appliedPolicies);

  // 数据级过滤（RLS）
  if (result.dataFilters) {
    console.log('SQL过滤器:', result.dataFilters);
  }

  // 字段级脱敏（CLS）
  if (result.fieldMasks) {
    console.log('字段掩码:', result.fieldMasks);
  }
} else {
  console.log('❌ 访问拒绝:', result.reasons[0]);
}
```

### 批量权限检查

```typescript
const results = await engine.checkPermissionsBatch([
  { userId: 'user-1', resourceId: 'res-1', requiredPermission: PermissionFlags.READ },
  { userId: 'user-2', resourceId: 'res-2', requiredPermission: PermissionFlags.WRITE },
  { userId: 'user-3', resourceId: 'res-3', requiredPermission: PermissionFlags.DELETE },
]);

results.forEach((result, i) => {
  console.log(`请求 ${i + 1}: ${result.allowed ? '✓' : '✗'}`);
});
```

### 获取用户有效权限

```typescript
const effectivePerms = await engine.getUserEffectivePermissions('user-123', 'resource-456');

console.log('总权限:', effectivePerms.totalPermissions);
console.log('权限来源:', effectivePerms.breakdown);
console.log('详细说明:', effectivePerms.details);
```

### 运行示例

```bash
# 基础示例
ts-node examples/basic-usage.ts

# 统一系统完整示例（推荐）
ts-node examples/unified-system-example.ts
```

## 📖 核心概念

### 权限检查流程

系统按以下顺序评估权限（任何步骤拒绝则立即返回拒绝）：

```
1. 黑名单检查          → 拒绝则返回 ❌
2. 白名单检查          → 允许则返回 ✅
3. ABAC 策略检查       → 拒绝则返回 ❌
4. 条件权限检查        → 拒绝则返回 ❌
5. 动态权限检查        → 累积权限 ⬆
6. 临时权限检查        → 累积权限 ⬆
7. 资源层级继承        → 累积权限 ⬆
8. 直接权限检查        → 累积权限 ⬆
9. 用户权限            → 累积权限 ⬆
10. 组权限             → 累积权限 ⬆
11. 租户权限           → 累积权限 ⬆
12. SOD 约束检查       → 警告或拒绝 ⚠️
13. 应用 RLS/CLS 过滤  → 返回结果 ✅
```

### 权限标志（位运算）

```typescript
enum PermissionFlags {
  NONE = 0,        // 无权限
  READ = 1,        // 读取 (0001)
  WRITE = 2,       // 写入 (0010)
  DELETE = 4,      // 删除 (0100)
  EXECUTE = 8,     // 执行 (1000)
  ADMIN = 16,      // 管理 (10000)
  SHARE = 32,      // 分享
  APPROVE = 64,    // 批准
  AUDIT = 128,     // 审计
  EXPORT = 256,    // 导出
  IMPORT = 512,    // 导入
}

// 组合权限
const fullAccess = PermissionFlags.READ | PermissionFlags.WRITE | PermissionFlags.DELETE;
```

## 📚 文档

- **[系统设计文档](docs/DESIGN.md)** - 完整的系统设计和架构
- **[高级场景](docs/ADVANCED_SCENARIOS.md)** - ABAC、RLS、CLS 等高级功能实现
- **[统一系统](docs/UNIFIED_SYSTEM.md)** - 30+ 功能的完整文档和使用说明

## 🎯 使用场景

### 场景 1：企业文档管理系统

```typescript
// 配置：高安全级别用户在工作时间才能访问机密文档
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
