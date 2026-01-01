# AAC Service - 快速开始指南

## 🎯 5分钟快速体验

### 1. 启动服务 (1分钟)

```bash
cd rbac-system/aac-service

# 启动所有服务
docker-compose up -d

# 等待服务启动 (约30-60秒)
docker-compose logs -f aac-service

# 看到 "Started AacServiceApplication" 表示启动成功
```

### 2. 测试完整登录流程 (3分钟)

#### 方式 A: 使用浏览器测试

```bash
# 1. 获取登录 URL
curl http://localhost:8080/auth/login
# 复制返回的 "loginUrl"

# 2. 在浏览器打开 loginUrl
# 使用预置用户登录: testuser / password

# 3. Keycloak 会自动重定向到:
# http://localhost:8080/auth/callback?code=xxx

# 4. 查看返回的 JSON (包含 accessToken 或需要选择租户)
```

#### 方式 B: 使用 API 测试工具

```bash
# 1. 获取登录 URL
GET http://localhost:8080/auth/login

# 响应:
{
  "loginUrl": "http://localhost:8180/realms/enterprise/protocol/openid-connect/auth?...",
  "state": "abc123"
}

# 2. 在浏览器打开 loginUrl，登录后获取 code

# 3. 手动调用 callback
GET http://localhost:8080/auth/callback?code=<从URL获取>&state=abc123

# 4. 如果返回 tenant_selection_required:
POST http://localhost:8080/auth/select-tenant
Authorization: Bearer <tempToken>
{
  "tenantId": "tenant-1"
}

# 5. 获得最终 JWT
{
  "status": "success",
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "sessionId": "...",
  "expiresIn": 900
}
```

### 3. 测试 Token 功能 (1分钟)

```bash
# 使用 accessToken 查看会话
curl -H "Authorization: Bearer <accessToken>" \
  http://localhost:8080/auth/sessions

# 刷新 token
curl -X POST http://localhost:8080/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refreshToken>"}'

# 登出
curl -X POST http://localhost:8080/auth/logout \
  -H "Authorization: Bearer <accessToken>"
```

## 🔧 配置 IMC Mock Service

AAC 依赖 IMC 服务提供租户信息。开发时可以使用 Mock:

```javascript
// mock-imc.js
const express = require('express');
const app = express();

app.use(express.json());

// Mock 用户租户列表
app.get('/api/users/:userId/tenants', (req, res) => {
  console.log('📋 Fetching tenants for user:', req.params.userId);

  res.json([
    {
      id: 'tenant-acme',
      name: 'ACME Corporation',
      code: 'acme',
      isDefault: true
    },
    {
      id: 'tenant-tech',
      name: 'TechCorp Inc',
      code: 'tech',
      isDefault: false
    }
  ]);
});

// Mock 租户详情
app.get('/api/tenants/:tenantId', (req, res) => {
  console.log('🏢 Fetching tenant:', req.params.tenantId);

  const tenants = {
    'tenant-acme': {
      id: 'tenant-acme',
      name: 'ACME Corporation',
      code: 'acme',
      isDefault: true
    },
    'tenant-tech': {
      id: 'tenant-tech',
      name: 'TechCorp Inc',
      code: 'tech',
      isDefault: false
    }
  };

  res.json(tenants[req.params.tenantId] || tenants['tenant-acme']);
});

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`🚀 Mock IMC Service running on http://localhost:${PORT}`);
});
```

**启动 Mock IMC:**

```bash
# 安装 express
npm install express

# 运行 mock
node mock-imc.js

# 测试
curl http://localhost:8081/api/users/test-user/tenants
```

**更新 AAC 配置:**

```bash
# docker-compose.yml 或 .env
IMC_BASE_URL=http://host.docker.internal:8081
IMC_API_KEY=mock-key
```

## 📊 验证服务状态

```bash
# 检查所有容器
docker-compose ps

# 预期输出:
#   aac-keycloak    running   8180:8080
#   aac-postgres    running   5432:5432
#   aac-redis       running   6379:6379
#   aac-service     running   8080:8080

# 检查 AAC 健康
curl http://localhost:8080/actuator/health

# 检查 Keycloak
curl http://localhost:8180/health/ready

# 检查 Redis
docker exec aac-redis redis-cli ping
```

## 🧪 预置测试用户

| 用户名 | 密码 | 邮箱 | 角色 |
|--------|------|------|------|
| testuser | password | test@example.com | user |
| admin | admin | admin@example.com | admin, user |

## 🔍 调试技巧

### 1. 查看 JWT 内容

访问 https://jwt.io，粘贴 accessToken 查看解码后的内容:

```json
{
  "jti": "unique-token-id",
  "sub": "user-id-from-keycloak",
  "tenant_id": "tenant-acme",
  "tenant_name": "ACME Corporation",
  "tenant_code": "acme",
  "session_id": "session-uuid",
  "type": "ACCESS",
  "iss": "aac-service",
  "iat": 1705320000,
  "exp": 1705320900
}
```

### 2. 查看 Redis 数据

```bash
# 启动 Redis Commander (可视化工具)
docker-compose --profile debug up redis-commander

# 访问 http://localhost:8081
# 查看 session:*, token_blacklist:*, temp_token:* 等 key
```

### 3. 查看详细日志

```bash
# AAC Service 日志
docker-compose logs -f aac-service

# Keycloak 日志
docker-compose logs -f keycloak

# 所有日志
docker-compose logs -f
```

## 🛠️ 常见问题

### Q1: AAC Service 启动失败

```bash
# 检查 Keycloak 是否就绪
curl http://localhost:8180/health/ready

# 如果 Keycloak 未就绪，等待更长时间
docker-compose up -d
docker-compose logs -f keycloak

# 看到 "Keycloak 23.0.0 started" 后重启 AAC
docker-compose restart aac-service
```

### Q2: 登录后 IMC 调用失败

```bash
# 确保 IMC Mock 在运行
curl http://localhost:8081/api/users/test/tenants

# 如果没运行，启动 Mock IMC
node mock-imc.js

# 或修改 AAC 配置连接真实 IMC
```

### Q3: Token 验证失败

```bash
# 检查 Redis 连接
docker exec aac-redis redis-cli ping

# 检查 session 是否存在
docker exec aac-redis redis-cli KEYS "session:*"
docker exec aac-redis redis-cli GET "session:your-session-id"

# 检查 token 是否被黑名单
docker exec aac-redis redis-cli KEYS "token_blacklist:*"
```

### Q4: Keycloak 登录页面无法访问

```bash
# 检查端口映射
docker-compose ps keycloak

# 应该看到: 0.0.0.0:8180->8080/tcp

# 如果端口冲突，修改 docker-compose.yml:
# ports:
#   - "8280:8080"  # 改用 8280
```

## 🚀 下一步

1. **阅读完整文档**: [README.md](README.md)
2. **查看架构设计**: [/rbac-system/docs/MULTI_TENANT_LOGIN_FLOW.md](../docs/MULTI_TENANT_LOGIN_FLOW.md)
3. **Token 生命周期**: [/rbac-system/docs/TOKEN_LIFECYCLE_MANAGEMENT.md](../docs/TOKEN_LIFECYCLE_MANAGEMENT.md)
4. **集成前端应用**: 参考 README 中的 React 集成示例
5. **生产部署**: 参考 README 的生产部署章节

## 📞 获取帮助

- 查看日志: `docker-compose logs -f`
- 检查健康: `curl http://localhost:8080/actuator/health`
- GitHub Issues: [提交问题](https://github.com/your-repo/issues)
