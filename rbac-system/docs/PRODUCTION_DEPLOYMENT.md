# 企业级权限管理系统 - 生产部署设计文档

> **版本**: 1.0
> **目标**: 生产就绪、高性能、可扩展的企业级权限管理系统
> **技术栈**: Spring Boot + Keycloak + Redis + PostgreSQL + AWS + Kubernetes

---

## 1. 系统架构概览

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AWS Cloud (Production)                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    Route 53 (DNS)                                   │ │
│  └───────────────────────────────┬────────────────────────────────────┘ │
│                                  │                                        │
│  ┌───────────────────────────────▼────────────────────────────────────┐ │
│  │              CloudFront (CDN) + WAF                                 │ │
│  │              - DDoS Protection                                      │ │
│  │              - SSL/TLS Termination                                  │ │
│  └───────────────────────────────┬────────────────────────────────────┘ │
│                                  │                                        │
│  ┌───────────────────────────────▼────────────────────────────────────┐ │
│  │         Application Load Balancer (ALB)                             │ │
│  │         - Health Checks                                             │ │
│  │         - Sticky Sessions                                           │ │
│  └──────┬─────────────────┬──────────────────┬───────────────────────┘ │
│         │                 │                  │                           │
│         │                 │                  │                           │
│  ┌──────▼─────────┐ ┌────▼──────────┐ ┌─────▼───────────┐              │
│  │  EKS Cluster   │ │  EKS Cluster  │ │  EKS Cluster    │              │
│  │  (AZ-1a)       │ │  (AZ-1b)      │ │  (AZ-1c)        │              │
│  │                │ │               │ │                 │              │
│  │ ┌────────────┐ │ │ ┌───────────┐│ │ ┌─────────────┐ │              │
│  │ │ API Gateway│ │ │ │API Gateway││ │ │ API Gateway │ │              │
│  │ │ (Spring    │ │ │ │(Spring    ││ │ │ (Spring     │ │              │
│  │ │  Cloud     │ │ │ │ Cloud     ││ │ │  Cloud      │ │              │
│  │ │  Gateway)  │ │ │ │ Gateway)  ││ │ │  Gateway)   │ │              │
│  │ └─────┬──────┘ │ │ └─────┬─────┘│ │ └──────┬──────┘ │              │
│  │       │        │ │       │      │ │        │        │              │
│  │ ┌─────▼──────────────────▼────────────────▼──────┐ │              │
│  │ │            Service Mesh (Istio)                │ │              │
│  │ └─────┬──────────────────┬────────────────┬──────┘ │              │
│  │       │                  │                │        │              │
│  │ ┌─────▼─────┐ ┌─────────▼────┐ ┌─────────▼──────┐ │              │
│  │ │ Keycloak  │ │ Permission   │ │ GraphQL        │ │              │
│  │ │ Service   │ │ Service      │ │ Gateway        │ │              │
│  │ │ (Auth)    │ │ (Core RBAC)  │ │ Service        │ │              │
│  │ │           │ │              │ │                │ │              │
│  │ │ Pods: 3+  │ │ Pods: 5+     │ │ Pods: 3+       │ │              │
│  │ └───────────┘ └──────┬───────┘ └────────────────┘ │              │
│  │                      │                             │              │
│  │              ┌───────▼────────┐                    │              │
│  │              │  Identity      │                    │              │
│  │              │  Service       │                    │              │
│  │              │  (User Info)   │                    │              │
│  │              │  Pods: 3+      │                    │              │
│  │              └────────────────┘                    │              │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      Data Layer                                     │ │
│  │  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐                │ │
│  │  │ ElastiCache │ │ RDS (Aurora) │ │ ElastiCache  │                │ │
│  │  │ Redis       │ │ PostgreSQL   │ │ Redis        │                │ │
│  │  │ (L2 Cache)  │ │ (Primary)    │ │ (Replica)    │                │ │
│  │  │             │ │              │ │              │                │ │
│  │  │ AZ-1a       │ │ Multi-AZ     │ │ AZ-1b        │                │ │
│  │  └─────────────┘ └──────────────┘ └──────────────┘                │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                   Monitoring & Logging                              │ │
│  │  ┌──────────────┐ ┌───────────────┐ ┌─────────────┐               │ │
│  │  │ CloudWatch   │ │ Prometheus    │ │ ELK Stack   │               │ │
│  │  │ (Metrics)    │ │ (Metrics)     │ │ (Logs)      │               │ │
│  │  └──────────────┘ └───────────────┘ └─────────────┘               │ │
│  │  ┌──────────────┐ ┌───────────────┐ ┌─────────────┐               │ │
│  │  │ Grafana      │ │ Jaeger        │ │ X-Ray       │               │ │
│  │  │ (Dashboard)  │ │ (Tracing)     │ │ (Tracing)   │               │ │
│  │  └──────────────┘ └───────────────┘ └─────────────┘               │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 服务拆分

#### 核心服务

| 服务名 | 技术栈 | 职责 | 实例数 | 资源配置 |
|--------|--------|------|--------|----------|
| **keycloak-service** | Keycloak 23+ | 认证授权、Token签发 | 3+ | 2 CPU, 4GB RAM |
| **permission-service** | Spring Boot 3.2 | 权限检查核心引擎 | 5+ | 4 CPU, 8GB RAM |
| **identity-service** | Spring Boot 3.2 | 用户身份、属性管理 | 3+ | 2 CPU, 4GB RAM |
| **graphql-gateway** | Spring Boot + GraphQL | GraphQL 联邦网关 | 3+ | 2 CPU, 4GB RAM |
| **api-gateway** | Spring Cloud Gateway | API 路由、限流 | 3+ | 2 CPU, 4GB RAM |
| **audit-service** | Spring Boot 3.2 | 审计日志、合规报告 | 2+ | 2 CPU, 4GB RAM |

#### 支撑服务

| 服务名 | 技术栈 | 职责 | 实例数 |
|--------|--------|------|--------|
| **config-server** | Spring Cloud Config | 配置管理 | 2+ |
| **eureka-server** | Spring Cloud Netflix | 服务发现 | 3+ |
| **admin-service** | Spring Boot Admin | 服务监控 | 2 |

### 1.3 数据流

```
┌──────────┐
│  Client  │
└────┬─────┘
     │ 1. Request + JWT Token
     ↓
┌────────────────────┐
│   API Gateway      │
│  (Rate Limiting,   │
│   CORS, etc.)      │
└────┬───────────────┘
     │ 2. Route to service
     ↓
┌────────────────────┐
│  Keycloak Service  │ ← 3. Verify JWT Token
│  (if needed)       │    Extract user_id
└────┬───────────────┘
     │ 4. user_id
     ↓
┌────────────────────┐
│ Identity Service   │ ← 5. Get user info
│                    │    (attributes, groups)
└────┬───────────────┘
     │ 6. User object
     ↓
┌────────────────────────────────────────┐
│       Permission Service                │
│  ┌──────────────────────────────────┐  │
│  │ 1. Check L1 Cache (Caffeine)     │  │ ← 7. Check permission
│  │    ↓ miss                         │  │    userId + resourceId
│  │ 2. Check L2 Cache (Redis)        │  │    + permission
│  │    ↓ miss                         │  │
│  │ 3. Check L3 (DB Materialized View)│ │
│  │    ↓ miss                         │  │
│  │ 4. Full Evaluation:               │  │
│  │    - RBAC hierarchy               │  │
│  │    - ABAC policies                │  │
│  │    - Dynamic permissions          │  │
│  │    - SOD constraints              │  │
│  │    - RLS/CLS filters              │  │
│  └──────────────────────────────────┘  │
└────┬───────────────────────────────────┘
     │ 8. Permission result
     │    + data filters
     │    + field masks
     ↓
┌────────────────────┐
│ Business Service   │ ← 9. Apply filters
│ (e.g., User Svc)   │    Query database
└────┬───────────────┘
     │ 10. Filtered data
     ↓
┌────────────────────┐
│  Client            │ ← 11. Response
└────────────────────┘

┌────────────────────┐
│  Audit Service     │ ← Async: Log all access
│  (Message Queue)   │
└────────────────────┘
```

---

## 2. 技术栈详细说明

### 2.1 后端服务

```xml
<!-- Spring Boot 核心依赖 -->
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.0</version>
</parent>

<dependencies>
    <!-- Web -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>

    <!-- Spring Data JPA -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>

    <!-- PostgreSQL -->
    <dependency>
        <groupId>org.postgresql</groupId>
        <artifactId>postgresql</artifactId>
    </dependency>

    <!-- Redis -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-redis</artifactId>
    </dependency>

    <!-- Caffeine Cache (L1) -->
    <dependency>
        <groupId>com.github.ben-manes.caffeine</groupId>
        <artifactId>caffeine</artifactId>
    </dependency>

    <!-- Keycloak Integration -->
    <dependency>
        <groupId>org.keycloak</groupId>
        <artifactId>keycloak-spring-boot-starter</artifactId>
        <version>23.0.1</version>
    </dependency>

    <!-- Spring Cloud -->
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
    </dependency>

    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-config</artifactId>
    </dependency>

    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-gateway</artifactId>
    </dependency>

    <!-- GraphQL -->
    <dependency>
        <groupId>com.graphql-java-kickstart</groupId>
        <artifactId>graphql-spring-boot-starter</artifactId>
        <version>15.0.0</version>
    </dependency>

    <!-- Resilience4j (Circuit Breaker) -->
    <dependency>
        <groupId>io.github.resilience4j</groupId>
        <artifactId>resilience4j-spring-boot3</artifactId>
        <version>2.1.0</version>
    </dependency>

    <!-- Micrometer (Metrics) -->
    <dependency>
        <groupId>io.micrometer</groupId>
        <artifactId>micrometer-registry-prometheus</artifactId>
    </dependency>

    <!-- Distributed Tracing -->
    <dependency>
        <groupId>io.micrometer</groupId>
        <artifactId>micrometer-tracing-bridge-brave</artifactId>
    </dependency>

    <dependency>
        <groupId>io.zipkin.reporter2</groupId>
        <artifactId>zipkin-reporter-brave</artifactId>
    </dependency>

    <!-- Kafka (for async audit) -->
    <dependency>
        <groupId>org.springframework.kafka</groupId>
        <artifactId>spring-kafka</artifactId>
    </dependency>

    <!-- Testing -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-test</artifactId>
        <scope>test</scope>
    </dependency>

    <dependency>
        <groupId>org.testcontainers</groupId>
        <artifactId>postgresql</artifactId>
        <scope>test</scope>
    </dependency>
</dependencies>
```

### 2.2 基础设施

| 组件 | AWS 服务 | 用途 |
|------|----------|------|
| **容器编排** | EKS (Elastic Kubernetes Service) | 运行容器化应用 |
| **数据库** | RDS Aurora PostgreSQL | 主数据存储 |
| **缓存** | ElastiCache for Redis | L2 缓存层 |
| **消息队列** | Amazon MSK (Kafka) | 异步审计日志 |
| **负载均衡** | Application Load Balancer | 流量分发 |
| **CDN** | CloudFront | 边缘缓存 |
| **DNS** | Route 53 | 域名解析 |
| **存储** | S3 | 审计日志归档、配置文件 |
| **密钥管理** | Secrets Manager | 敏感配置管理 |
| **监控** | CloudWatch + Prometheus | 指标收集 |
| **日志** | CloudWatch Logs + ELK | 日志聚合 |
| **追踪** | X-Ray + Jaeger | 分布式追踪 |

---

## 3. 数据库设计

### 3.1 PostgreSQL Schema

```sql
-- ==================== 核心权限表 ====================

-- 租户表
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    default_permissions BIGINT NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1
);

CREATE INDEX idx_tenants_name ON tenants(name);

-- 用户组表
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    permissions BIGINT NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1,
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_groups_tenant ON groups(tenant_id);
CREATE INDEX idx_groups_parent ON groups(parent_group_id);
CREATE INDEX idx_groups_name ON groups(tenant_id, name);

-- 用户表（轻量级，主要信息在 Keycloak）
CREATE TABLE users (
    id UUID PRIMARY KEY, -- 与 Keycloak user_id 一致
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    keycloak_id VARCHAR(255) NOT NULL UNIQUE,
    permissions BIGINT NOT NULL DEFAULT 0,
    attributes JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 1
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_keycloak ON users(keycloak_id);
CREATE INDEX idx_users_attributes ON users USING gin(attributes);

-- 用户组关系表
CREATE TABLE user_groups (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY(user_id, group_id)
);

CREATE INDEX idx_user_groups_user ON user_groups(user_id);
CREATE INDEX idx_user_groups_group ON user_groups(group_id);

-- 资源表
CREATE TABLE resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_resource_id UUID REFERENCES resources(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id),
    creator_id UUID NOT NULL REFERENCES users(id),
    state JSONB DEFAULT '{"status": "active", "version": 1}',
    attributes JSONB DEFAULT '{}',
    permissions BIGINT NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1
);

CREATE INDEX idx_resources_tenant ON resources(tenant_id);
CREATE INDEX idx_resources_type ON resources(type);
CREATE INDEX idx_resources_owner ON resources(owner_id);
CREATE INDEX idx_resources_creator ON resources(creator_id);
CREATE INDEX idx_resources_parent ON resources(parent_resource_id);
CREATE INDEX idx_resources_attributes ON resources USING gin(attributes);

-- 资源权限表
CREATE TABLE resource_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    subject_type VARCHAR(20) NOT NULL CHECK (subject_type IN ('user', 'group')),
    subject_id UUID NOT NULL,
    permissions BIGINT NOT NULL,
    source VARCHAR(20) DEFAULT 'direct',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1
);

CREATE INDEX idx_resource_permissions_resource ON resource_permissions(resource_id);
CREATE INDEX idx_resource_permissions_subject ON resource_permissions(subject_type, subject_id);
CREATE UNIQUE INDEX idx_resource_permissions_unique
    ON resource_permissions(resource_id, subject_type, subject_id);

-- 访问控制表（黑白名单）
CREATE TABLE access_control (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    control_type VARCHAR(20) NOT NULL CHECK (control_type IN ('blacklist', 'whitelist')),
    permissions BIGINT NOT NULL,
    reason TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 1,
    UNIQUE(resource_id, user_id, control_type)
);

CREATE INDEX idx_access_control_resource ON access_control(resource_id);
CREATE INDEX idx_access_control_user ON access_control(user_id);
CREATE INDEX idx_access_control_expires ON access_control(expires_at) WHERE expires_at IS NOT NULL;

-- ==================== 高级功能表 ====================

-- ABAC 策略表
CREATE TABLE abac_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    resource_type VARCHAR(100),
    conditions JSONB NOT NULL,
    effect VARCHAR(10) NOT NULL CHECK (effect IN ('allow', 'deny')),
    permissions BIGINT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1
);

CREATE INDEX idx_abac_policies_type ON abac_policies(resource_type);
CREATE INDEX idx_abac_policies_enabled ON abac_policies(enabled) WHERE enabled = true;
CREATE INDEX idx_abac_policies_priority ON abac_policies(priority DESC);

-- 临时权限表
CREATE TABLE temporary_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    permissions BIGINT NOT NULL,
    granted_by UUID NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    auto_revoke BOOLEAN NOT NULL DEFAULT true,
    revoked BOOLEAN NOT NULL DEFAULT false,
    revoked_at TIMESTAMP,
    revoked_by UUID REFERENCES users(id)
);

CREATE INDEX idx_temporary_permissions_user ON temporary_permissions(user_id);
CREATE INDEX idx_temporary_permissions_resource ON temporary_permissions(resource_id);
CREATE INDEX idx_temporary_permissions_expires ON temporary_permissions(expires_at);
CREATE INDEX idx_temporary_permissions_active
    ON temporary_permissions(user_id, resource_id)
    WHERE NOT revoked AND expires_at > NOW();

-- ==================== 性能优化 ====================

-- 物化视图：用户有效权限（每5分钟刷新）
CREATE MATERIALIZED VIEW materialized_user_permissions AS
SELECT
    u.id as user_id,
    r.id as resource_id,
    (
        COALESCE(u.permissions, 0) |
        COALESCE(MAX(g.permissions), 0) |
        COALESCE(MAX(rp.permissions), 0)
    ) as effective_permissions,
    NOW() as computed_at
FROM users u
CROSS JOIN resources r
LEFT JOIN user_groups ug ON ug.user_id = u.id
LEFT JOIN groups g ON g.id = ug.group_id
LEFT JOIN resource_permissions rp
    ON rp.resource_id = r.id
    AND ((rp.subject_type = 'user' AND rp.subject_id = u.id)
         OR (rp.subject_type = 'group' AND rp.subject_id = ug.group_id))
WHERE u.tenant_id = r.tenant_id
GROUP BY u.id, r.id, u.permissions;

CREATE UNIQUE INDEX idx_mat_perm_lookup
    ON materialized_user_permissions(user_id, resource_id);

-- 自动刷新函数
CREATE OR REPLACE FUNCTION refresh_permissions_mv()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY materialized_user_permissions;
END;
$$ LANGUAGE plpgsql;

-- ==================== 审计日志（分区表） ====================

CREATE TABLE audit_logs (
    id UUID NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    tenant_id UUID NOT NULL,
    user_id UUID,
    action VARCHAR(50) NOT NULL,
    resource_id UUID,
    resource_type VARCHAR(100),
    permission BIGINT,
    result VARCHAR(20) NOT NULL,
    reason TEXT,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- 创建分区（自动化脚本每月创建）
CREATE TABLE audit_logs_2024_01 PARTITION OF audit_logs
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE INDEX idx_audit_logs_2024_01_tenant ON audit_logs_2024_01(tenant_id);
CREATE INDEX idx_audit_logs_2024_01_user ON audit_logs_2024_01(user_id);
CREATE INDEX idx_audit_logs_2024_01_timestamp ON audit_logs_2024_01(timestamp DESC);

-- ==================== 数据库配置优化 ====================

-- 连接池配置
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '4GB';
ALTER SYSTEM SET effective_cache_size = '12GB';
ALTER SYSTEM SET maintenance_work_mem = '1GB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;
ALTER SYSTEM SET work_mem = '10MB';
ALTER SYSTEM SET min_wal_size = '1GB';
ALTER SYSTEM SET max_wal_size = '4GB';

-- 重新加载配置
SELECT pg_reload_conf();
```

### 3.2 Redis 数据结构

```
# L2 缓存 - 权限检查结果
Key: perm:{userId}:{resourceId}
Value: {
  "allowed": true,
  "effectivePermissions": 31,
  "reasons": ["Group: developers"],
  "appliedPolicies": ["group_permissions"],
  "cachedAt": 1704067200000
}
TTL: 300 秒（5分钟）

# 用户会话缓存
Key: session:{sessionId}
Value: {
  "userId": "uuid",
  "keycloakId": "keycloak-uuid",
  "tenantId": "tenant-uuid",
  "groups": ["group-1", "group-2"],
  "attributes": {...}
}
TTL: 600 秒（10分钟）

# 速率限制
Key: ratelimit:{userId}:{endpoint}
Value: 15  # 当前请求计数
TTL: 60 秒（滑动窗口）

# 分布式锁（用于缓存刷新）
Key: lock:refresh:permissions
Value: "lock-holder-id"
TTL: 30 秒
```

---

## 4. Keycloak 集成

### 4.1 Keycloak 配置

```yaml
# keycloak-realm.json
{
  "realm": "permission-system",
  "enabled": true,
  "sslRequired": "external",
  "registrationAllowed": false,
  "loginWithEmailAllowed": true,
  "duplicateEmailsAllowed": false,
  "resetPasswordAllowed": true,
  "editUsernameAllowed": false,
  "bruteForceProtected": true,

  "accessTokenLifespan": 300,           # 5分钟
  "accessTokenLifespanForImplicitFlow": 900,
  "ssoSessionIdleTimeout": 1800,         # 30分钟
  "ssoSessionMaxLifespan": 36000,        # 10小时
  "offlineSessionIdleTimeout": 2592000,  # 30天

  "clients": [
    {
      "clientId": "permission-service",
      "enabled": true,
      "clientAuthenticatorType": "client-secret",
      "secret": "${KEYCLOAK_CLIENT_SECRET}",
      "redirectUris": ["https://api.example.com/*"],
      "webOrigins": ["https://app.example.com"],
      "protocol": "openid-connect",
      "publicClient": false,
      "bearerOnly": false,
      "standardFlowEnabled": true,
      "directAccessGrantsEnabled": true,
      "serviceAccountsEnabled": true,

      "attributes": {
        "access.token.lifespan": "300",
        "client.session.idle.timeout": "1800",
        "client.session.max.lifespan": "36000"
      },

      "protocolMappers": [
        {
          "name": "tenant-id",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-usermodel-attribute-mapper",
          "config": {
            "user.attribute": "tenantId",
            "claim.name": "tenant_id",
            "jsonType.label": "String",
            "id.token.claim": "true",
            "access.token.claim": "true"
          }
        },
        {
          "name": "groups",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-group-membership-mapper",
          "config": {
            "claim.name": "groups",
            "full.path": "false",
            "id.token.claim": "true",
            "access.token.claim": "true"
          }
        }
      ]
    },

    {
      "clientId": "api-gateway",
      "enabled": true,
      "publicClient": false,
      "bearerOnly": true,
      "standardFlowEnabled": false
    },

    {
      "clientId": "web-app",
      "enabled": true,
      "publicClient": true,
      "redirectUris": ["https://app.example.com/*"],
      "webOrigins": ["https://app.example.com"],
      "standardFlowEnabled": true,
      "implicitFlowEnabled": false
    }
  ],

  "roles": {
    "realm": [
      {
        "name": "admin",
        "description": "Administrator role"
      },
      {
        "name": "user",
        "description": "Standard user role"
      }
    ]
  },

  "groups": [
    {
      "name": "developers",
      "attributes": {
        "department": ["Engineering"],
        "securityLevel": ["3"]
      }
    },
    {
      "name": "managers",
      "attributes": {
        "department": ["Management"],
        "securityLevel": ["4"]
      }
    }
  ],

  "users": [],

  "identityProviders": [
    {
      "alias": "google",
      "providerId": "google",
      "enabled": true,
      "config": {
        "clientId": "${GOOGLE_CLIENT_ID}",
        "clientSecret": "${GOOGLE_CLIENT_SECRET}",
        "defaultScope": "openid profile email"
      }
    },
    {
      "alias": "github",
      "providerId": "github",
      "enabled": true,
      "config": {
        "clientId": "${GITHUB_CLIENT_ID}",
        "clientSecret": "${GITHUB_CLIENT_SECRET}"
      }
    }
  ]
}
```

### 4.2 Spring Boot Keycloak 配置

```yaml
# application.yml
keycloak:
  realm: permission-system
  auth-server-url: ${KEYCLOAK_URL:http://keycloak:8080}
  ssl-required: external
  resource: permission-service
  credentials:
    secret: ${KEYCLOAK_CLIENT_SECRET}
  use-resource-role-mappings: true
  bearer-only: true

  # 连接池
  connection-pool-size: 20

  # 安全约束
  security-constraints:
    - auth-roles:
        - user
      security-collections:
        - patterns:
            - /api/*
    - auth-roles:
        - admin
      security-collections:
        - patterns:
            - /api/admin/*
```

---

## 5. 部署架构

### 5.1 Docker Compose（本地开发）

```yaml
# docker-compose.yml
version: '3.8'

services:
  # ==================== 基础设施 ====================

  postgres:
    image: postgres:16-alpine
    container_name: permission-postgres
    environment:
      POSTGRES_DB: permission_db
      POSTGRES_USER: ${DB_USER:-admin}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-admin123}
      POSTGRES_INITDB_ARGS: "-E UTF8 --locale=en_US.UTF-8"
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init-db.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-admin}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - permission-network

  redis:
    image: redis:7-alpine
    container_name: permission-redis
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-redis123}
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - permission-network

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    container_name: permission-kafka
    depends_on:
      - zookeeper
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    ports:
      - "9092:9092"
    networks:
      - permission-network

  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    container_name: permission-zookeeper
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    ports:
      - "2181:2181"
    networks:
      - permission-network

  # ==================== Keycloak ====================

  keycloak:
    image: quay.io/keycloak/keycloak:23.0
    container_name: permission-keycloak
    command:
      - start-dev
      - --import-realm
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak_db
      KC_DB_USERNAME: ${DB_USER:-admin}
      KC_DB_PASSWORD: ${DB_PASSWORD:-admin123}
      KC_HOSTNAME: localhost
      KC_HOSTNAME_PORT: 8080
      KC_HOSTNAME_STRICT: false
      KC_HOSTNAME_STRICT_HTTPS: false
      KC_LOG_LEVEL: info
      KC_METRICS_ENABLED: true
      KC_HEALTH_ENABLED: true
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:-admin}
    ports:
      - "8080:8080"
    volumes:
      - ./keycloak/realm.json:/opt/keycloak/data/import/realm.json
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "exec 3<>/dev/tcp/127.0.0.1/8080;echo -e 'GET /health/ready HTTP/1.1\r\nhost: 127.0.0.1\r\nConnection: close\r\n\r\n' >&3;timeout 3 cat <&3 | grep -m 1 200"]
      interval: 30s
      timeout: 10s
      retries: 5
    networks:
      - permission-network

  # ==================== 核心服务 ====================

  config-server:
    build:
      context: ./config-server
      dockerfile: Dockerfile
    container_name: permission-config-server
    environment:
      SPRING_PROFILES_ACTIVE: docker
      SPRING_CLOUD_CONFIG_SERVER_GIT_URI: ${CONFIG_REPO_URI}
      SPRING_CLOUD_CONFIG_SERVER_GIT_USERNAME: ${CONFIG_REPO_USER}
      SPRING_CLOUD_CONFIG_SERVER_GIT_PASSWORD: ${CONFIG_REPO_PASS}
    ports:
      - "8888:8888"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8888/actuator/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - permission-network

  eureka-server:
    build:
      context: ./eureka-server
      dockerfile: Dockerfile
    container_name: permission-eureka
    environment:
      SPRING_PROFILES_ACTIVE: docker
      SPRING_CLOUD_CONFIG_URI: http://config-server:8888
    ports:
      - "8761:8761"
    depends_on:
      config-server:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8761/actuator/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - permission-network

  identity-service:
    build:
      context: ./identity-service
      dockerfile: Dockerfile
    container_name: permission-identity-service
    environment:
      SPRING_PROFILES_ACTIVE: docker
      SPRING_CLOUD_CONFIG_URI: http://config-server:8888
      EUREKA_CLIENT_SERVICEURL_DEFAULTZONE: http://eureka-server:8761/eureka/
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/permission_db
      SPRING_DATASOURCE_USERNAME: ${DB_USER:-admin}
      SPRING_DATASOURCE_PASSWORD: ${DB_PASSWORD:-admin123}
      SPRING_DATA_REDIS_HOST: redis
      SPRING_DATA_REDIS_PORT: 6379
      SPRING_DATA_REDIS_PASSWORD: ${REDIS_PASSWORD:-redis123}
      KEYCLOAK_AUTH_SERVER_URL: http://keycloak:8080
    ports:
      - "8081:8081"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      keycloak:
        condition: service_healthy
      eureka-server:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/actuator/health"]
      interval: 30s
      timeout: 10s
      retries: 5
    networks:
      - permission-network

  permission-service:
    build:
      context: ./permission-service
      dockerfile: Dockerfile
    container_name: permission-permission-service
    environment:
      SPRING_PROFILES_ACTIVE: docker
      SPRING_CLOUD_CONFIG_URI: http://config-server:8888
      EUREKA_CLIENT_SERVICEURL_DEFAULTZONE: http://eureka-server:8761/eureka/
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/permission_db
      SPRING_DATASOURCE_USERNAME: ${DB_USER:-admin}
      SPRING_DATASOURCE_PASSWORD: ${DB_PASSWORD:-admin123}
      SPRING_DATA_REDIS_HOST: redis
      SPRING_DATA_REDIS_PORT: 6379
      SPRING_DATA_REDIS_PASSWORD: ${REDIS_PASSWORD:-redis123}
      KEYCLOAK_AUTH_SERVER_URL: http://keycloak:8080
      JAVA_OPTS: -Xmx2g -Xms1g
    ports:
      - "8082:8082"
    depends_on:
      identity-service:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8082/actuator/health"]
      interval: 30s
      timeout: 10s
      retries: 5
    networks:
      - permission-network

  api-gateway:
    build:
      context: ./api-gateway
      dockerfile: Dockerfile
    container_name: permission-api-gateway
    environment:
      SPRING_PROFILES_ACTIVE: docker
      SPRING_CLOUD_CONFIG_URI: http://config-server:8888
      EUREKA_CLIENT_SERVICEURL_DEFAULTZONE: http://eureka-server:8761/eureka/
      SPRING_DATA_REDIS_HOST: redis
      SPRING_DATA_REDIS_PORT: 6379
      SPRING_DATA_REDIS_PASSWORD: ${REDIS_PASSWORD:-redis123}
      KEYCLOAK_AUTH_SERVER_URL: http://keycloak:8080
    ports:
      - "8080:8080"
    depends_on:
      permission-service:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
      interval: 30s
      timeout: 10s
      retries: 5
    networks:
      - permission-network

  audit-service:
    build:
      context: ./audit-service
      dockerfile: Dockerfile
    container_name: permission-audit-service
    environment:
      SPRING_PROFILES_ACTIVE: docker
      SPRING_CLOUD_CONFIG_URI: http://config-server:8888
      EUREKA_CLIENT_SERVICEURL_DEFAULTZONE: http://eureka-server:8761/eureka/
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/permission_db
      SPRING_DATASOURCE_USERNAME: ${DB_USER:-admin}
      SPRING_DATASOURCE_PASSWORD: ${DB_PASSWORD:-admin123}
      SPRING_KAFKA_BOOTSTRAP_SERVERS: kafka:9092
    ports:
      - "8083:8083"
    depends_on:
      - kafka
      - postgres
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8083/actuator/health"]
      interval: 30s
      timeout: 10s
      retries: 5
    networks:
      - permission-network

  # ==================== 监控 ====================

  prometheus:
    image: prom/prometheus:latest
    container_name: permission-prometheus
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
    ports:
      - "9090:9090"
    networks:
      - permission-network

  grafana:
    image: grafana/grafana:latest
    container_name: permission-grafana
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin}
      GF_USERS_ALLOW_SIGN_UP: false
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./monitoring/grafana/datasources:/etc/grafana/provisioning/datasources
    ports:
      - "3000:3000"
    depends_on:
      - prometheus
    networks:
      - permission-network

volumes:
  postgres_data:
  redis_data:
  prometheus_data:
  grafana_data:

networks:
  permission-network:
    driver: bridge
```

### 5.2 Kubernetes 部署

继续在下一个文件...

---

**下一部分将包含**：
1. Kubernetes 部署清单
2. AWS 基础设施配置（Terraform）
3. CI/CD 流水线
4. 监控和告警配置
5. 运维手册

是否继续创建完整的部署配置文档？
