# Spring Boot 实现指南

> Permission Service 核心实现

---

## 1. 项目结构

```
permission-service/
├── src/
│   ├── main/
│   │   ├── java/com/example/permission/
│   │   │   ├── PermissionServiceApplication.java
│   │   │   ├── config/
│   │   │   │   ├── CacheConfig.java
│   │   │   │   ├── SecurityConfig.java
│   │   │   │   ├── RedisConfig.java
│   │   │   │   ├── DataSourceConfig.java
│   │   │   │   └── AsyncConfig.java
│   │   │   ├── controller/
│   │   │   │   ├── PermissionController.java
│   │   │   │   └── HealthController.java
│   │   │   ├── service/
│   │   │   │   ├── PermissionService.java
│   │   │   │   ├── CacheService.java
│   │   │   │   ├── IdentityClient.java
│   │   │   │   └── AuditService.java
│   │   │   ├── domain/
│   │   │   │   ├── model/
│   │   │   │   │   ├── User.java
│   │   │   │   │   ├── Resource.java
│   │   │   │   │   ├── Permission.java
│   │   │   │   │   └── PermissionFlags.java
│   │   │   │   ├── repository/
│   │   │   │   │   ├── UserRepository.java
│   │   │   │   │   ├── ResourceRepository.java
│   │   │   │   │   └── PermissionRepository.java
│   │   │   │   └── dto/
│   │   │   │       ├── PermissionCheckRequest.java
│   │   │   │       └── PermissionCheckResponse.java
│   │   │   ├── security/
│   │   │   │   ├── JwtAuthenticationFilter.java
│   │   │   │   └── KeycloakJwtConverter.java
│   │   │   ├── metrics/
│   │   │   │   └── PermissionMetrics.java
│   │   │   └── exception/
│   │   │       ├── PermissionDeniedException.java
│   │   │       └── GlobalExceptionHandler.java
│   │   └── resources/
│   │       ├── application.yml
│   │       ├── application-dev.yml
│   │       ├── application-production.yml
│   │       └── db/migration/
│   │           └── V1__Initial_Schema.sql
│   └── test/
│       └── java/com/example/permission/
│           ├── PermissionServiceTest.java
│           └── integration/
│               └── PermissionControllerIntegrationTest.java
├── pom.xml
└── Dockerfile
```

---

## 2. 核心实现

### 2.1 Permission Entity

```java
// Permission.java
package com.example.permission.domain.model;

import jakarta.persistence.*;
import lombok.Data;
import java.util.UUID;

@Data
@Entity
@Table(name = "permissions", indexes = {
    @Index(name = "idx_permission_flags", columnList = "user_id,resource_id,flags")
})
public class Permission {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "resource_id", nullable = false)
    private UUID resourceId;

    @Column(name = "flags", nullable = false)
    private Long flags;  // 使用位运算存储权限

    @Column(name = "source")
    private String source;  // direct, group, inherited, etc.

    @Column(name = "created_at", nullable = false)
    private java.time.Instant createdAt;

    @Version
    private Long version;  // 乐观锁
}

// PermissionFlags.java
package com.example.permission.domain.model;

public class PermissionFlags {
    public static final long NONE = 0L;
    public static final long READ = 1L;       // 0001
    public static final long WRITE = 1L << 1;  // 0010
    public static final long DELETE = 1L << 2; // 0100
    public static final long EXECUTE = 1L << 3;// 1000
    public static final long ADMIN = 1L << 4;  // 10000
    public static final long SHARE = 1L << 5;  // 100000
    public static final long APPROVE = 1L << 6;// 1000000

    public static boolean hasPermission(long granted, long required) {
        return (granted & required) == required;
    }

    public static long combine(long... permissions) {
        long result = NONE;
        for (long p : permissions) {
            result |= p;
        }
        return result;
    }
}
```

### 2.2 Permission Service

```java
// PermissionService.java
package com.example.permission.service;

import com.example.permission.domain.model.PermissionFlags;
import com.example.permission.domain.dto.*;
import com.github.benmanes.caffeine.cache.Cache;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.CompletableFuture;

@Slf4j
@Service
@RequiredArgsConstructor
public class PermissionService {

    private final PermissionRepository permissionRepository;
    private final UserRepository userRepository;
    private final ResourceRepository resourceRepository;
    private final IdentityClient identityClient;
    private final AuditService auditService;

    // L1 Cache (Caffeine)
    private final Cache<String, PermissionCheckResponse> l1Cache;

    // L2 Cache (Redis)
    private final RedisTemplate<String, Object> redisTemplate;

    // Metrics
    private final PermissionMetrics metrics;

    private static final Duration L2_CACHE_TTL = Duration.ofMinutes(5);

    /**
     * 核心权限检查方法
     */
    @Transactional(readOnly = true)
    public PermissionCheckResponse checkPermission(PermissionCheckRequest request) {
        long startTime = System.nanoTime();

        try {
            // 1. L1 缓存查找
            String cacheKey = buildCacheKey(request.getUserId(), request.getResourceId());
            PermissionCheckResponse cached = l1Cache.getIfPresent(cacheKey);

            if (cached != null && hasPermission(cached.getEffectivePermissions(), request.getRequiredPermission())) {
                metrics.recordCacheHit("L1");
                return cached;
            }

            // 2. L2 缓存查找 (Redis)
            cached = getFromL2Cache(cacheKey);
            if (cached != null && hasPermission(cached.getEffectivePermissions(), request.getRequiredPermission())) {
                // 写回 L1
                l1Cache.put(cacheKey, cached);
                metrics.recordCacheHit("L2");
                return cached;
            }

            // 3. 执行完整权限评估
            metrics.recordCacheMiss();
            PermissionCheckResponse result = evaluatePermission(request);

            // 4. 写入缓存
            l1Cache.put(cacheKey, result);
            saveToL2Cache(cacheKey, result);

            // 5. 异步审计日志
            auditService.logPermissionCheck(request, result);

            return result;

        } finally {
            long duration = System.nanoTime() - startTime;
            metrics.recordCheckLatency(duration / 1_000_000.0); // 转换为毫秒
        }
    }

    /**
     * 完整权限评估
     */
    private PermissionCheckResponse evaluatePermission(PermissionCheckRequest request) {
        List<String> reasons = new ArrayList<>();
        List<String> appliedPolicies = new ArrayList<>();
        long effectivePermissions = PermissionFlags.NONE;

        // 1. 检查黑名单
        if (isBlacklisted(request.getUserId(), request.getResourceId())) {
            return PermissionCheckResponse.denied("User is blacklisted");
        }

        // 2. 检查白名单
        Long whitelistPerms = getWhitelistPermissions(request.getUserId(), request.getResourceId());
        if (whitelistPerms != null) {
            effectivePermissions |= whitelistPerms;
            reasons.add("Whitelisted");
            appliedPolicies.add("whitelist");

            if (hasPermission(effectivePermissions, request.getRequiredPermission())) {
                return PermissionCheckResponse.allowed(effectivePermissions, reasons, appliedPolicies);
            }
        }

        // 3. 用户直接权限
        User user = userRepository.findById(request.getUserId())
            .orElseThrow(() -> new IllegalArgumentException("User not found"));
        effectivePermissions |= user.getPermissions();

        // 4. 组权限
        Long groupPerms = getGroupPermissions(request.getUserId());
        effectivePermissions |= groupPerms;
        if (groupPerms > 0) {
            reasons.add("Group permissions");
            appliedPolicies.add("group");
        }

        // 5. 资源权限
        Long resourcePerms = getResourcePermissions(request.getUserId(), request.getResourceId());
        effectivePermissions |= resourcePerms;
        if (resourcePerms > 0) {
            reasons.add("Resource permissions");
            appliedPolicies.add("resource");
        }

        // 6. 动态权限（所有者等）
        Long dynamicPerms = getDynamicPermissions(request.getUserId(), request.getResourceId());
        effectivePermissions |= dynamicPerms;
        if (dynamicPerms > 0) {
            reasons.add("Dynamic permissions (owner/creator)");
            appliedPolicies.add("dynamic");
        }

        // 7. 临时权限
        Long tempPerms = getTemporaryPermissions(request.getUserId(), request.getResourceId());
        effectivePermissions |= tempPerms;
        if (tempPerms > 0) {
            reasons.add("Temporary permissions");
            appliedPolicies.add("temporary");
        }

        // 8. 检查是否满足所需权限
        boolean allowed = hasPermission(effectivePermissions, request.getRequiredPermission());

        if (!allowed) {
            return PermissionCheckResponse.denied("Insufficient permissions");
        }

        return PermissionCheckResponse.allowed(effectivePermissions, reasons, appliedPolicies);
    }

    /**
     * 批量权限检查
     */
    public List<PermissionCheckResponse> checkPermissionsBatch(List<PermissionCheckRequest> requests) {
        // 并行执行
        List<CompletableFuture<PermissionCheckResponse>> futures = requests.stream()
            .map(request -> CompletableFuture.supplyAsync(() -> checkPermission(request)))
            .toList();

        return futures.stream()
            .map(CompletableFuture::join)
            .toList();
    }

    /**
     * 缓存失效
     */
    public void invalidateCache(UUID userId, UUID resourceId) {
        String pattern = userId != null
            ? String.format("perm:%s:*", userId)
            : String.format("perm:*:%s", resourceId);

        // L1 失效
        l1Cache.invalidateAll();

        // L2 失效 (Redis)
        Set<String> keys = redisTemplate.keys(pattern);
        if (keys != null && !keys.isEmpty()) {
            redisTemplate.delete(keys);
        }

        log.info("Invalidated cache for pattern: {}", pattern);
    }

    // ==================== Helper Methods ====================

    private String buildCacheKey(UUID userId, UUID resourceId) {
        return String.format("perm:%s:%s", userId, resourceId);
    }

    private boolean hasPermission(long granted, long required) {
        return PermissionFlags.hasPermission(granted, required);
    }

    private PermissionCheckResponse getFromL2Cache(String key) {
        try {
            return (PermissionCheckResponse) redisTemplate.opsForValue().get(key);
        } catch (Exception e) {
            log.error("Error getting from L2 cache", e);
            return null;
        }
    }

    private void saveToL2Cache(String key, PermissionCheckResponse response) {
        try {
            redisTemplate.opsForValue().set(key, response, L2_CACHE_TTL);
        } catch (Exception e) {
            log.error("Error saving to L2 cache", e);
        }
    }

    private boolean isBlacklisted(UUID userId, UUID resourceId) {
        // 查询黑名单表
        return false; // 简化实现
    }

    private Long getWhitelistPermissions(UUID userId, UUID resourceId) {
        // 查询白名单表
        return null; // 简化实现
    }

    private Long getGroupPermissions(UUID userId) {
        // 查询用户所在组的权限
        return 0L; // 简化实现
    }

    private Long getResourcePermissions(UUID userId, UUID resourceId) {
        // 查询资源权限表
        return permissionRepository.findByUserIdAndResourceId(userId, resourceId)
            .map(Permission::getFlags)
            .orElse(0L);
    }

    private Long getDynamicPermissions(UUID userId, UUID resourceId) {
        // 查询动态权限（基于关系）
        Resource resource = resourceRepository.findById(resourceId).orElse(null);
        if (resource != null && resource.getOwnerId().equals(userId)) {
            return PermissionFlags.combine(
                PermissionFlags.READ,
                PermissionFlags.WRITE,
                PermissionFlags.DELETE
            );
        }
        return 0L;
    }

    private Long getTemporaryPermissions(UUID userId, UUID resourceId) {
        // 查询临时权限表
        return 0L; // 简化实现
    }
}
```

### 2.3 REST Controller

```java
// PermissionController.java
package com.example.permission.controller;

import com.example.permission.domain.dto.*;
import com.example.permission.service.PermissionService;
import io.micrometer.core.annotation.Timed;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/v1/permissions")
@RequiredArgsConstructor
public class PermissionController {

    private final PermissionService permissionService;

    /**
     * 单个权限检查
     */
    @PostMapping("/check")
    @Timed(value = "permission.check", description = "Permission check latency")
    public ResponseEntity<PermissionCheckResponse> checkPermission(
            @Valid @RequestBody PermissionCheckRequest request,
            Authentication authentication) {

        log.debug("Checking permission for user: {}, resource: {}, permission: {}",
            request.getUserId(), request.getResourceId(), request.getRequiredPermission());

        PermissionCheckResponse response = permissionService.checkPermission(request);

        return ResponseEntity.ok(response);
    }

    /**
     * 批量权限检查
     */
    @PostMapping("/check/batch")
    @Timed(value = "permission.check.batch", description = "Batch permission check latency")
    public ResponseEntity<List<PermissionCheckResponse>> checkPermissionsBatch(
            @Valid @RequestBody List<PermissionCheckRequest> requests,
            Authentication authentication) {

        log.debug("Batch checking {} permissions", requests.size());

        List<PermissionCheckResponse> responses = permissionService.checkPermissionsBatch(requests);

        return ResponseEntity.ok(responses);
    }

    /**
     * 缓存失效
     */
    @DeleteMapping("/cache")
    public ResponseEntity<Void> invalidateCache(
            @RequestParam(required = false) UUID userId,
            @RequestParam(required = false) UUID resourceId,
            Authentication authentication) {

        log.info("Invalidating cache for userId: {}, resourceId: {}", userId, resourceId);

        permissionService.invalidateCache(userId, resourceId);

        return ResponseEntity.noContent().build();
    }
}
```

### 2.4 DTOs

```java
// PermissionCheckRequest.java
package com.example.permission.domain.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.util.UUID;

@Data
public class PermissionCheckRequest {

    @NotNull
    private UUID userId;

    @NotNull
    private UUID resourceId;

    @NotNull
    private Long requiredPermission;

    // 上下文信息（可选）
    private String ipAddress;
    private String userAgent;
    private Boolean isWorkingHours;
}

// PermissionCheckResponse.java
package com.example.permission.domain.dto;

import lombok.Data;
import lombok.Builder;
import java.util.List;

@Data
@Builder
public class PermissionCheckResponse {

    private boolean allowed;
    private long effectivePermissions;
    private List<String> reasons;
    private List<String> appliedPolicies;
    private List<String> dataFilters;
    private List<FieldMask> fieldMasks;
    private List<String> warnings;

    public static PermissionCheckResponse allowed(
            long effectivePermissions,
            List<String> reasons,
            List<String> appliedPolicies) {
        return PermissionCheckResponse.builder()
            .allowed(true)
            .effectivePermissions(effectivePermissions)
            .reasons(reasons)
            .appliedPolicies(appliedPolicies)
            .build();
    }

    public static PermissionCheckResponse denied(String reason) {
        return PermissionCheckResponse.builder()
            .allowed(false)
            .effectivePermissions(0L)
            .reasons(List.of(reason))
            .appliedPolicies(List.of())
            .build();
    }

    @Data
    @Builder
    public static class FieldMask {
        private String fieldName;
        private String maskingType;
        private Object maskingConfig;
    }
}
```

### 2.5 配置类

```java
// CacheConfig.java
package com.example.permission.config;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
public class CacheConfig {

    @Value("${permission.cache.l1.max-size:10000}")
    private long l1MaxSize;

    @Value("${permission.cache.l1.ttl-seconds:60}")
    private long l1TtlSeconds;

    @Bean
    public Cache<String, Object> permissionCache() {
        return Caffeine.newBuilder()
            .maximumSize(l1MaxSize)
            .expireAfterWrite(Duration.ofSeconds(l1TtlSeconds))
            .recordStats()
            .build();
    }
}

// SecurityConfig.java
package com.example.permission.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final KeycloakJwtConverter keycloakJwtConverter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health/**", "/actuator/info").permitAll()
                .requestMatchers("/actuator/prometheus").permitAll()
                .requestMatchers("/api/v1/**").authenticated()
                .anyRequest().denyAll()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt
                    .jwtAuthenticationConverter(jwtAuthenticationConverter())
                )
            );

        return http.build();
    }

    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(keycloakJwtConverter);
        return converter;
    }
}
```

### 2.6 Metrics

```java
// PermissionMetrics.java
package com.example.permission.metrics;

import io.micrometer.core.instrument.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

@Component
@RequiredArgsConstructor
public class PermissionMetrics {

    private final MeterRegistry registry;

    private final AtomicLong cacheHitCount = new AtomicLong(0);
    private final AtomicLong cacheMissCount = new AtomicLong(0);

    public void recordCacheHit(String level) {
        Counter.builder("permission.cache.hit")
            .tag("level", level)
            .register(registry)
            .increment();
        cacheHitCount.incrementAndGet();
    }

    public void recordCacheMiss() {
        Counter.builder("permission.cache.miss")
            .register(registry)
            .increment();
        cacheMissCount.incrementAndGet();
    }

    public void recordCheckLatency(double milliseconds) {
        Timer.builder("permission.check.latency")
            .description("Permission check latency")
            .publishPercentiles(0.5, 0.95, 0.99)
            .register(registry)
            .record(java.time.Duration.ofMillis((long) milliseconds));
    }

    public double getCacheHitRate() {
        long hits = cacheHitCount.get();
        long misses = cacheMissCount.get();
        long total = hits + misses;

        return total == 0 ? 0.0 : (double) hits / total;
    }
}
```

---

## 3. 集成测试

```java
// PermissionControllerIntegrationTest.java
package com.example.permission.integration;

import com.example.permission.domain.dto.PermissionCheckRequest;
import com.example.permission.domain.dto.PermissionCheckResponse;
import com.example.permission.domain.model.PermissionFlags;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class PermissionControllerIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
        .withDatabaseName("testdb")
        .withUsername("test")
        .withPassword("test");

    @Container
    static GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine")
        .withExposedPorts(6379);

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.data.redis.host", redis::getHost);
        registry.add("spring.data.redis.port", () -> redis.getMappedPort(6379));
    }

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    void testPermissionCheck_ShouldReturnAllowed_WhenUserHasPermission() {
        // Given
        PermissionCheckRequest request = new PermissionCheckRequest();
        request.setUserId(UUID.randomUUID());
        request.setResourceId(UUID.randomUUID());
        request.setRequiredPermission(PermissionFlags.READ);

        // When
        ResponseEntity<PermissionCheckResponse> response = restTemplate.postForEntity(
            "/api/v1/permissions/check",
            request,
            PermissionCheckResponse.class
        );

        // Then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        // Add more assertions based on your setup
    }

    @Test
    void testPermissionCheck_ShouldUseCache_OnSecondRequest() {
        // Test cache hit scenario
        // Implementation depends on your metrics setup
    }
}
```

---

## 4. Docker

```dockerfile
# Dockerfile
FROM eclipse-temurin:21-jre-alpine AS builder
WORKDIR /app
COPY target/*.jar app.jar
RUN java -Djarmode=layertools -jar app.jar extract

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# 创建非 root 用户
RUN addgroup -g 1000 appgroup && \
    adduser -u 1000 -G appgroup -s /bin/sh -D appuser

# 复制层
COPY --from=builder /app/dependencies/ ./
COPY --from=builder /app/spring-boot-loader/ ./
COPY --from=builder /app/snapshot-dependencies/ ./
COPY --from=builder /app/application/ ./

# 修改所有权
RUN chown -R appuser:appgroup /app

USER appuser

# JVM 参数
ENV JAVA_OPTS="-Xms2g -Xmx4g -XX:+UseG1GC -XX:MaxGCPauseMillis=200"

EXPOSE 8082

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS org.springframework.boot.loader.launch.JarLauncher"]
```

---

继续创建运维手册和总索引文档？
