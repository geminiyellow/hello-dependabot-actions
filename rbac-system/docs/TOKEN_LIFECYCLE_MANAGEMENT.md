# Token有效性管理方案

解决核心问题：应用层签发的JWT如何管理有效性、刷新、撤销

## 问题分析

### 当前架构的Token挑战

```
┌────────────────────────────────────────────────────────┐
│  两种Token并存                                          │
├────────────────────────────────────────────────────────┤
│                                                         │
│  Keycloak Token                                        │
│  • 由Keycloak签发                                      │
│  • Keycloak管理有效性                                  │
│  • 支持refresh token                                   │
│  • 但不包含tenant_id                                   │
│                                                         │
│  Application Token                                     │
│  • 应用自己签发（包含tenant_id）                       │
│  • ❓ 谁来管理有效性？                                  │
│  • ❓ 如何刷新？                                        │
│  • ❓ 如何撤销？                                        │
│  • ❓ 用户登出/权限变更怎么办？                         │
│                                                         │
└────────────────────────────────────────────────────────┘
```

### 核心需求

| 场景 | 需要解决 |
|------|----------|
| **Token过期** | Access token过期后如何刷新？ |
| **用户登出** | 如何让token立即失效？ |
| **权限变更** | 管理员修改用户权限，如何让旧token失效？ |
| **租户切换** | 用户切换租户，旧token是否还有效？ |
| **并发登录** | 用户在多个设备登录，如何管理？ |
| **安全事件** | 检测到异常，如何批量撤销token？ |

---

## 方案对比

### 方案1: Keycloak完全管理 ⭐️⭐️⭐️ (简化方案)

**核心思路**: 放弃应用层签发JWT，让Keycloak签发包含租户信息的token

#### 实现方式

```
1. 用户登录Keycloak
   ↓
2. Keycloak回调应用
   ↓
3. 应用调用IMC获取租户列表
   ↓
4. 用户选择租户
   ↓
5. 🔴 应用调用Keycloak的Token Exchange API
   POST /realms/{realm}/protocol/openid-connect/token
   {
     "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
     "subject_token": "<keycloak-token>",
     "audience": "myapp",
     "requested_token_type": "urn:ietf:params:oauth:token-type:access_token",
     "requested_subject": "user-123",
     // 🔴 额外参数
     "requested_claims": {
       "tenant_id": "acme",
       "tenant_name": "ACME Corp"
     }
   }
   ↓
6. Keycloak签发新token（包含tenant_id）
   {
     "sub": "user-123",
     "tenant_id": "acme",
     "tenant_name": "ACME Corp",
     "exp": ...,
     "iss": "https://keycloak.example.com" ← Keycloak签发
   }
```

**优点**：
- ✅ Keycloak完全管理token生命周期
- ✅ 原生支持refresh token
- ✅ 原生支持撤销（通过Keycloak Admin API）
- ✅ 安全性高（Keycloak的token机制成熟）

**缺点**：
- ❌ 需要配置Keycloak的Token Exchange
- ❌ requested_claims不是标准功能，需要自定义Mapper
- ❌ 依赖Keycloak的扩展能力

#### 具体实现

**Keycloak自定义Protocol Mapper**:

```java
public class TenantClaimMapper extends AbstractOIDCProtocolMapper {

    @Override
    protected void setClaim(IDToken token, ProtocolMapperModel mappingModel,
                          UserSessionModel userSession,
                          KeycloakSession keycloakSession,
                          ClientSessionContext clientSessionCtx) {

        // 从session notes中读取选定的租户
        String tenantId = userSession.getNote("selected_tenant_id");
        String tenantName = userSession.getNote("selected_tenant_name");

        if (tenantId != null) {
            token.getOtherClaims().put("tenant_id", tenantId);
            token.getOtherClaims().put("tenant_name", tenantName);
        }
    }
}
```

**应用端租户选择后更新Keycloak session**:

```java
@PostMapping("/auth/select-tenant")
public ResponseEntity<?> selectTenant(
        @RequestHeader("Authorization") String keycloakToken,
        @RequestBody SelectTenantRequest request) {

    String tenantId = request.getTenantId();

    // 1. 验证租户成员资格
    imcClient.verifyMembership(userId, tenantId);

    // 2. 🔴 更新Keycloak session notes
    keycloakAdmin.updateUserSessionNote(sessionId, "selected_tenant_id", tenantId);
    keycloakAdmin.updateUserSessionNote(sessionId, "selected_tenant_name", tenantName);

    // 3. 🔴 让用户刷新token（新token会包含租户信息）
    return ok(Map.of(
        "status", "tenant_selected",
        "message", "Please refresh your token"
    ));
}

// 前端刷新token
async function refreshToken(refreshToken) {
    const response = await fetch('https://keycloak/realms/myapp/protocol/openid-connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: 'myapp'
        })
    });

    const { access_token } = await response.json();
    // 新token包含tenant_id
    return access_token;
}
```

**Token管理**：

| 操作 | 方案 |
|------|------|
| **刷新Token** | Keycloak的refresh token机制 |
| **撤销Token** | Keycloak Admin API: DELETE /admin/realms/{realm}/users/{id}/logout |
| **权限变更** | Keycloak Admin API删除session，用户下次刷新会失败 |

---

### 方案2: 应用+Redis管理 ⭐️⭐️⭐️⭐️⭐️ (推荐)

**核心思路**: 应用签发JWT，但用Redis管理有效性

#### 架构图

```
┌─────────────────────────────────────────────────────────┐
│              Token管理架构                               │
└─────────────────────────────────────────────────────────┘

┌──────────────┐
│ 应用签发JWT   │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  JWT Structure                                          │
│  {                                                       │
│    "jti": "token-uuid-123",      ← JWT ID (唯一)       │
│    "sub": "user-123",                                   │
│    "tenant_id": "acme",                                 │
│    "iat": 1234567890,                                   │
│    "exp": 1234571490,            ← 15分钟后过期         │
│    "session_id": "session-456"   ← 关联session         │
│  }                                                       │
└─────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  Redis存储 (Session管理)                                │
│                                                          │
│  Key: session:{session_id}                              │
│  Value: {                                                │
│    user_id: "user-123",                                 │
│    tenant_id: "acme",                                   │
│    created_at: "2024-01-01T10:00:00Z",                 │
│    last_activity: "2024-01-01T10:15:00Z",              │
│    device: "Chrome/Mac",                                │
│    ip: "192.168.1.1",                                   │
│    active_tokens: ["token-uuid-123", "token-uuid-124"] │
│  }                                                       │
│  TTL: 7 days                                            │
│                                                          │
│  Key: token_blacklist:{jti}                             │
│  Value: "revoked"                                        │
│  TTL: token的剩余有效期                                  │
└─────────────────────────────────────────────────────────┘
```

#### 完整代码实现

##### JWT Service

```java
@Service
@RequiredArgsConstructor
public class TokenService {

    private final RedisTemplate<String, Object> redis;

    @Value("${jwt.secret}")
    private String jwtSecret;

    @Value("${jwt.access-token-expiration}")
    private long accessTokenExpiration = 900000; // 15分钟

    @Value("${jwt.refresh-token-expiration}")
    private long refreshTokenExpiration = 604800000; // 7天

    /**
     * 签发Access Token
     */
    public TokenPair issueToken(String userId, String tenantId, TenantInfo tenantInfo) {
        String sessionId = UUID.randomUUID().toString();

        // 1. 生成Access Token
        String jti = UUID.randomUUID().toString();
        String accessToken = Jwts.builder()
            .setId(jti)
            .setSubject(userId)
            .claim("tenant_id", tenantId)
            .claim("tenant_name", tenantInfo.getName())
            .claim("roles", tenantInfo.getRoles())
            .claim("session_id", sessionId)
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + accessTokenExpiration))
            .signWith(SignatureAlgorithm.HS512, jwtSecret)
            .compact();

        // 2. 生成Refresh Token
        String refreshTokenId = UUID.randomUUID().toString();
        String refreshToken = Jwts.builder()
            .setId(refreshTokenId)
            .setSubject(userId)
            .claim("session_id", sessionId)
            .claim("type", "refresh")
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + refreshTokenExpiration))
            .signWith(SignatureAlgorithm.HS512, jwtSecret)
            .compact();

        // 3. 创建Session（存储到Redis）
        SessionInfo session = new SessionInfo();
        session.setSessionId(sessionId);
        session.setUserId(userId);
        session.setTenantId(tenantId);
        session.setCreatedAt(Instant.now());
        session.setLastActivity(Instant.now());
        session.setActiveTokens(List.of(jti));
        session.setRefreshToken(refreshTokenId);

        redis.opsForValue().set(
            "session:" + sessionId,
            session,
            refreshTokenExpiration,
            TimeUnit.MILLISECONDS
        );

        return new TokenPair(accessToken, refreshToken, sessionId);
    }

    /**
     * 验证Token有效性
     */
    public boolean validateToken(String token) {
        try {
            Claims claims = Jwts.parser()
                .setSigningKey(jwtSecret)
                .parseClaimsJws(token)
                .getBody();

            String jti = claims.getId();

            // 1. 检查是否在黑名单
            Boolean isBlacklisted = redis.hasKey("token_blacklist:" + jti);
            if (Boolean.TRUE.equals(isBlacklisted)) {
                log.warn("Token {} is blacklisted", jti);
                return false;
            }

            // 2. 检查session是否存在
            String sessionId = claims.get("session_id", String.class);
            Boolean sessionExists = redis.hasKey("session:" + sessionId);
            if (!Boolean.TRUE.equals(sessionExists)) {
                log.warn("Session {} does not exist", sessionId);
                return false;
            }

            // 3. 更新最后活动时间
            updateSessionActivity(sessionId);

            return true;

        } catch (ExpiredJwtException e) {
            log.warn("Token expired: {}", e.getMessage());
            return false;
        } catch (Exception e) {
            log.error("Token validation failed", e);
            return false;
        }
    }

    /**
     * 刷新Token
     */
    public TokenPair refreshToken(String refreshToken) {
        try {
            Claims claims = Jwts.parser()
                .setSigningKey(jwtSecret)
                .parseClaimsJws(refreshToken)
                .getBody();

            String sessionId = claims.get("session_id", String.class);
            String refreshTokenId = claims.getId();

            // 1. 获取session
            SessionInfo session = (SessionInfo) redis.opsForValue()
                .get("session:" + sessionId);

            if (session == null) {
                throw new InvalidTokenException("Session not found");
            }

            // 2. 验证refresh token
            if (!refreshTokenId.equals(session.getRefreshToken())) {
                throw new InvalidTokenException("Invalid refresh token");
            }

            // 3. 从IMC获取最新的租户信息
            TenantInfo tenantInfo = imcClient.getTenantInfo(
                session.getUserId(),
                session.getTenantId()
            );

            // 4. 签发新的access token
            String newJti = UUID.randomUUID().toString();
            String newAccessToken = Jwts.builder()
                .setId(newJti)
                .setSubject(session.getUserId())
                .claim("tenant_id", session.getTenantId())
                .claim("tenant_name", tenantInfo.getName())
                .claim("roles", tenantInfo.getRoles())  // 最新角色
                .claim("session_id", sessionId)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + accessTokenExpiration))
                .signWith(SignatureAlgorithm.HS512, jwtSecret)
                .compact();

            // 5. 更新session的active tokens
            session.getActiveTokens().add(newJti);
            session.setLastActivity(Instant.now());
            redis.opsForValue().set(
                "session:" + sessionId,
                session,
                refreshTokenExpiration,
                TimeUnit.MILLISECONDS
            );

            return new TokenPair(newAccessToken, refreshToken, sessionId);

        } catch (Exception e) {
            throw new InvalidTokenException("Refresh failed: " + e.getMessage());
        }
    }

    /**
     * 撤销Token (登出)
     */
    public void revokeToken(String token) {
        try {
            Claims claims = Jwts.parser()
                .setSigningKey(jwtSecret)
                .parseClaimsJws(token)
                .getBody();

            String jti = claims.getId();
            String sessionId = claims.get("session_id", String.class);

            // 1. 将token加入黑名单
            long ttl = claims.getExpiration().getTime() - System.currentTimeMillis();
            if (ttl > 0) {
                redis.opsForValue().set(
                    "token_blacklist:" + jti,
                    "revoked",
                    ttl,
                    TimeUnit.MILLISECONDS
                );
            }

            // 2. 删除session（这会让所有该session的token失效）
            redis.delete("session:" + sessionId);

            log.info("Token {} and session {} revoked", jti, sessionId);

        } catch (Exception e) {
            log.error("Failed to revoke token", e);
        }
    }

    /**
     * 撤销用户的所有token
     */
    public void revokeAllUserTokens(String userId) {
        // 查找用户的所有session
        Set<String> keys = redis.keys("session:*");

        for (String key : keys) {
            SessionInfo session = (SessionInfo) redis.opsForValue().get(key);
            if (session != null && userId.equals(session.getUserId())) {
                // 删除session
                redis.delete(key);

                // 黑名单所有active tokens
                for (String tokenId : session.getActiveTokens()) {
                    redis.opsForValue().set(
                        "token_blacklist:" + tokenId,
                        "revoked",
                        accessTokenExpiration,
                        TimeUnit.MILLISECONDS
                    );
                }

                log.info("Revoked session {} for user {}", session.getSessionId(), userId);
            }
        }
    }

    /**
     * 撤销租户下的所有token
     */
    public void revokeAllTenantTokens(String tenantId) {
        Set<String> keys = redis.keys("session:*");

        for (String key : keys) {
            SessionInfo session = (SessionInfo) redis.opsForValue().get(key);
            if (session != null && tenantId.equals(session.getTenantId())) {
                redis.delete(key);
                log.info("Revoked session {} for tenant {}", session.getSessionId(), tenantId);
            }
        }
    }

    private void updateSessionActivity(String sessionId) {
        SessionInfo session = (SessionInfo) redis.opsForValue().get("session:" + sessionId);
        if (session != null) {
            session.setLastActivity(Instant.now());
            redis.opsForValue().set(
                "session:" + sessionId,
                session,
                refreshTokenExpiration,
                TimeUnit.MILLISECONDS
            );
        }
    }
}
```

##### Security Filter

```java
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final TokenService tokenService;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);

            // 🔴 验证token（包括黑名单检查）
            if (tokenService.validateToken(token)) {
                Claims claims = tokenService.parseToken(token);

                // 设置认证信息
                UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(
                        claims.getSubject(),
                        null,
                        getAuthorities(claims)
                    );

                // 添加租户信息到context
                authentication.setDetails(Map.of(
                    "tenant_id", claims.get("tenant_id"),
                    "session_id", claims.get("session_id")
                ));

                SecurityContextHolder.getContext().setAuthentication(authentication);
            } else {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.getWriter().write("{\"error\":\"Invalid or expired token\"}");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }
}
```

##### Auth Controller

```java
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final TokenService tokenService;
    private final IMCClient imcClient;

    /**
     * 刷新Token
     */
    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(@RequestBody RefreshRequest request) {
        try {
            TokenPair tokens = tokenService.refreshToken(request.getRefreshToken());

            return ok(Map.of(
                "access_token", tokens.getAccessToken(),
                "refresh_token", tokens.getRefreshToken(),
                "token_type", "Bearer"
            ));

        } catch (Exception e) {
            return status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "Refresh failed"));
        }
    }

    /**
     * 登出
     */
    @PostMapping("/logout")
    public ResponseEntity<?> logout(
            @RequestHeader("Authorization") String authHeader) {

        String token = authHeader.replace("Bearer ", "");
        tokenService.revokeToken(token);

        return ok(Map.of("message", "Logged out successfully"));
    }

    /**
     * 切换租户
     */
    @PostMapping("/switch-tenant")
    public ResponseEntity<?> switchTenant(
            @RequestHeader("Authorization") String authHeader,
            @RequestBody SwitchTenantRequest request) {

        String currentToken = authHeader.replace("Bearer ", "");

        // 1. 验证并解析当前token
        if (!tokenService.validateToken(currentToken)) {
            return status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "Invalid token"));
        }

        Claims claims = tokenService.parseToken(currentToken);
        String userId = claims.getSubject();
        String newTenantId = request.getTenantId();

        // 2. 验证用户属于新租户
        boolean isMember = imcClient.verifyMembership(userId, newTenantId);
        if (!isMember) {
            return status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", "Not a member of this tenant"));
        }

        // 3. 🔴 撤销当前token
        tokenService.revokeToken(currentToken);

        // 4. 获取新租户信息
        TenantInfo tenantInfo = imcClient.getTenantInfo(userId, newTenantId);

        // 5. 签发新token（新session）
        TokenPair tokens = tokenService.issueToken(userId, newTenantId, tenantInfo);

        return ok(Map.of(
            "access_token", tokens.getAccessToken(),
            "refresh_token", tokens.getRefreshToken(),
            "tenant", tenantInfo
        ));
    }
}
```

##### Admin操作

```java
@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
public class AdminController {

    private final TokenService tokenService;

    /**
     * 强制用户下线
     */
    @PostMapping("/users/{userId}/logout")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> forceLogout(@PathVariable String userId) {
        tokenService.revokeAllUserTokens(userId);

        return ok(Map.of("message", "User logged out"));
    }

    /**
     * 租户下所有用户下线（紧急情况）
     */
    @PostMapping("/tenants/{tenantId}/logout-all")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<?> logoutAllTenantUsers(@PathVariable String tenantId) {
        tokenService.revokeAllTenantTokens(tenantId);

        return ok(Map.of("message", "All tenant users logged out"));
    }
}
```

#### IMC事件监听（权限变更自动撤销）

```java
@Service
@RequiredArgsConstructor
public class IMCEventListener {

    private final TokenService tokenService;

    /**
     * 监听用户权限变更事件
     */
    @EventListener
    public void onUserRoleChanged(UserRoleChangedEvent event) {
        log.info("User {} role changed, revoking all tokens", event.getUserId());

        // 撤销该用户的所有token，强制重新登录
        tokenService.revokeAllUserTokens(event.getUserId());
    }

    /**
     * 监听用户离开租户事件
     */
    @EventListener
    public void onUserLeftTenant(UserLeftTenantEvent event) {
        log.info("User {} left tenant {}, revoking tokens",
            event.getUserId(), event.getTenantId());

        // 找到该用户在该租户下的所有session，撤销
        tokenService.revokeTenantSessions(event.getUserId(), event.getTenantId());
    }

    /**
     * 监听租户被停用事件
     */
    @EventListener
    public void onTenantDeactivated(TenantDeactivatedEvent event) {
        log.warn("Tenant {} deactivated, logging out all users", event.getTenantId());

        // 撤销该租户下所有用户的token
        tokenService.revokeAllTenantTokens(event.getTenantId());
    }
}
```

---

### 方案3: 混合模式 ⭐️⭐️⭐️⭐️

**Keycloak token作为主token，应用token作为派生token**

```
Keycloak Token (主token)
    ↓ 验证后签发
Application Token (派生token，包含tenant_id)
    ↓ 同时存储
Redis记录两者的关联关系

刷新时：
1. 用Keycloak refresh token刷新主token
2. 基于新主token签发新应用token
```

---

## 完整对比

| 特性 | 方案1 (Keycloak管理) | 方案2 (应用+Redis) | 方案3 (混合) |
|------|---------------------|-------------------|-------------|
| **刷新Token** | Keycloak原生 | 自己实现 | Keycloak原生 |
| **撤销Token** | Keycloak Admin API | Redis黑名单 | 双重撤销 |
| **权限变更** | 删除Keycloak session | 监听事件撤销 | 监听事件撤销 |
| **租户切换** | 刷新token | 撤销旧token+签发新token | 撤销旧token+签发新token |
| **并发登录控制** | Keycloak配置 | Redis session管理 | 双重管理 |
| **实现复杂度** | ⭐️⭐️⭐️⭐️ | ⭐️⭐️⭐️ | ⭐️⭐️⭐️⭐️⭐️ |
| **性能** | 中等（依赖Keycloak） | 高（Redis快） | 中等 |
| **灵活性** | 低（受限Keycloak） | 高（完全掌控） | 高 |

---

## 最终推荐

### 🏆 推荐：方案2（应用+Redis管理）

**理由**：
1. ✅ 完全掌控token生命周期
2. ✅ Redis性能高
3. ✅ 灵活处理各种场景（租户切换、权限变更）
4. ✅ 易于调试和监控
5. ✅ 可以记录详细的session信息（设备、IP、活动时间）

**架构总结**：

```
AAC (Keycloak):
✅ 初始认证
✅ 验证用户名/密码
✅ MFA

AAC Service:
✅ 签发应用JWT（包含tenant_id）
✅ 刷新Token
✅ 撤销Token
✅ Session管理

Redis:
✅ Session存储
✅ Token黑名单
✅ 快速查询

IMC:
✅ 提供租户数据
✅ 发布权限变更事件

PMC:
✅ (可选) 记录登录事件
```

---

## 总结

### 回答你的问题

**Q: Token有效性管理怎么搞？AAC做管理？**

**A**: ✅ **AAC Service负责管理，用Redis存储**

```
Token生命周期由AAC Service管理:
✅ 签发（Issue）
✅ 验证（Validate）
✅ 刷新（Refresh）
✅ 撤销（Revoke）

Redis存储:
✅ Session信息
✅ Token黑名单
✅ 最后活动时间

Keycloak:
✅ 只负责初始认证
✅ 不管理应用层token
```

### 关键实现点

1. **每个token有唯一ID (jti)**
2. **Session与token关联**
3. **黑名单机制（撤销）**
4. **refresh token独立管理**
5. **监听IMC事件自动撤销**

需要我创建完整的可运行代码吗？包括所有的token管理逻辑和Redis配置？
