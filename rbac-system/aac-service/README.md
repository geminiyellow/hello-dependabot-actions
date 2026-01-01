# AAC Service - Account Authentication Center

完整的账户认证中心，实现了基于 Keycloak 的认证、多租户选择和 JWT 令牌生命周期管理。

## 📋 功能特性

### ✅ 已实现的功能

- **Keycloak OAuth2 集成**: 使用 Keycloak 进行用户认证
- **多租户登录流程**: 支持用户选择租户后签发 JWT
- **Token 生命周期管理**:
  - 签发 Access Token (15分钟有效期)
  - 签发 Refresh Token (7天有效期)
  - Token 刷新机制
  - Token 撤销 (黑名单机制)
  - Session 管理
- **Redis 会话存储**: 所有 session 和 token 状态存储在 Redis
- **租户切换**: 支持用户在多个租户间切换
- **会话管理**: 查看和撤销用户的所有活跃会话
- **安全过滤器**: JWT 自动验证和认证上下文设置

## 🏗️ 架构设计

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │
       │ 1. GET /auth/login
       ▼
┌─────────────────────────────────────┐
│          AAC Service                │
│  ┌──────────────────────────────┐  │
│  │  AuthController              │  │
│  │  - /auth/login               │  │
│  │  - /auth/callback            │  │
│  │  - /auth/select-tenant       │  │
│  │  - /auth/refresh             │  │
│  │  - /auth/logout              │  │
│  └────┬─────────────────────┬───┘  │
│       │                     │      │
│  ┌────▼───────┐      ┌──────▼────┐ │
│  │KeycloakSvc │      │ TokenSvc  │ │
│  └────┬───────┘      └──────┬────┘ │
│       │                     │      │
└───────┼─────────────────────┼──────┘
        │                     │
   ┌────▼────┐          ┌─────▼────┐
   │Keycloak │          │  Redis   │
   │         │          │ (Session)│
   └─────────┘          └──────────┘
        │
   ┌────▼────┐
   │   IMC   │
   │ Service │
   └─────────┘
```

## 🚀 快速开始

### 前置要求

- Java 17+
- Maven 3.8+
- Docker & Docker Compose

### 启动服务

```bash
# 1. 启动所有服务 (Keycloak, Redis, AAC)
docker-compose up -d

# 2. 查看日志
docker-compose logs -f aac-service

# 3. 检查健康状态
curl http://localhost:8080/actuator/health
```

服务启动后:
- **AAC Service**: http://localhost:8080
- **Keycloak Admin**: http://localhost:8180 (admin/admin)
- **Redis**: localhost:6379

### 本地开发

```bash
# 1. 启动依赖服务 (Keycloak + Redis)
docker-compose up -d postgres keycloak redis

# 2. 运行 Spring Boot 应用
mvn spring-boot:run

# 3. 或使用 IDE 运行 AacServiceApplication.java
```

## 📚 API 文档

### 1. 登录流程

#### 1.1 获取 Keycloak 登录 URL

**请求:**
```bash
GET http://localhost:8080/auth/login
```

**响应:**
```json
{
  "loginUrl": "http://localhost:8180/realms/enterprise/protocol/openid-connect/auth?client_id=aac-service&redirect_uri=http://localhost:8080/auth/callback&response_type=code&scope=openid%20profile%20email&state=abc123",
  "state": "abc123"
}
```

**前端处理:**
```javascript
// 获取登录 URL
const response = await fetch('http://localhost:8080/auth/login');
const { loginUrl } = await response.json();

// 重定向到 Keycloak
window.location.href = loginUrl;
```

#### 1.2 处理回调 (自动)

Keycloak 认证成功后会重定向到:
```
http://localhost:8080/auth/callback?code=xxx&state=abc123
```

AAC Service 自动处理回调并返回两种结果:

**情况 A: 单个租户 (直接返回 JWT)**

```json
{
  "status": "success",
  "accessToken": "eyJhbGciOiJIUzUxMiJ9...",
  "refreshToken": "eyJhbGciOiJIUzUxMiJ9...",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

**情况 B: 多个租户 (需要选择)**

```json
{
  "status": "tenant_selection_required",
  "userId": "user-123",
  "tempToken": "eyJhbGciOiJIUzUxMiJ9...",
  "tenants": [
    {
      "id": "tenant-1",
      "name": "ACME Corporation",
      "code": "acme",
      "isDefault": true
    },
    {
      "id": "tenant-2",
      "name": "TechCorp Inc",
      "code": "techcorp",
      "isDefault": false
    }
  ]
}
```

#### 1.3 选择租户

**请求:**
```bash
POST http://localhost:8080/auth/select-tenant
Authorization: Bearer <temp_token>
Content-Type: application/json

{
  "tenantId": "tenant-1"
}
```

**响应:**
```json
{
  "status": "success",
  "accessToken": "eyJhbGciOiJIUzUxMiJ9...",
  "refreshToken": "eyJhbGciOiJIUzUxMiJ9...",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

**前端处理:**
```javascript
// 显示租户选择界面
function showTenantSelection(response) {
  const { tenants, tempToken } = response;

  // 用户选择租户后
  const selectedTenantId = tenants[0].id;

  // 调用选择租户 API
  const result = await fetch('http://localhost:8080/auth/select-tenant', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tempToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tenantId: selectedTenantId })
  });

  const { accessToken, refreshToken } = await result.json();

  // 存储 tokens
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}
```

### 2. Token 管理

#### 2.1 刷新 Token

**请求:**
```bash
POST http://localhost:8080/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzUxMiJ9..."
}
```

**响应:**
```json
{
  "status": "success",
  "accessToken": "eyJhbGciOiJIUzUxMiJ9...",  // 新的 access token
  "refreshToken": "eyJhbGciOiJIUzUxMiJ9...",  // 原 refresh token
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

**前端自动刷新:**
```javascript
// 拦截器自动刷新 token
axios.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refreshToken');

      try {
        const response = await fetch('http://localhost:8080/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });

        const { accessToken } = await response.json();
        localStorage.setItem('accessToken', accessToken);

        // 重试原请求
        error.config.headers.Authorization = `Bearer ${accessToken}`;
        return axios.request(error.config);
      } catch (e) {
        // 刷新失败，重定向到登录
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
```

#### 2.2 登出

**请求:**
```bash
POST http://localhost:8080/auth/logout
Authorization: Bearer <access_token>
```

**响应:**
```json
{
  "message": "Logged out successfully"
}
```

**说明:**
- 撤销当前 session 的所有 tokens
- 将 tokens 加入黑名单
- 删除 Redis 中的 session

### 3. 租户切换

#### 3.1 切换租户

**请求:**
```bash
POST http://localhost:8080/auth/switch-tenant
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "tenantId": "tenant-2"
}
```

**响应:**
```json
{
  "status": "success",
  "accessToken": "eyJhbGciOiJIUzUxMiJ9...",  // 新租户的 token
  "refreshToken": "eyJhbGciOiJIUzUxMiJ9...",
  "sessionId": "new-session-id",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

**说明:**
- 撤销旧 session
- 签发新租户的 JWT
- 新 JWT 包含新的 tenant_id

### 4. 会话管理

#### 4.1 查看所有会话

**请求:**
```bash
GET http://localhost:8080/auth/sessions
Authorization: Bearer <access_token>
```

**响应:**
```json
[
  {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "user-123",
    "tenantId": "tenant-1",
    "tenantName": "ACME Corporation",
    "activeTokens": ["jti-1", "jti-2"],
    "createdAt": "2024-01-15T10:30:00Z",
    "lastActivityAt": "2024-01-15T14:25:30Z",
    "ipAddress": "192.168.1.100",
    "userAgent": "Mozilla/5.0..."
  },
  {
    "sessionId": "another-session-id",
    "userId": "user-123",
    "tenantId": "tenant-1",
    "tenantName": "ACME Corporation",
    "activeTokens": ["jti-3"],
    "createdAt": "2024-01-14T08:15:00Z",
    "lastActivityAt": "2024-01-15T09:10:20Z",
    "ipAddress": "10.0.0.5",
    "userAgent": "PostmanRuntime/7.26.8"
  }
]
```

**用例:** 用户可以查看自己在不同设备/浏览器上的所有活跃会话

#### 4.2 撤销指定会话

**请求:**
```bash
DELETE http://localhost:8080/auth/sessions/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <access_token>
```

**响应:**
```json
{
  "message": "Session revoked successfully"
}
```

**用例:** 远程登出其他设备

## 🔐 JWT Token 结构

### Access Token Payload

```json
{
  "jti": "token-unique-id",
  "sub": "user-123",
  "tenant_id": "tenant-1",
  "tenant_name": "ACME Corporation",
  "tenant_code": "acme",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "ACCESS",
  "iss": "aac-service",
  "iat": 1705320000,
  "exp": 1705320900
}
```

### Refresh Token Payload

```json
{
  "jti": "refresh-token-id",
  "sub": "user-123",
  "tenant_id": "tenant-1",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "REFRESH",
  "iss": "aac-service",
  "iat": 1705320000,
  "exp": 1705924800
}
```

### Temp Token Payload (租户选择用)

```json
{
  "jti": "temp-token-id",
  "sub": "user-123",
  "type": "TEMP",
  "iss": "aac-service",
  "iat": 1705320000,
  "exp": 1705320300
}
```

## 🗄️ Redis 数据结构

### Session 存储

```
Key: session:{sessionId}
Type: String (JSON)
TTL: 7 days
Value:
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-123",
  "tenantId": "tenant-1",
  "tenantName": "ACME Corporation",
  "activeTokens": ["jti-1", "jti-2"],
  "createdAt": "2024-01-15T10:30:00Z",
  "lastActivityAt": "2024-01-15T14:25:30Z",
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0..."
}
```

### Token 黑名单

```
Key: token_blacklist:{jti}
Type: String
TTL: Token 剩余有效期
Value: "revoked"
```

### 临时 Token (租户选择用)

```
Key: temp_token:{jti}
Type: String
TTL: 5 minutes
Value: "user-123"
```

## 🔒 安全特性

### 1. Token 验证流程

```java
JwtAuthenticationFilter → TokenService.validateToken()
  ├─ 1. 解析 JWT (验证签名和过期时间)
  ├─ 2. 检查黑名单 (token_blacklist:{jti})
  ├─ 3. 验证 Session 存在 (session:{sessionId})
  └─ 4. 更新最后活动时间
```

### 2. Token 撤销机制

- **单个 Token 撤销**: 加入黑名单，TTL = token 剩余有效期
- **Session 撤销**: 删除 session + 黑名单所有关联 tokens
- **用户全局撤销**: 查找所有用户 sessions 并全部撤销

### 3. 权限变更自动失效

```java
// IMC 发布权限变更事件
@EventListener
public void onPermissionChanged(PermissionChangedEvent event) {
    // 撤销该用户的所有 tokens
    tokenService.revokeAllUserTokens(event.getUserId());
}
```

## 🧪 测试

### 测试用户

Keycloak 预置用户:

| 用户名 | 密码 | 角色 |
|--------|------|------|
| testuser | password | user |
| admin | admin | admin, user |

### 完整登录流程测试

```bash
# 1. 获取登录 URL
curl http://localhost:8080/auth/login

# 2. 浏览器访问返回的 loginUrl，使用 testuser/password 登录

# 3. Keycloak 会重定向到 callback，返回 JWT 或租户选择

# 4. 如需选择租户
curl -X POST http://localhost:8080/auth/select-tenant \
  -H "Authorization: Bearer <temp_token>" \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "tenant-1"}'

# 5. 使用 access token 访问受保护资源
curl http://localhost:8080/auth/sessions \
  -H "Authorization: Bearer <access_token>"

# 6. 刷新 token
curl -X POST http://localhost:8080/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refresh_token>"}'

# 7. 登出
curl -X POST http://localhost:8080/auth/logout \
  -H "Authorization: Bearer <access_token>"
```

## 📊 监控和调试

### 健康检查

```bash
curl http://localhost:8080/actuator/health
```

### 查看 Redis 数据 (可选)

启动 Redis Commander:
```bash
docker-compose --profile debug up redis-commander
```

访问: http://localhost:8081

### 日志

```bash
# 查看 AAC 日志
docker-compose logs -f aac-service

# 查看 Keycloak 日志
docker-compose logs -f keycloak

# 查看 Redis 日志
docker-compose logs -f redis
```

## 🔧 配置

### 环境变量

创建 `.env` 文件:

```bash
# 复制示例配置
cp .env.example .env

# 编辑配置
vim .env
```

关键配置:

- `JWT_SECRET`: JWT 签名密钥 (生产环境必须修改!)
- `KEYCLOAK_CLIENT_SECRET`: Keycloak 客户端密钥
- `IMC_BASE_URL`: IMC 服务地址
- `IMC_API_KEY`: IMC API 密钥

### Token 有效期调整

```yaml
# application.yml
jwt:
  access-token-expiration: 900000      # 15分钟
  refresh-token-expiration: 604800000  # 7天
  temp-token-expiration: 300000        # 5分钟
```

## 🚢 生产部署

### 1. 修改密钥

```bash
# 生成安全的 JWT 密钥 (256 bits)
openssl rand -base64 32

# 更新 .env
JWT_SECRET=<生成的密钥>
```

### 2. 修改 Keycloak 客户端密钥

1. 登录 Keycloak Admin Console
2. Clients → aac-service → Credentials
3. 重新生成 Secret
4. 更新 `KEYCLOAK_CLIENT_SECRET` 环境变量

### 3. 使用外部 Redis (推荐)

```yaml
# application.yml
spring:
  data:
    redis:
      host: your-redis-cluster.amazonaws.com
      port: 6379
      password: ${REDIS_PASSWORD}
      ssl: true
```

### 4. HTTPS 配置

```yaml
server:
  port: 8443
  ssl:
    enabled: true
    key-store: classpath:keystore.p12
    key-store-password: ${KEYSTORE_PASSWORD}
    key-store-type: PKCS12
```

## 📖 集成指南

### Spring Boot 应用集成

```java
// 1. 添加依赖
dependencies {
    implementation 'io.jsonwebtoken:jjwt-api:0.12.3'
    runtimeOnly 'io.jsonwebtoken:jjwt-impl:0.12.3'
    runtimeOnly 'io.jsonwebtoken:jjwt-jackson:0.12.3'
}

// 2. 创建 JWT 验证过滤器
@Component
public class JwtValidationFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) {
        String token = extractToken(request);

        // 调用 AAC 验证 token (或本地验证 JWT 签名)
        if (isValid(token)) {
            Claims claims = parseToken(token);
            String userId = claims.getSubject();
            String tenantId = claims.get("tenant_id", String.class);

            // 设置认证上下文
            setAuthentication(userId, tenantId);
        }

        filterChain.doFilter(request, response);
    }
}
```

### React 前端集成

```javascript
// auth.js
export class AuthService {
  async login() {
    // 1. 获取 Keycloak 登录 URL
    const { loginUrl } = await fetch('http://localhost:8080/auth/login')
      .then(r => r.json());

    // 2. 重定向到 Keycloak
    window.location.href = loginUrl;
  }

  async handleCallback() {
    // 3. 处理回调 (当前 URL 包含 ?code=xxx)
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (!code) return;

    // 4. 自动调用 /auth/callback
    const response = await fetch(`http://localhost:8080/auth/callback?code=${code}`)
      .then(r => r.json());

    if (response.status === 'success') {
      // 单租户，直接存储 token
      this.setTokens(response.accessToken, response.refreshToken);
      return { success: true };
    } else {
      // 多租户，显示选择界面
      return {
        success: false,
        tenants: response.tenants,
        tempToken: response.tempToken
      };
    }
  }

  async selectTenant(tenantId, tempToken) {
    const response = await fetch('http://localhost:8080/auth/select-tenant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tempToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tenantId })
    }).then(r => r.json());

    this.setTokens(response.accessToken, response.refreshToken);
  }

  setTokens(accessToken, refreshToken) {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }
}
```

## 🤝 与 IMC/PMC 集成

AAC Service 需要与 IMC (Identity Management Center) 集成来获取租户信息。

### IMC 需要提供的 API

```
GET /api/users/{userId}/tenants
返回用户的所有租户列表

GET /api/tenants/{tenantId}
返回租户详细信息
```

### IMC Mock Service (开发用)

```javascript
// mock-imc.js
const express = require('express');
const app = express();

app.get('/api/users/:userId/tenants', (req, res) => {
  res.json([
    { id: 'tenant-1', name: 'ACME Corp', code: 'acme', isDefault: true },
    { id: 'tenant-2', name: 'TechCorp', code: 'tech', isDefault: false }
  ]);
});

app.get('/api/tenants/:tenantId', (req, res) => {
  res.json({
    id: req.params.tenantId,
    name: 'ACME Corp',
    code: 'acme',
    isDefault: true
  });
});

app.listen(8081);
```

## 📝 许可证

Apache 2.0

## 👥 贡献

欢迎提交 Issue 和 Pull Request!
