# RBAC 系统设计文档

基于角色的多租户访问控制系统（Multi-Tenant Role-Based Access Control）

## 📋 目录

1. [系统概述](#系统概述)
2. [层级结构](#层级结构)
3. [权限计算规则](#权限计算规则)
4. [数据模型](#数据模型)
5. [核心算法](#核心算法)
6. [API 设计](#api-设计)
7. [使用场景](#使用场景)

---

## 系统概述

### 设计目标

- ✅ **多租户隔离**：支持多个租户，数据完全隔离
- ✅ **层级权限**：支持从租户到资源的多层级权限控制
- ✅ **细粒度控制**：越底层权限权重越高，实现精确控制
- ✅ **黑白名单**：支持显式允许和拒绝
- ✅ **高性能**：权限计算快速，支持缓存
- ✅ **易扩展**：容易添加新的权限类型和层级

### 核心原则

1. **优先级原则**：底层权限覆盖顶层权限
2. **继承原则**：子层级继承父层级权限
3. **最小权限原则**：默认无权限，显式授权
4. **拒绝优先原则**：黑名单优先于白名单

---

## 层级结构

```
┌─────────────────────────────────────────────────────────┐
│  Tenant (租户)                                Priority 1 │
│  ├─ 租户级别默认权限                                       │
│  └─ 影响范围：整个租户下的所有资源                           │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│  Group (组)                                  Priority 2 │
│  ├─ 组级别权限（覆盖租户权限）                             │
│  ├─ 用户可以属于多个组（权限合并）                          │
│  └─ 影响范围：组内的所有用户和资源                          │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│  User (个别用户)                             Priority 3 │
│  ├─ 用户级别权限（覆盖组权限）                             │
│  ├─ 直接分配给用户的权限                                   │
│  └─ 影响范围：该用户访问的所有资源                          │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│  Resource (个别资产)                         Priority 4 │
│  ├─ 资源级别权限（覆盖用户权限）                           │
│  ├─ 针对特定资源的访问控制                                 │
│  └─ 影响范围：该特定资源                                   │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│  Blacklist/Whitelist (黑白名单)              Priority 5 │
│  ├─ 显式拒绝（Blacklist）- 最高优先级                      │
│  ├─ 显式允许（Whitelist）                                 │
│  └─ 影响范围：特定的用户-资源对                            │
└─────────────────────────────────────────────────────────┘
```

### 层级说明

| 层级 | 优先级 | 说明 | 示例 |
|------|--------|------|------|
| **Tenant** | 1 (最低) | 租户默认权限，影响所有子资源 | 所有员工默认只读 |
| **Group** | 2 | 组权限，覆盖租户权限 | 开发组有写权限 |
| **User** | 3 | 用户权限，覆盖组权限 | 张三有管理员权限 |
| **Resource** | 4 | 资源权限，覆盖用户权限 | 项目A只有特定用户可访问 |
| **Blacklist/Whitelist** | 5 (最高) | 显式允许/拒绝，最高优先级 | 李四被拉黑，无法访问任何资源 |

---

## 权限计算规则

### 优先级规则

```
Priority: Blacklist > Whitelist > Resource > User > Group > Tenant

计算流程：
1. 检查黑名单 → 如果在黑名单，直接拒绝 ❌
2. 检查白名单 → 如果在白名单，直接允许 ✅
3. 检查资源权限 → 如果有资源级权限，使用资源权限
4. 检查用户权限 → 如果有用户级权限，使用用户权限
5. 检查组权限 → 合并所有组权限（用户可能属于多个组）
6. 检查租户权限 → 使用租户默认权限
7. 默认拒绝 → 如果以上都没有，默认拒绝 ❌
```

### 权限合并规则

当用户属于多个组时：

```javascript
// 权限类型
const Permissions = {
  NONE: 0,      // 000 - 无权限
  READ: 1,      // 001 - 读
  WRITE: 2,     // 010 - 写
  DELETE: 4,    // 100 - 删除
};

// 合并规则：按位或运算
userPermission = group1Permission | group2Permission | group3Permission;

// 示例：
// Group1: READ (001)
// Group2: WRITE (010)
// 合并后: READ | WRITE (011) = 可读可写
```

### 决策树

```
开始
  │
  ├─→ 是否在黑名单？
  │     ├─ Yes → 拒绝 ❌
  │     └─ No  → 继续
  │
  ├─→ 是否在白名单？
  │     ├─ Yes → 允许 ✅
  │     └─ No  → 继续
  │
  ├─→ 是否有资源权限？
  │     ├─ Yes → 使用资源权限 → 检查是否满足所需权限
  │     └─ No  → 继续
  │
  ├─→ 是否有用户权限？
  │     ├─ Yes → 使用用户权限 → 检查是否满足所需权限
  │     └─ No  → 继续
  │
  ├─→ 是否有组权限？
  │     ├─ Yes → 合并所有组权限 → 检查是否满足所需权限
  │     └─ No  → 继续
  │
  ├─→ 是否有租户权限？
  │     ├─ Yes → 使用租户权限 → 检查是否满足所需权限
  │     └─ No  → 拒绝 ❌
  │
  └─→ 默认拒绝 ❌
```

---

## 数据模型

### 1. Tenant (租户)

```typescript
interface Tenant {
  id: string;                    // 租户ID
  name: string;                  // 租户名称
  description?: string;          // 描述
  defaultPermissions: Permission; // 默认权限
  settings: {
    maxUsers?: number;           // 最大用户数
    maxGroups?: number;          // 最大组数
    maxResources?: number;       // 最大资源数
  };
  metadata: Record<string, any>; // 扩展字段
  createdAt: Date;
  updatedAt: Date;
}
```

### 2. Group (组)

```typescript
interface Group {
  id: string;                    // 组ID
  tenantId: string;              // 所属租户
  name: string;                  // 组名称
  description?: string;          // 描述
  parentGroupId?: string;        // 父组ID（支持组层级）
  permissions: Permission;       // 组权限
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
```

### 3. User (用户)

```typescript
interface User {
  id: string;                    // 用户ID
  tenantId: string;              // 所属租户
  username: string;              // 用户名
  email: string;                 // 邮箱
  groupIds: string[];            // 所属组（可多个）
  directPermissions: Permission; // 直接权限
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
```

### 4. Resource (资源)

```typescript
interface Resource {
  id: string;                    // 资源ID
  tenantId: string;              // 所属租户
  type: ResourceType;            // 资源类型
  name: string;                  // 资源名称
  path?: string;                 // 资源路径（层级）
  ownerId?: string;              // 拥有者ID
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

enum ResourceType {
  FILE = 'file',
  FOLDER = 'folder',
  API = 'api',
  DATABASE = 'database',
  SERVICE = 'service',
  // ... 可扩展
}
```

### 5. Permission (权限)

```typescript
interface Permission {
  read: boolean;     // 读权限
  write: boolean;    // 写权限
  delete: boolean;   // 删除权限
  execute?: boolean; // 执行权限
  admin?: boolean;   // 管理员权限
  custom?: Record<string, boolean>; // 自定义权限
}

// 或使用位运算表示
type PermissionBits = number;
const PermissionFlags = {
  NONE: 0,      // 0000
  READ: 1,      // 0001
  WRITE: 2,     // 0010
  DELETE: 4,    // 0100
  EXECUTE: 8,   // 1000
  ADMIN: 16,    // 10000
};
```

### 6. ResourcePermission (资源权限)

```typescript
interface ResourcePermission {
  id: string;
  tenantId: string;              // 所属租户
  resourceId: string;            // 资源ID
  subjectId: string;             // 主体ID（用户或组）
  subjectType: 'user' | 'group'; // 主体类型
  permissions: Permission;       // 权限
  inherited: boolean;            // 是否继承
  createdAt: Date;
  updatedAt: Date;
}
```

### 7. AccessControl (访问控制列表)

```typescript
interface AccessControl {
  id: string;
  tenantId: string;
  userId: string;                // 用户ID
  resourceId: string;            // 资源ID
  type: 'whitelist' | 'blacklist'; // 类型
  reason?: string;               // 原因
  expiresAt?: Date;              // 过期时间
  createdAt: Date;
  updatedAt: Date;
}
```

### 数据库设计（SQL 示例）

```sql
-- 租户表
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  default_permissions JSONB,
  settings JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 组表
CREATE TABLE groups (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  parent_group_id UUID REFERENCES groups(id),
  permissions JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, name)
);

-- 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  direct_permissions JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, username),
  UNIQUE(email)
);

-- 用户-组关联表
CREATE TABLE user_groups (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, group_id)
);

-- 资源表
CREATE TABLE resources (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  type VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  path TEXT,
  owner_id UUID REFERENCES users(id),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 资源权限表
CREATE TABLE resource_permissions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL,
  subject_type VARCHAR(10) NOT NULL CHECK (subject_type IN ('user', 'group')),
  permissions JSONB NOT NULL,
  inherited BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(resource_id, subject_id, subject_type)
);

-- 访问控制表（黑白名单）
CREATE TABLE access_controls (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  type VARCHAR(10) NOT NULL CHECK (type IN ('whitelist', 'blacklist')),
  reason TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, resource_id, type)
);

-- 创建索引
CREATE INDEX idx_groups_tenant ON groups(tenant_id);
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_resources_tenant ON resources(tenant_id);
CREATE INDEX idx_resource_permissions_resource ON resource_permissions(resource_id);
CREATE INDEX idx_resource_permissions_subject ON resource_permissions(subject_id, subject_type);
CREATE INDEX idx_access_controls_user_resource ON access_controls(user_id, resource_id);
CREATE INDEX idx_access_controls_type ON access_controls(type);
```

---

## 核心算法

### 权限检查算法

```typescript
class PermissionEvaluator {
  /**
   * 检查用户是否有权限访问资源
   * @param userId 用户ID
   * @param resourceId 资源ID
   * @param requiredPermission 所需权限
   * @returns 是否有权限
   */
  async checkPermission(
    userId: string,
    resourceId: string,
    requiredPermission: PermissionBits
  ): Promise<boolean> {
    // 1. 检查黑名单 - 最高优先级
    const isBlacklisted = await this.isBlacklisted(userId, resourceId);
    if (isBlacklisted) {
      console.log('Access denied: User is blacklisted');
      return false;
    }

    // 2. 检查白名单
    const isWhitelisted = await this.isWhitelisted(userId, resourceId);
    if (isWhitelisted) {
      console.log('Access granted: User is whitelisted');
      return true;
    }

    // 3. 计算有效权限（从底层到顶层）
    const effectivePermission = await this.calculateEffectivePermission(
      userId,
      resourceId
    );

    // 4. 检查是否满足所需权限
    const hasPermission = (effectivePermission & requiredPermission) === requiredPermission;

    console.log(`Permission check: ${hasPermission}`, {
      userId,
      resourceId,
      effective: effectivePermission.toString(2),
      required: requiredPermission.toString(2)
    });

    return hasPermission;
  }

  /**
   * 计算有效权限
   */
  private async calculateEffectivePermission(
    userId: string,
    resourceId: string
  ): Promise<PermissionBits> {
    // 优先级 4: 资源权限
    const resourcePermission = await this.getResourcePermission(userId, resourceId);
    if (resourcePermission !== null) {
      return resourcePermission;
    }

    // 优先级 3: 用户权限
    const userPermission = await this.getUserPermission(userId);
    if (userPermission !== null) {
      return userPermission;
    }

    // 优先级 2: 组权限（合并所有组）
    const groupPermissions = await this.getUserGroupPermissions(userId);
    if (groupPermissions.length > 0) {
      return this.mergePermissions(groupPermissions);
    }

    // 优先级 1: 租户权限
    const tenantPermission = await this.getTenantPermission(userId);
    if (tenantPermission !== null) {
      return tenantPermission;
    }

    // 默认无权限
    return PermissionFlags.NONE;
  }

  /**
   * 合并权限（按位或）
   */
  private mergePermissions(permissions: PermissionBits[]): PermissionBits {
    return permissions.reduce((acc, perm) => acc | perm, PermissionFlags.NONE);
  }

  /**
   * 检查黑名单
   */
  private async isBlacklisted(userId: string, resourceId: string): Promise<boolean> {
    const blacklist = await db.accessControls.findOne({
      userId,
      resourceId,
      type: 'blacklist',
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    });
    return !!blacklist;
  }

  /**
   * 检查白名单
   */
  private async isWhitelisted(userId: string, resourceId: string): Promise<boolean> {
    const whitelist = await db.accessControls.findOne({
      userId,
      resourceId,
      type: 'whitelist',
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    });
    return !!whitelist;
  }

  // ... 其他辅助方法
}
```

### 权限继承算法

```typescript
/**
 * 计算资源的继承权限
 */
async function calculateInheritedPermissions(resourceId: string): Promise<void> {
  const resource = await db.resources.findById(resourceId);
  if (!resource.path) return;

  // 获取父路径上的所有资源
  const parentResources = await db.resources.find({
    tenantId: resource.tenantId,
    path: { $in: getParentPaths(resource.path) }
  });

  // 获取父资源的权限
  for (const parentResource of parentResources) {
    const parentPermissions = await db.resourcePermissions.find({
      resourceId: parentResource.id
    });

    // 继承到当前资源（如果不存在）
    for (const perm of parentPermissions) {
      const existingPerm = await db.resourcePermissions.findOne({
        resourceId: resource.id,
        subjectId: perm.subjectId,
        subjectType: perm.subjectType
      });

      if (!existingPerm) {
        await db.resourcePermissions.create({
          ...perm,
          resourceId: resource.id,
          inherited: true
        });
      }
    }
  }
}

/**
 * 获取父路径列表
 */
function getParentPaths(path: string): string[] {
  const parts = path.split('/').filter(Boolean);
  const paths: string[] = [];

  for (let i = 1; i < parts.length; i++) {
    paths.push('/' + parts.slice(0, i).join('/'));
  }

  return paths;
}
```

### 缓存策略

```typescript
class PermissionCache {
  private cache: Map<string, CacheEntry> = new Map();
  private ttl: number = 300000; // 5分钟

  /**
   * 生成缓存键
   */
  private getCacheKey(userId: string, resourceId: string): string {
    return `${userId}:${resourceId}`;
  }

  /**
   * 获取缓存
   */
  get(userId: string, resourceId: string): PermissionBits | null {
    const key = this.getCacheKey(userId, resourceId);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.permission;
  }

  /**
   * 设置缓存
   */
  set(userId: string, resourceId: string, permission: PermissionBits): void {
    const key = this.getCacheKey(userId, resourceId);
    this.cache.set(key, {
      permission,
      expiresAt: Date.now() + this.ttl
    });
  }

  /**
   * 清除缓存
   */
  invalidate(userId?: string, resourceId?: string): void {
    if (userId && resourceId) {
      // 清除特定缓存
      this.cache.delete(this.getCacheKey(userId, resourceId));
    } else if (userId) {
      // 清除用户的所有缓存
      for (const key of this.cache.keys()) {
        if (key.startsWith(userId + ':')) {
          this.cache.delete(key);
        }
      }
    } else {
      // 清除所有缓存
      this.cache.clear();
    }
  }
}

interface CacheEntry {
  permission: PermissionBits;
  expiresAt: number;
}
```

---

## API 设计

### RESTful API

```typescript
// 权限检查
POST /api/v1/permissions/check
{
  "userId": "user-123",
  "resourceId": "resource-456",
  "permission": "read" // or "write", "delete", etc.
}
Response: { "allowed": true }

// 批量权限检查
POST /api/v1/permissions/check-batch
{
  "userId": "user-123",
  "checks": [
    { "resourceId": "res-1", "permission": "read" },
    { "resourceId": "res-2", "permission": "write" }
  ]
}
Response: {
  "results": [
    { "resourceId": "res-1", "allowed": true },
    { "resourceId": "res-2", "allowed": false }
  ]
}

// 获取用户权限
GET /api/v1/users/:userId/permissions?resourceId=:resourceId
Response: {
  "effectivePermissions": {
    "read": true,
    "write": false,
    "delete": false
  },
  "source": "group", // tenant|group|user|resource
  "inherited": true
}

// 分配权限
POST /api/v1/permissions/assign
{
  "subjectType": "user", // or "group"
  "subjectId": "user-123",
  "resourceId": "resource-456",
  "permissions": {
    "read": true,
    "write": true
  }
}

// 撤销权限
DELETE /api/v1/permissions/:permissionId

// 黑名单管理
POST /api/v1/access-controls/blacklist
{
  "userId": "user-123",
  "resourceId": "resource-456",
  "reason": "Security violation",
  "expiresAt": "2024-12-31T23:59:59Z"
}

// 白名单管理
POST /api/v1/access-controls/whitelist
{
  "userId": "user-123",
  "resourceId": "resource-456",
  "reason": "VIP access"
}

// 清除访问控制
DELETE /api/v1/access-controls/:id
```

---

## 使用场景

### 场景 1：企业文档管理系统

```
租户: 公司A
├─ 组: 技术部
│  ├─ 权限: READ, WRITE (所有技术文档)
│  └─ 成员: 开发者1, 开发者2
├─ 组: 管理层
│  ├─ 权限: READ, WRITE, DELETE (所有文档)
│  └─ 成员: CEO, CTO
└─ 用户: 实习生
   ├─ 组: 技术部
   ├─ 直接权限: READ (仅限公开文档)
   └─ 黑名单: 机密文档（明确拒绝）

决策示例：
- 开发者1 访问技术文档 → ✅ 允许（来自技术部组权限）
- 实习生 访问机密文档 → ❌ 拒绝（黑名单优先）
- CEO 访问所有文档 → ✅ 允许（管理层组权限）
```

### 场景 2：多租户 SaaS 平台

```
租户: Startup公司
├─ 默认权限: READ (所有资源默认只读)
├─ 组: Premium用户组
│  └─ 权限: READ, WRITE, EXECUTE
└─ 资源: API端点
   ├─ /api/public/* → 所有人可访问
   ├─ /api/premium/* → 仅Premium用户
   └─ /api/admin/* → 黑名单除外的管理员
```

### 场景 3：医疗系统权限控制

```
租户: 医院
├─ 组: 医生
│  └─ 权限: READ, WRITE (患者病历)
├─ 组: 护士
│  └─ 权限: READ (患者病历)
├─ 用户: 主治医生A
│  ├─ 组: 医生
│  └─ 资源权限: ADMIN (自己的患者)
└─ 黑白名单:
   ├─ 白名单: 紧急访问（所有权限）
   └─ 黑名单: 离职员工（拒绝所有访问）

隐私保护：
- 医生只能访问自己的患者病历
- 紧急情况可通过白名单临时授权
- 离职员工立即通过黑名单拒绝访问
```

---

## 性能优化

### 1. 缓存策略

- 权限结果缓存（5分钟TTL）
- 组关系缓存
- 资源树缓存

### 2. 数据库优化

- 适当的索引
- 查询优化（避免N+1）
- 读写分离

### 3. 权限预计算

- 定期预计算常用权限
- 权限变更时异步更新缓存

---

## 安全考虑

1. **审计日志**：记录所有权限检查和变更
2. **权限变更通知**：实时通知相关用户
3. **定期审查**：定期审查权限配置
4. **最小权限原则**：默认拒绝，显式授权
5. **时效性**：支持权限过期时间

---

## 扩展性

### 支持的扩展

1. **自定义权限类型**
2. **动态权限计算**（基于上下文）
3. **时间条件**（工作时间权限）
4. **地理位置条件**
5. **资源属性条件**（ABAC扩展）

---

## 总结

这套 RBAC 系统通过层级化的权限设计和明确的优先级规则，实现了：

- ✅ 灵活的多层级权限控制
- ✅ 高效的权限计算
- ✅ 细粒度的访问控制
- ✅ 易于理解和维护

核心优势：
1. **清晰的优先级**：黑名单 > 白名单 > 资源 > 用户 > 组 > 租户
2. **灵活的权限合并**：支持多组权限合并
3. **高性能**：通过缓存优化权限检查
4. **易扩展**：支持自定义权限类型和条件
