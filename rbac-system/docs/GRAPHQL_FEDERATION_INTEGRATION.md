# GraphQL 联邦权限管理集成方案

## 架构概览

```
┌──────────────────────────────────────────────────────────────────────┐
│                         用户请求流程                                   │
└──────────────────────────────────────────────────────────────────────┘

1. 用户登录
   ┌─────────┐
   │  用户   │
   └────┬────┘
        │ 1. 登录请求 (username/password)
        ↓
   ┌─────────────────────┐
   │  授权认证系统        │ ← 负责：验证凭证、颁发Token
   │  (Auth Service)     │    (JWT, OAuth2, etc.)
   └─────────┬───────────┘
        │ 2. 返回 Access Token
        │    {
        │      "access_token": "eyJhbGc...",
        │      "token_type": "Bearer",
        │      "expires_in": 3600
        │    }
        ↓
   ┌─────────┐
   │  用户   │ ← 保存 Token
   └─────────┘

2. 访问 GraphQL API
   ┌─────────┐
   │  用户   │
   └────┬────┘
        │ 3. GraphQL 请求 + Token
        │    Header: Authorization: Bearer eyJhbGc...
        │    Body:
        │    {
        │      query {
        │        user(id: "123") {
        │          name
        │          email
        │          sensitiveData
        │        }
        │      }
        │    }
        ↓
   ┌────────────────────────────────────────────────────┐
   │         GraphQL 联邦网关 (Apollo Gateway)           │
   │  ┌──────────────────────────────────────────────┐  │
   │  │  1. Token 验证                                │  │
   │  │     - 验证签名                                │  │
   │  │     - 检查过期时间                            │  │
   │  │     - 提取用户ID                              │  │
   │  └──────────────────────────────────────────────┘  │
   └───────┬────────────────────────────────────────────┘
        │ 4. 从Token提取 userId
        │    userId = "user-123"
        ↓
   ┌─────────────────────┐
   │  身份管理中心        │ ← 负责：用户身份、属性、组织信息
   │  (Identity Service) │
   └─────────┬───────────┘
        │ 5. 返回用户身份信息
        │    {
        │      "id": "user-123",
        │      "username": "alice",
        │      "email": "alice@company.com",
        │      "department": "Engineering",
        │      "groups": ["group-developers"],
        │      "attributes": {
        │        "securityLevel": 3,
        │        "employeeType": "full-time"
        │      }
        │    }
        ↓
   ┌────────────────────────────────────────────────────┐
   │         GraphQL 联邦网关                            │
   │  ┌──────────────────────────────────────────────┐  │
   │  │  2. 解析 GraphQL 查询                         │  │
   │  │     - 识别请求的字段                          │  │
   │  │     - 确定需要的资源                          │  │
   │  │     - 映射到权限需求                          │  │
   │  └──────────────────────────────────────────────┘  │
   └───────┬────────────────────────────────────────────┘
        │ 6. 权限检查请求
        │    {
        │      "userId": "user-123",
        │      "resource": "User:123",
        │      "field": "sensitiveData",
        │      "operation": "READ",
        │      "context": {
        │        "ipAddress": "203.0.113.45",
        │        "userAgent": "...",
        │        "timestamp": "2024-01-15T10:30:00Z"
        │      }
        │    }
        ↓
   ┌─────────────────────┐
   │  权限管理中心 ⭐     │ ← 负责：权限判断、策略评估
   │  (Permission        │    (你设计的这个系统)
   │   Management)       │
   │  ┌───────────────┐  │
   │  │ RBAC层级      │  │
   │  │ ABAC策略      │  │
   │  │ 字段级权限    │  │
   │  │ 数据级过滤    │  │
   │  │ 零信任验证    │  │
   │  └───────────────┘  │
   └─────────┬───────────┘
        │ 7. 返回权限决策
        │    {
        │      "allowed": true,
        │      "permissions": {
        │        "name": "allowed",
        │        "email": "allowed",
        │        "sensitiveData": "masked"
        │      },
        │      "dataFilters": [
        │        "department = 'Engineering'"
        │      ],
        │      "fieldMasks": {
        │        "sensitiveData": {
        │          "type": "partial",
        │          "keepPrefix": 3,
        │          "keepSuffix": 2
        │        }
        │      }
        │    }
        ↓
   ┌────────────────────────────────────────────────────┐
   │         GraphQL 联邦网关                            │
   │  ┌──────────────────────────────────────────────┐  │
   │  │  3. 路由到子服务                              │  │
   │  │     - 应用数据过滤器                          │  │
   │  │     - 携带权限上下文                          │  │
   │  └──────────────────────────────────────────────┘  │
   └───────┬────────────────────────────────────────────┘
        │ 8. 查询请求 (带过滤条件)
        ↓
   ┌─────────────────────┐
   │  GraphQL 子服务      │ ← 负责：业务逻辑、数据查询
   │  (User Service)     │
   └─────────┬───────────┘
        │ 9. 数据库查询 (应用过滤)
        │    SELECT * FROM users
        │    WHERE id = '123'
        │    AND department = 'Engineering'
        ↓
   ┌─────────────────────┐
   │  数据库              │
   └─────────┬───────────┘
        │ 10. 返回数据
        ↓
   ┌─────────────────────┐
   │  GraphQL 子服务      │
   └─────────┬───────────┘
        │ 11. 返回结果给网关
        ↓
   ┌────────────────────────────────────────────────────┐
   │         GraphQL 联邦网关                            │
   │  ┌──────────────────────────────────────────────┐  │
   │  │  4. 后处理                                    │  │
   │  │     - 应用字段掩码                            │  │
   │  │     - 移除未授权字段                          │  │
   │  │     - 聚合多服务结果                          │  │
   │  └──────────────────────────────────────────────┘  │
   └───────┬────────────────────────────────────────────┘
        │ 12. 返回最终结果
        │    {
        │      "data": {
        │        "user": {
        │          "name": "Alice",
        │          "email": "alice@company.com",
        │          "sensitiveData": "abc***yz"  ← 已脱敏
        │        }
        │      }
        │    }
        ↓
   ┌─────────┐
   │  用户   │
   └─────────┘
```

## 数据模型

### GraphQL 权限配置

```typescript
/**
 * GraphQL 字段权限配置
 */
interface GraphQLFieldPermission {
  id: string;
  typeName: string;           // GraphQL Type名称，如 "User", "Post"
  fieldName: string;          // 字段名，如 "email", "password"
  requiredPermission: PermissionBits;

  // 访问控制
  accessControl: {
    public: boolean;          // 公开字段（无需权限）
    requiresAuth: boolean;    // 需要认证
    allowedRoles?: string[];  // 允许的角色
    deniedRoles?: string[];   // 拒绝的角色
  };

  // 字段级掩码
  maskingRule?: {
    type: 'none' | 'full' | 'partial' | 'hash' | 'redact';
    config?: any;
  };

  // 条件访问
  conditionalAccess?: {
    condition: string;        // 条件表达式，如 "user.id === resource.ownerId"
    onFailure: 'hide' | 'mask' | 'error';
  };
}

/**
 * GraphQL 操作权限
 */
interface GraphQLOperationPermission {
  id: string;
  operationType: 'Query' | 'Mutation' | 'Subscription';
  operationName: string;     // 操作名，如 "getUser", "updatePost"
  requiredPermission: PermissionBits;

  // 速率限制
  rateLimit?: {
    maxRequests: number;
    windowSeconds: number;
    perUser: boolean;
  };

  // 复杂度限制
  complexityLimit?: number;

  // 审计要求
  auditLevel: 'none' | 'basic' | 'detailed';
}

/**
 * GraphQL 请求上下文
 */
interface GraphQLRequestContext {
  // 请求信息
  operation: {
    type: 'Query' | 'Mutation' | 'Subscription';
    name: string;
    query: string;
    variables: Record<string, any>;
  };

  // 用户信息（从Token提取 + 身份中心获取）
  user: {
    id: string;
    username: string;
    email: string;
    groups: string[];
    attributes: Record<string, any>;
  };

  // 访问上下文（零信任）
  access: {
    ipAddress: string;
    userAgent: string;
    deviceId?: string;
    geoLocation?: {
      country: string;
      region: string;
    };
  };

  // 请求元数据
  metadata: {
    requestId: string;
    timestamp: Date;
    clientVersion?: string;
  };
}

/**
 * 权限决策结果
 */
interface GraphQLPermissionDecision {
  allowed: boolean;

  // 字段级权限
  fieldPermissions: Map<string, {
    allowed: boolean;
    masked: boolean;
    maskingType?: string;
  }>;

  // 数据过滤
  dataFilters?: {
    typeName: string;
    filters: string[];        // SQL WHERE 条件
  }[];

  // 拒绝原因
  deniedFields?: string[];
  denialReason?: string;

  // 元数据
  metadata: {
    evaluationTime: number;
    appliedPolicies: string[];
    riskScore?: number;
  };
}
```

## 实现：GraphQL 权限指令

### 1. Schema 定义

```graphql
# 权限指令定义
directive @requiresPermission(
  permission: String!
  resourceType: String
) on FIELD_DEFINITION | OBJECT

directive @requiresRole(
  roles: [String!]!
  mode: RoleMatchMode = ANY
) on FIELD_DEFINITION | OBJECT

directive @mask(
  type: MaskType!
  config: MaskConfig
) on FIELD_DEFINITION

directive @rateLimit(
  maxRequests: Int!
  windowSeconds: Int!
) on FIELD_DEFINITION

enum RoleMatchMode {
  ANY   # 满足任一角色
  ALL   # 必须拥有所有角色
}

enum MaskType {
  FULL
  PARTIAL
  HASH
  REDACT
}

input MaskConfig {
  keepPrefix: Int
  keepSuffix: Int
  maskChar: String
}

# 使用示例
type User @requiresPermission(permission: "READ", resourceType: "User") {
  id: ID!
  username: String!
  email: String! @requiresRole(roles: ["user", "admin"])

  # 敏感字段
  phone: String! @mask(type: PARTIAL, config: { keepPrefix: 3, keepSuffix: 2, maskChar: "*" })
  ssn: String! @requiresPermission(permission: "ADMIN") @mask(type: HASH)

  # 关联数据
  posts: [Post!]! @requiresPermission(permission: "READ", resourceType: "Post")
}

type Query {
  # 普通查询
  user(id: ID!): User @requiresPermission(permission: "READ", resourceType: "User")

  # 需要特殊角色
  adminUsers: [User!]! @requiresRole(roles: ["admin"])

  # 速率限制
  searchUsers(query: String!): [User!]!
    @rateLimit(maxRequests: 10, windowSeconds: 60)
}

type Mutation {
  # 写权限
  updateUser(id: ID!, input: UserInput!): User
    @requiresPermission(permission: "WRITE", resourceType: "User")

  # 删除权限
  deleteUser(id: ID!): Boolean
    @requiresPermission(permission: "DELETE", resourceType: "User")
}
```

### 2. 权限指令实现

```typescript
import { SchemaDirectiveVisitor } from '@graphql-tools/utils';
import { defaultFieldResolver, GraphQLField } from 'graphql';
import { PermissionFlags } from './unified-types';
import { UnifiedPermissionEngine } from './unified-permission-engine';

/**
 * @requiresPermission 指令实现
 */
export class RequiresPermissionDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field: GraphQLField<any, any>) {
    const { permission, resourceType } = this.args;
    const { resolve = defaultFieldResolver } = field;

    // 替换 resolver
    field.resolve = async function (source, args, context, info) {
      // 1. 获取权限引擎实例
      const permissionEngine: UnifiedPermissionEngine = context.permissionEngine;

      // 2. 确定资源ID
      const resourceId = source?.id || args?.id || `${resourceType}:${info.fieldName}`;

      // 3. 映射权限字符串到权限位
      const permissionBits = mapPermissionString(permission);

      // 4. 执行权限检查
      const decision = await permissionEngine.checkPermission(
        context.user.id,
        resourceId,
        permissionBits,
        {
          ipAddress: context.request.ip,
          deviceType: context.request.deviceType,
          isWorkingHours: isWorkingHours(new Date()),
        }
      );

      // 5. 处理决策结果
      if (!decision.allowed) {
        throw new Error(`Permission denied: ${decision.reasons[0]}`);
      }

      // 6. 执行原始 resolver
      const result = await resolve.call(this, source, args, context, info);

      // 7. 应用字段掩码（如果有）
      if (decision.fieldMasks && decision.fieldMasks.length > 0) {
        return applyFieldMasks(result, decision.fieldMasks);
      }

      return result;
    };
  }
}

/**
 * @requiresRole 指令实现
 */
export class RequiresRoleDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field: GraphQLField<any, any>) {
    const { roles, mode } = this.args;
    const { resolve = defaultFieldResolver } = field;

    field.resolve = async function (source, args, context, info) {
      const userRoles = context.user.groups || [];

      let hasPermission = false;
      if (mode === 'ANY') {
        hasPermission = roles.some((role: string) => userRoles.includes(role));
      } else {
        hasPermission = roles.every((role: string) => userRoles.includes(role));
      }

      if (!hasPermission) {
        throw new Error(`Role requirement not met. Required: ${roles.join(', ')}`);
      }

      return resolve.call(this, source, args, context, info);
    };
  }
}

/**
 * @mask 指令实现
 */
export class MaskDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field: GraphQLField<any, any>) {
    const { type, config } = this.args;
    const { resolve = defaultFieldResolver } = field;

    field.resolve = async function (source, args, context, info) {
      const value = await resolve.call(this, source, args, context, info);

      if (value === null || value === undefined) {
        return value;
      }

      // 检查用户是否有权限查看未掩码的值
      const canViewUnmasked = await checkUnmaskedPermission(
        context.permissionEngine,
        context.user.id,
        source.id,
        info.fieldName
      );

      if (canViewUnmasked) {
        return value;
      }

      // 应用掩码
      return maskValue(value, type, config);
    };
  }
}

/**
 * @rateLimit 指令实现
 */
export class RateLimitDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field: GraphQLField<any, any>) {
    const { maxRequests, windowSeconds } = this.args;
    const { resolve = defaultFieldResolver } = field;

    field.resolve = async function (source, args, context, info) {
      const userId = context.user.id;
      const key = `ratelimit:${info.fieldName}:${userId}`;

      // 检查速率限制
      const current = await context.redis.incr(key);
      if (current === 1) {
        await context.redis.expire(key, windowSeconds);
      }

      if (current > maxRequests) {
        throw new Error(
          `Rate limit exceeded. Max ${maxRequests} requests per ${windowSeconds} seconds`
        );
      }

      return resolve.call(this, source, args, context, info);
    };
  }
}

// ==================== 辅助函数 ====================

function mapPermissionString(permission: string): PermissionBits {
  const map: Record<string, PermissionBits> = {
    'READ': PermissionFlags.READ,
    'WRITE': PermissionFlags.WRITE,
    'DELETE': PermissionFlags.DELETE,
    'ADMIN': PermissionFlags.ADMIN,
    'EXECUTE': PermissionFlags.EXECUTE,
  };
  return map[permission] || PermissionFlags.NONE;
}

function isWorkingHours(date: Date): boolean {
  const hour = date.getHours();
  const day = date.getDay();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
}

async function checkUnmaskedPermission(
  engine: UnifiedPermissionEngine,
  userId: string,
  resourceId: string,
  fieldName: string
): Promise<boolean> {
  const result = await engine.checkPermission(
    userId,
    resourceId,
    PermissionFlags.ADMIN,
    {}
  );
  return result.allowed;
}

function maskValue(value: string, type: string, config: any): string {
  switch (type) {
    case 'FULL':
      return '***';

    case 'PARTIAL':
      const str = String(value);
      const keepPrefix = config?.keepPrefix || 3;
      const keepSuffix = config?.keepSuffix || 2;
      const maskChar = config?.maskChar || '*';

      if (str.length <= keepPrefix + keepSuffix) {
        return maskChar.repeat(str.length);
      }

      const prefix = str.substring(0, keepPrefix);
      const suffix = str.substring(str.length - keepSuffix);
      const masked = maskChar.repeat(str.length - keepPrefix - keepSuffix);
      return prefix + masked + suffix;

    case 'HASH':
      // 简化实现，实际应使用加密哈希
      return `hash_${value.length}_${Date.now()}`;

    case 'REDACT':
      return '[REDACTED]';

    default:
      return value;
  }
}

function applyFieldMasks(result: any, masks: any[]): any {
  if (Array.isArray(result)) {
    return result.map(item => applyFieldMasks(item, masks));
  }

  if (result && typeof result === 'object') {
    const masked = { ...result };
    for (const mask of masks) {
      if (masked[mask.fieldName] !== undefined) {
        masked[mask.fieldName] = maskValue(
          masked[mask.fieldName],
          mask.maskingType,
          mask.maskingConfig
        );
      }
    }
    return masked;
  }

  return result;
}
```

### 3. Apollo Gateway 集成

```typescript
import { ApolloGateway, RemoteGraphQLDataSource } from '@apollo/gateway';
import { ApolloServer } from '@apollo/server';
import { UnifiedPermissionEngine } from './unified-permission-engine';
import { verifyToken } from './auth-utils';
import { getIdentity } from './identity-service-client';

/**
 * 自定义数据源，集成权限检查
 */
class PermissionAwareDataSource extends RemoteGraphQLDataSource {
  constructor(
    config: any,
    private permissionEngine: UnifiedPermissionEngine
  ) {
    super(config);
  }

  willSendRequest({ request, context }: any) {
    // 传递用户上下文到子服务
    request.http.headers.set('x-user-id', context.user.id);
    request.http.headers.set('x-user-roles', context.user.groups.join(','));

    // 传递数据过滤器（如果有）
    if (context.dataFilters) {
      request.http.headers.set(
        'x-data-filters',
        JSON.stringify(context.dataFilters)
      );
    }
  }
}

/**
 * 创建 Apollo Gateway
 */
function createGateway() {
  const permissionEngine = new UnifiedPermissionEngine(dataStore);

  const gateway = new ApolloGateway({
    serviceList: [
      { name: 'users', url: 'http://localhost:4001/graphql' },
      { name: 'posts', url: 'http://localhost:4002/graphql' },
      { name: 'comments', url: 'http://localhost:4003/graphql' },
    ],

    buildService({ url }) {
      return new PermissionAwareDataSource({ url }, permissionEngine);
    },
  });

  return gateway;
}

/**
 * 创建 Apollo Server
 */
async function startServer() {
  const gateway = createGateway();
  const permissionEngine = new UnifiedPermissionEngine(dataStore);

  const server = new ApolloServer({
    gateway,

    // Context 构建器
    context: async ({ req }) => {
      // 1. 验证 Token
      const token = extractToken(req.headers.authorization);
      if (!token) {
        throw new Error('No authentication token provided');
      }

      const tokenPayload = await verifyToken(token);
      if (!tokenPayload) {
        throw new Error('Invalid token');
      }

      // 2. 从身份管理中心获取用户完整信息
      const user = await getIdentity(tokenPayload.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // 3. 构建上下文
      return {
        user,
        permissionEngine,
        request: {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          deviceType: detectDeviceType(req.headers['user-agent']),
        },
        redis: redisClient, // 用于速率限制
      };
    },

    // 添加插件进行查询级权限检查
    plugins: [
      {
        async requestDidStart(requestContext) {
          return {
            async didResolveOperation(context) {
              // 在执行前检查操作级权限
              const operationName = context.operation.name?.value;
              const operationType = context.operation.operation;

              if (operationName) {
                const hasPermission = await checkOperationPermission(
                  permissionEngine,
                  context.contextValue.user.id,
                  operationType,
                  operationName
                );

                if (!hasPermission) {
                  throw new Error(
                    `Permission denied for operation: ${operationName}`
                  );
                }
              }
            },

            async willSendResponse(context) {
              // 审计日志
              await auditLog({
                userId: context.contextValue.user.id,
                operation: context.operation?.name?.value,
                query: context.request.query,
                variables: context.request.variables,
                success: !context.errors,
                timestamp: new Date(),
              });
            },
          };
        },
      },
    ],
  });

  await server.start();
  console.log('GraphQL Gateway started');
}

// ==================== 辅助函数 ====================

function extractToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

function detectDeviceType(userAgent?: string): 'desktop' | 'mobile' | 'tablet' {
  if (!userAgent) return 'desktop';
  if (/mobile/i.test(userAgent)) return 'mobile';
  if (/tablet/i.test(userAgent)) return 'tablet';
  return 'desktop';
}

async function checkOperationPermission(
  engine: UnifiedPermissionEngine,
  userId: string,
  operationType: string,
  operationName: string
): Promise<boolean> {
  // 从配置中获取操作需要的权限
  const operationConfig = await dataStore.getGraphQLOperationPermission(
    operationType,
    operationName
  );

  if (!operationConfig) {
    return true; // 未配置则允许
  }

  const result = await engine.checkPermission(
    userId,
    `${operationType}:${operationName}`,
    operationConfig.requiredPermission,
    {}
  );

  return result.allowed;
}

async function auditLog(logEntry: any): Promise<void> {
  await dataStore.saveAuditLog({
    id: generateId(),
    timestamp: logEntry.timestamp,
    userId: logEntry.userId,
    action: 'graphql_operation',
    metadata: {
      operation: logEntry.operation,
      success: logEntry.success,
    },
  } as any);
}

function generateId(): string {
  return `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 启动服务器
startServer().catch(console.error);
```

### 4. 子服务集成（应用数据过滤）

```typescript
// User Service (子服务)
import { buildSubgraphSchema } from '@apollo/subgraph';
import { gql } from 'graphql-tag';

const typeDefs = gql`
  type User @key(fields: "id") {
    id: ID!
    username: String!
    email: String!
    department: String!
    phone: String
  }

  type Query {
    user(id: ID!): User
    users: [User!]!
  }
`;

const resolvers = {
  Query: {
    async user(_: any, { id }: any, context: any) {
      // 1. 从 header 获取数据过滤器
      const dataFilters = parseDataFilters(context.headers['x-data-filters']);

      // 2. 构建 SQL 查询
      let query = 'SELECT * FROM users WHERE id = $1';
      const params = [id];

      if (dataFilters && dataFilters.length > 0) {
        query += ' AND ' + dataFilters.join(' AND ');
      }

      // 3. 执行查询
      const result = await db.query(query, params);

      return result.rows[0] || null;
    },

    async users(_: any, args: any, context: any) {
      // 应用数据过滤
      const dataFilters = parseDataFilters(context.headers['x-data-filters']);

      let query = 'SELECT * FROM users';
      if (dataFilters && dataFilters.length > 0) {
        query += ' WHERE ' + dataFilters.join(' AND ');
      }

      const result = await db.query(query);
      return result.rows;
    },
  },
};

function parseDataFilters(headerValue?: string): string[] {
  if (!headerValue) return [];
  try {
    return JSON.parse(headerValue);
  } catch {
    return [];
  }
}

export const schema = buildSubgraphSchema({ typeDefs, resolvers });
```

## 完整示例

```typescript
// 客户端请求
const query = `
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      username
      email
      phone
      department
    }
  }
`;

fetch('http://gateway.example.com/graphql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
  },
  body: JSON.stringify({
    query,
    variables: { id: '123' },
  }),
})
.then(res => res.json())
.then(data => {
  console.log(data);
  // {
  //   "data": {
  //     "user": {
  //       "id": "123",
  //       "username": "alice",
  //       "email": "alice@company.com",
  //       "phone": "555***89",  ← 已掩码
  //       "department": "Engineering"
  //     }
  //   }
  // }
});
```

## 数据库 Schema

```sql
-- GraphQL 字段权限配置
CREATE TABLE graphql_field_permissions (
    id UUID PRIMARY KEY,
    type_name VARCHAR(100) NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    required_permission INTEGER NOT NULL,
    access_control JSONB NOT NULL DEFAULT '{}',
    masking_rule JSONB,
    conditional_access JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(type_name, field_name)
);

-- GraphQL 操作权限配置
CREATE TABLE graphql_operation_permissions (
    id UUID PRIMARY KEY,
    operation_type VARCHAR(20) NOT NULL,
    operation_name VARCHAR(100) NOT NULL,
    required_permission INTEGER NOT NULL,
    rate_limit JSONB,
    complexity_limit INTEGER,
    audit_level VARCHAR(20) NOT NULL DEFAULT 'basic',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(operation_type, operation_name)
);

-- GraphQL 请求审计日志
CREATE TABLE graphql_audit_logs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    operation_type VARCHAR(20),
    operation_name VARCHAR(100),
    query TEXT NOT NULL,
    variables JSONB,
    success BOOLEAN NOT NULL,
    execution_time_ms INTEGER,
    error_message TEXT,
    ip_address INET,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_graphql_audit_user ON graphql_audit_logs(user_id);
CREATE INDEX idx_graphql_audit_time ON graphql_audit_logs(timestamp DESC);
CREATE INDEX idx_graphql_audit_operation ON graphql_audit_logs(operation_type, operation_name);
```

## 总结

你的理解完全正确！整个流程就是：

```
用户
 ↓ (1. 登录)
授权认证系统 → Access Token
 ↓ (2. 携带Token访问)
GraphQL 联邦网关
 ↓ (3. 验证Token + 获取用户信息)
身份管理中心 → 用户身份、属性
 ↓ (4. 权限检查)
权限管理中心 (你的系统) → 权限决策
 ↓ (5. 根据权限访问数据)
GraphQL 子服务 → 返回数据
 ↓ (6. 应用掩码和过滤)
GraphQL 联邦网关 → 返回给用户
```

这个架构的优点：
- ✅ **关注点分离**：认证、身份、权限各司其职
- ✅ **集中式权限管理**：所有权限规则统一管理
- ✅ **细粒度控制**：字段级、数据级、操作级全覆盖
- ✅ **可扩展性**：新增子服务只需接入网关
- ✅ **零信任**：每个请求都经过完整验证
- ✅ **审计合规**：所有操作都有日志记录
