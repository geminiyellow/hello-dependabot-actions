# 多租户登录流程：AAC + IMC 集成方案

解决核心问题：登录后选择租户，基于租户签发JWT

## 问题场景

### 典型B2B SaaS多租户登录流程

```
用户: alice@example.com
租户:
  - ACME Corp (员工)
  - Globex Inc (顾问)
  - StartupXYZ (投资人)

期望流程:
1. 输入用户名/密码
2. 认证通过
3. 🔴 显示租户列表 (ACME, Globex, StartupXYZ)
4. 🔴 用户选择 "ACME Corp"
5. 🔴 签发JWT，包含 tenant_id: "acme"
6. 进入系统，以ACME员工身份工作
```

### 核心需求

```
┌────────────────────────────────────────────────────────┐
│  关键问题：JWT必须包含选定的tenant_id                   │
├────────────────────────────────────────────────────────┤
│                                                         │
│  JWT Payload:                                          │
│  {                                                      │
│    "sub": "user-uuid-123",                            │
│    "email": "alice@example.com",                      │
│    "tenant_id": "acme",          ← 用户选择的租户      │
│    "tenant_name": "ACME Corp",                        │
│    "roles": ["employee"],        ← 该租户下的角色      │
│    "groups": ["engineering"]     ← 该租户下的组        │
│  }                                                      │
│                                                         │
│  为什么重要？                                           │
│  • 后续所有API调用都基于这个tenant_id                  │
│  • PMC权限检查需要知道用户在哪个租户下操作              │
│  • 数据隔离：只能访问该租户的数据                       │
└────────────────────────────────────────────────────────┘
```

---

## Keycloak原生能力分析

### ❌ Keycloak 原生不支持

Keycloak默认流程：
```
1. 输入用户名/密码
2. 验证通过
3. 直接签发JWT ← 没有租户选择步骤！
```

**问题**：
- ❌ 无法在登录流程中插入"租户选择"步骤
- ❌ JWT中的claims是预定义的，无法动态基于用户选择
- ❌ 一个用户在Keycloak中只有一个identity，无法表达"多租户身份"

### ⚠️ Keycloak 26+ Organizations 功能

**Keycloak 26新功能**：Organizations

```
优点:
✅ 支持一个用户属于多个组织
✅ 基于email domain自动路由IdP

局限:
❌ 主要是domain-based自动选择
❌ 不是用户主动选择界面
❌ JWT中没有动态的"当前组织"概念
```

**示例**：
```
alice@acme.com → 自动路由到ACME的IdP
bob@globex.com → 自动路由到Globex的IdP

但如果alice同时是多个组织成员？
→ Keycloak不提供UI让用户选择
```

---

## 解决方案对比

### 方案1: 使用Keycloak扩展 ⭐️⭐️⭐️⭐️

#### 使用 `anarsultanov/keycloak-multi-tenancy` 扩展

**GitHub**: https://github.com/anarsultanov/keycloak-multi-tenancy

**工作原理**：

```
┌─────────────────────────────────────────────────────────┐
│         Keycloak + Multi-Tenancy Extension              │
└─────────────────────────────────────────────────────────┘

1. 用户访问 https://app.example.com
   ↓
2. 重定向到Keycloak登录页
   ↓
3. 输入用户名/密码
   ↓
4. Keycloak验证通过 ✅
   ↓
5. 🔴 扩展触发 "Required Action"
   ↓
6. 🔴 显示租户选择页面 (UI由扩展提供)
   ┌───────────────────────────────────┐
   │  Select Your Tenant               │
   ├───────────────────────────────────┤
   │  ○ ACME Corp (Employee)           │
   │  ○ Globex Inc (Consultant)        │
   │  ○ StartupXYZ (Investor)          │
   │                                   │
   │  [Continue]                       │
   └───────────────────────────────────┘
   ↓
7. 🔴 用户选择 "ACME Corp"
   ↓
8. 🔴 扩展将选择写入session
   ↓
9. 🔴 扩展调用Mapper，在JWT中添加tenant_id
   ↓
10. 签发JWT:
    {
      "sub": "uuid-123",
      "email": "alice@example.com",
      "active_tenant": "acme",      ← 扩展添加
      "tenant_roles": ["employee"]  ← 扩展添加
    }
    ↓
11. 重定向回应用，携带JWT
```

**关键特性**：

1. **Tenant Selection Required Action**
   ```java
   // 用户首次登录或切换租户时触发
   public class TenantSelectionRequiredAction implements RequiredActionProvider {
       @Override
       public void requiredActionChallenge(RequiredActionContext context) {
           // 1. 从IMC获取用户的租户列表
           List<Tenant> tenants = fetchTenantsFromIMC(context.getUser().getId());

           // 2. 渲染租户选择页面
           Response response = context.form()
               .setAttribute("tenants", tenants)
               .createForm("select-tenant.ftl");

           context.challenge(response);
       }

       @Override
       public void processAction(RequiredActionContext context) {
           // 用户选择了租户
           String selectedTenant = context.getHttpRequest()
               .getDecodedFormParameters()
               .getFirst("tenant_id");

           // 保存到用户session
           context.getAuthenticationSession()
               .setUserSessionNote("active_tenant", selectedTenant);

           context.success();
       }
   }
   ```

2. **Tenant Claim Mapper**
   ```java
   // 将选定的租户添加到JWT
   public class TenantClaimMapper extends AbstractOIDCProtocolMapper {
       @Override
       protected void setClaim(IDToken token, ProtocolMapperModel mappingModel,
                             UserSessionModel userSession, ...) {
           String activeTenant = userSession.getNote("active_tenant");

           if (activeTenant != null) {
               // 从IMC获取租户详细信息
               TenantInfo tenant = fetchTenantInfo(activeTenant);

               token.getOtherClaims().put("tenant_id", tenant.getId());
               token.getOtherClaims().put("tenant_name", tenant.getName());
               token.getOtherClaims().put("tenant_roles", tenant.getRoles());
           }
       }
   }
   ```

3. **Tenant Switching (AIA)**
   ```
   用户在应用内切换租户:
   1. 点击 "Switch to Globex"
   2. 应用调用 Keycloak AIA端点
      GET /realms/{realm}/protocol/openid-connect/auth
          ?client_id=my-app
          &kc_action=select_tenant
   3. Keycloak显示租户选择页
   4. 用户选择新租户
   5. Keycloak签发新JWT（包含新tenant_id）
   6. 应用刷新token
   ```

**部署步骤**：

```bash
# 1. 下载扩展JAR
wget https://github.com/anarsultanov/keycloak-multi-tenancy/releases/download/v1.0.0/keycloak-multi-tenancy.jar

# 2. 部署到Keycloak
cp keycloak-multi-tenancy.jar /opt/keycloak/providers/

# 3. 重启Keycloak
systemctl restart keycloak

# 4. 在Admin Console配置
# Authentication → Required Actions → 启用 "Tenant Selection"
# Client Scopes → 创建 tenant scope
# Protocol Mappers → 添加 TenantClaimMapper
```

**集成IMC**：

扩展需要调用IMC获取租户列表，有两种方式：

```java
// 方式A: 扩展直接调用IMC API
public class IMCTenantProvider {
    private final RestTemplate restTemplate = new RestTemplate();

    public List<Tenant> getUserTenants(String userId) {
        String url = "http://imc-service/api/v1/users/" + userId + "/tenants";
        ResponseEntity<List<Tenant>> response = restTemplate.exchange(
            url,
            HttpMethod.GET,
            null,
            new ParameterizedTypeReference<List<Tenant>>() {}
        );
        return response.getBody();
    }
}

// 方式B: 预先同步到Keycloak User Attributes
// IMC在创建用户时同步
imcClient.createUser(user);
keycloakAdmin.updateUserAttributes(user.getId(),
    Map.of("tenant_memberships", "acme,globex,startupxyz")
);
```

**优点**：
- ✅ 完整的UI流程
- ✅ 支持租户切换
- ✅ JWT中包含tenant_id
- ✅ 开源社区方案

**缺点**：
- ❌ 需要部署和维护Keycloak扩展
- ❌ Keycloak版本升级可能导致兼容性问题
- ❌ 需要学习Keycloak SPI

---

### 方案2: 自定义后端中间层 ⭐️⭐️⭐️⭐️⭐️ (推荐)

**完全绕过Keycloak的租户选择，在应用层实现**

```
┌─────────────────────────────────────────────────────────┐
│           推荐方案：应用层租户选择                        │
└─────────────────────────────────────────────────────────┘

1. 用户访问 https://app.example.com/login
   ↓
2. 重定向到Keycloak
   ↓
3. Keycloak登录（用户名/密码）
   ↓
4. Keycloak验证通过，签发 temporary JWT
   {
     "sub": "uuid-123",
     "email": "alice@example.com"
     // 注意：没有tenant_id
   }
   ↓
5. 重定向回应用 /callback?code=...
   ↓
6. 应用后端用code换取token
   ↓
7. 🔴 检查token是否包含tenant_id
   if (token没有tenant_id) {
       // 需要租户选择
       return { status: "tenant_selection_required" }
   }
   ↓
8. 🔴 前端收到响应，跳转到租户选择页
   ↓
9. 🔴 前端调用IMC获取租户列表
   GET /api/v1/users/me/tenants
   Headers: Authorization: Bearer <temporary-jwt>
   返回:
   [
     { id: "acme", name: "ACME Corp", role: "employee" },
     { id: "globex", name: "Globex Inc", role: "consultant" }
   ]
   ↓
10. 🔴 前端显示租户选择UI
    ┌───────────────────────────────────┐
    │  Select Your Organization         │
    ├───────────────────────────────────┤
    │  ○ ACME Corp (Employee)           │
    │  ○ Globex Inc (Consultant)        │
    │                                   │
    │  [Continue]                       │
    └───────────────────────────────────┘
    ↓
11. 🔴 用户选择 "ACME Corp"
    ↓
12. 🔴 前端调用后端API
    POST /api/v1/auth/select-tenant
    Headers: Authorization: Bearer <temporary-jwt>
    Body: { tenant_id: "acme" }
    ↓
13. 🔴 后端签发新的JWT（包含tenant_id）
    后端使用自己的JWT签名密钥:
    {
      "sub": "uuid-123",
      "email": "alice@example.com",
      "tenant_id": "acme",            ← 新增
      "tenant_name": "ACME Corp",     ← 新增
      "tenant_roles": ["employee"],   ← 新增
      "iss": "https://app.example.com", ← 自签
      "exp": ...
    }
    ↓
14. 前端保存新JWT，进入应用
```

**完整代码实现**：

#### 后端 - AAC Service

```java
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    @Autowired
    private KeycloakService keycloak;

    @Autowired
    private IMCClient imcClient;

    @Autowired
    private JwtService jwtService;

    /**
     * Keycloak回调端点
     */
    @GetMapping("/callback")
    public ResponseEntity<?> callback(@RequestParam String code) {
        // 1. 用code换取Keycloak token
        KeycloakToken keycloakToken = keycloak.exchangeCodeForToken(code);

        // 2. 解析Keycloak JWT
        Claims claims = jwtService.parseKeycloakToken(keycloakToken.getAccessToken());
        String userId = claims.getSubject();
        String email = claims.get("email", String.class);

        // 3. 从IMC获取用户的租户列表
        List<TenantMembership> tenants = imcClient.getUserTenants(userId);

        if (tenants.isEmpty()) {
            return ResponseEntity.badRequest()
                .body(Map.of("error", "User has no tenant membership"));
        }

        if (tenants.size() == 1) {
            // 4. 只有一个租户，直接签发JWT
            String appJwt = jwtService.generateAppJwt(
                userId, email, tenants.get(0)
            );

            return ResponseEntity.ok(Map.of(
                "access_token", appJwt,
                "token_type", "Bearer"
            ));

        } else {
            // 5. 多个租户，需要用户选择
            // 签发临时token（包含Keycloak token）
            String tempToken = jwtService.generateTempToken(
                userId, email, keycloakToken.getAccessToken()
            );

            return ResponseEntity.ok(Map.of(
                "status", "tenant_selection_required",
                "temp_token", tempToken,
                "tenants", tenants
            ));
        }
    }

    /**
     * 租户选择端点
     */
    @PostMapping("/select-tenant")
    public ResponseEntity<?> selectTenant(
            @RequestHeader("Authorization") String authHeader,
            @RequestBody SelectTenantRequest request) {

        // 1. 验证临时token
        String tempToken = authHeader.replace("Bearer ", "");
        Claims claims = jwtService.parseTempToken(tempToken);

        String userId = claims.getSubject();
        String email = claims.get("email", String.class);
        String selectedTenant = request.getTenantId();

        // 2. 验证用户确实属于该租户
        boolean isMember = imcClient.verifyTenantMembership(userId, selectedTenant);
        if (!isMember) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", "User is not a member of this tenant"));
        }

        // 3. 从IMC获取租户详细信息
        TenantMembership membership = imcClient.getTenantMembership(userId, selectedTenant);

        // 4. 签发最终的应用JWT
        String appJwt = jwtService.generateAppJwt(userId, email, membership);

        // 5. (可选) 写入PMC：用户属于租户
        pmcClient.writeRelationship(
            "user:" + userId,
            "member",
            "tenant:" + selectedTenant
        );

        return ResponseEntity.ok(Map.of(
            "access_token", appJwt,
            "token_type", "Bearer",
            "tenant", membership
        ));
    }
}

@Service
public class JwtService {

    @Value("${jwt.secret}")
    private String jwtSecret;

    @Value("${jwt.expiration}")
    private long jwtExpiration;

    /**
     * 生成应用JWT（包含租户信息）
     */
    public String generateAppJwt(String userId, String email,
                                 TenantMembership membership) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", userId);
        claims.put("email", email);
        claims.put("tenant_id", membership.getTenantId());
        claims.put("tenant_name", membership.getTenantName());
        claims.put("tenant_roles", membership.getRoles());
        claims.put("tenant_groups", membership.getGroups());

        return Jwts.builder()
            .setClaims(claims)
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + jwtExpiration))
            .signWith(SignatureAlgorithm.HS512, jwtSecret)
            .compact();
    }

    /**
     * 生成临时token（用于租户选择）
     */
    public String generateTempToken(String userId, String email,
                                   String keycloakToken) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", userId);
        claims.put("email", email);
        claims.put("keycloak_token", keycloakToken);
        claims.put("type", "temp");

        return Jwts.builder()
            .setClaims(claims)
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + 300000)) // 5分钟
            .signWith(SignatureAlgorithm.HS512, jwtSecret)
            .compact();
    }
}
```

#### IMC Service

```java
@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    @Autowired
    private TenantService tenantService;

    /**
     * 获取用户的租户列表
     */
    @GetMapping("/{userId}/tenants")
    public List<TenantMembership> getUserTenants(@PathVariable String userId) {
        return tenantService.getUserTenants(userId);
    }

    /**
     * 验证用户是否属于某租户
     */
    @GetMapping("/{userId}/tenants/{tenantId}/verify")
    public boolean verifyMembership(
            @PathVariable String userId,
            @PathVariable String tenantId) {
        return tenantService.isMember(userId, tenantId);
    }

    /**
     * 获取用户在特定租户的详细信息
     */
    @GetMapping("/{userId}/tenants/{tenantId}")
    public TenantMembership getTenantMembership(
            @PathVariable String userId,
            @PathVariable String tenantId) {
        return tenantService.getMembership(userId, tenantId);
    }
}

@Service
public class TenantService {

    @Autowired
    private TenantMembershipRepository membershipRepo;

    public List<TenantMembership> getUserTenants(String userId) {
        return membershipRepo.findByUserId(userId).stream()
            .map(m -> {
                TenantMembership dto = new TenantMembership();
                dto.setTenantId(m.getTenant().getId());
                dto.setTenantName(m.getTenant().getName());
                dto.setRoles(m.getRoles());
                dto.setGroups(m.getGroups().stream()
                    .map(Group::getId)
                    .collect(Collectors.toList()));
                return dto;
            })
            .collect(Collectors.toList());
    }
}
```

#### 前端 - React示例

```typescript
// Login flow
export const LoginPage = () => {
  const handleLogin = () => {
    // 重定向到Keycloak
    const keycloakUrl = `https://keycloak.example.com/realms/myapp/protocol/openid-connect/auth?client_id=myapp&redirect_uri=${window.location.origin}/callback&response_type=code`;
    window.location.href = keycloakUrl;
  };

  return <button onClick={handleLogin}>Login with Keycloak</button>;
};

// Callback handler
export const CallbackPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');

    fetch('/api/v1/auth/callback?code=' + code)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'tenant_selection_required') {
          // 需要选择租户
          sessionStorage.setItem('temp_token', data.temp_token);
          navigate('/select-tenant', { state: { tenants: data.tenants } });
        } else {
          // 直接登录成功
          localStorage.setItem('access_token', data.access_token);
          navigate('/dashboard');
        }
      });
  }, []);

  return <div>Logging in...</div>;
};

// Tenant selection page
export const TenantSelectionPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [tenants] = useState(location.state.tenants);
  const [selected, setSelected] = useState(null);

  const handleContinue = () => {
    const tempToken = sessionStorage.getItem('temp_token');

    fetch('/api/v1/auth/select-tenant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tempToken}`
      },
      body: JSON.stringify({ tenant_id: selected })
    })
      .then(res => res.json())
      .then(data => {
        // 保存最终JWT
        localStorage.setItem('access_token', data.access_token);
        sessionStorage.removeItem('temp_token');

        // 进入应用
        navigate('/dashboard');
      });
  };

  return (
    <div className="tenant-selection">
      <h2>Select Your Organization</h2>
      {tenants.map(tenant => (
        <div key={tenant.id} className="tenant-option">
          <input
            type="radio"
            name="tenant"
            value={tenant.id}
            onChange={() => setSelected(tenant.id)}
          />
          <label>
            {tenant.name} <span>({tenant.role})</span>
          </label>
        </div>
      ))}
      <button onClick={handleContinue} disabled={!selected}>
        Continue
      </button>
    </div>
  );
};
```

**优点**：
- ✅ 完全掌控流程
- ✅ 不依赖Keycloak扩展
- ✅ 前端体验可自定义
- ✅ 易于调试和维护
- ✅ 支持复杂业务逻辑（如租户审核）

**缺点**：
- ❌ 需要自己签发和验证JWT
- ❌ 需要管理两种token（Keycloak + 应用）
- ❌ 租户切换需要重新调用API

---

### 方案3: 完全自研认证 ⭐️⭐️

**不用Keycloak，完全自己实现**

```
省略Keycloak，自己实现：
1. 用户名/密码验证
2. 租户选择
3. JWT签发
```

**优点**：
- ✅ 完全掌控
- ✅ 最灵活

**缺点**：
- ❌ 失去Keycloak的功能（SSO、MFA、OAuth2等）
- ❌ 需要自己实现安全特性
- ❌ 不推荐（重复造轮子）

---

## 最终推荐

### 🏆 推荐：方案2（应用层租户选择）

**理由**：
1. ✅ 平衡了灵活性和复杂度
2. ✅ 保留Keycloak的认证能力
3. ✅ IMC完全掌控租户逻辑
4. ✅ 易于维护和扩展

**架构图**：

```
┌──────────┐
│  用户     │
└────┬─────┘
     │ 1. 点击登录
     ▼
┌─────────────────┐
│  前端应用        │
└────┬────────────┘
     │ 2. 重定向
     ▼
┌─────────────────────────┐
│  AAC (Keycloak)         │
│  • 验证用户名/密码       │
│  • 签发临时JWT          │
└────┬────────────────────┘
     │ 3. 回调+code
     ▼
┌─────────────────────────┐
│  后端 (AAC Service)     │
│  • 换token              │
│  • 调IMC获取租户列表     │
│  • 返回租户列表          │
└────┬────────────────────┘
     │ 4. 租户列表
     ▼
┌─────────────────┐
│  前端租户选择页  │
│  ○ ACME         │
│  ○ Globex       │
└────┬────────────┘
     │ 5. 选择ACME
     ▼
┌─────────────────────────┐
│  后端 (AAC Service)     │
│  • 验证租户成员资格      │
│  • 从IMC获取详细信息     │
│  • 签发最终JWT          │
│    (包含tenant_id)      │
└────┬────────────────────┘
     │ 6. 最终JWT
     ▼
┌─────────────────┐
│  应用主界面      │
└─────────────────┘
```

**关键点**：
- AAC (Keycloak): 只管认证
- IMC: 管理租户数据（唯一数据源）
- AAC Service: 协调Keycloak和IMC，签发最终JWT

---

## 完整部署示例

```yaml
# docker-compose.yml
version: '3.8'

services:
  # AAC - Keycloak
  keycloak:
    image: quay.io/keycloak/keycloak:23.0
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres-aac/keycloak
    ports:
      - "8080:8080"

  # AAC Service (认证协调器)
  aac-service:
    build: ./aac-service
    environment:
      KEYCLOAK_URL: http://keycloak:8080
      KEYCLOAK_CLIENT_ID: myapp
      KEYCLOAK_CLIENT_SECRET: secret
      IMC_URL: http://imc-service:8080
      JWT_SECRET: your-secret-key
    ports:
      - "8081:8080"

  # IMC - 身份管理中心
  imc-service:
    build: ./imc-service
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres-imc/imc
    ports:
      - "8082:8080"

  # PMC - 权限管理中心
  pmc-service:
    build: ./pmc-service
    environment:
      SPICEDB_ENDPOINT: spicedb:50051
    ports:
      - "8083:8080"

  # SpiceDB
  spicedb:
    image: authzed/spicedb:latest
    command: serve --grpc-preshared-key "secret"
    environment:
      SPICEDB_DATASTORE_ENGINE: postgres
      SPICEDB_DATASTORE_CONN_URI: postgres://spicedb:spicedb@postgres-pmc/spicedb
    ports:
      - "50051:50051"
```

---

## 总结

### ✅ Keycloak可以吗？

**可以！但需要额外工作**：

| 方案 | Keycloak角色 | 额外工作 | 推荐度 |
|------|-------------|---------|--------|
| **Keycloak扩展** | 认证+租户选择 | 部署扩展 | ⭐️⭐️⭐️⭐️ |
| **应用层选择** | 只认证 | 自己签发JWT | ⭐️⭐️⭐️⭐️⭐️ |
| **完全自研** | 不用 | 全部自己做 | ⭐️⭐️ |

### 🎯 我的建议

**使用方案2（应用层租户选择）**：

1. **AAC (Keycloak)**: 只负责认证
2. **AAC Service**: 协调认证和租户选择
3. **IMC**: 提供租户数据
4. **应用JWT**: 包含tenant_id

这样：
- ✅ Keycloak专注认证（它擅长的）
- ✅ IMC完全掌控租户逻辑
- ✅ 灵活易维护

需要我创建完整的可运行代码吗？
