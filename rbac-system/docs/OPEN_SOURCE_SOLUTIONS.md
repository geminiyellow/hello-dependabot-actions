# 开源权限管理系统对比分析

业界主流开源权限管理方案全面对比 (2024-2025)

## 目录

1. [方案分类](#方案分类)
2. [Google Zanzibar启发的系统](#google-zanzibar启发的系统)
3. [策略引擎类](#策略引擎类)
4. [IAM平台类](#iam平台类)
5. [详细对比表](#详细对比表)
6. [选型建议](#选型建议)
7. [集成示例](#集成示例)

---

## 方案分类

### 📊 三大类别

```
┌─────────────────────────────────────────────────────────────┐
│                   开源权限管理系统                            │
└─────────────────┬───────────────────────────────────────────┘
                  │
        ┌─────────┴──────────┬──────────────┐
        │                    │              │
┌───────▼────────┐  ┌────────▼──────┐  ┌───▼──────────┐
│ Zanzibar-inspired│  │  策略引擎类   │  │  IAM平台类    │
│ (关系型权限)     │  │ (Policy-based)│  │ (认证+授权)   │
├─────────────────┤  ├───────────────┤  ├──────────────┤
│ • SpiceDB       │  │ • OPA         │  │ • Keycloak   │
│ • Ory Keto      │  │ • Casbin      │  │ • Zitadel    │
│ • OpenFGA       │  │ • Cerbos      │  │ • Casdoor    │
│ • Permify       │  │ • OSO         │  │ • Gluu       │
│ • Warrant       │  │               │  │              │
└─────────────────┘  └───────────────┘  └──────────────┘
```

---

## Google Zanzibar启发的系统

> Google Zanzibar是Google内部用于管理全球范围权限的系统，为YouTube、Drive、Calendar等产品提供权限服务。

### 1. SpiceDB ⭐️⭐️⭐️⭐️⭐️ (最推荐)

**官网**: https://authzed.com/spicedb
**GitHub**: https://github.com/authzed/spicedb (4.8k stars)
**授权**: Apache 2.0

#### 特点

- ✅ **最成熟的Zanzibar实现**，生产就绪
- ✅ **性能极强**: P95延迟5ms，支持百万级QPS
- ✅ **独特功能**: 支持反向查询 (LookupResources - "用户能访问哪些资源？")
- ✅ **全球复制**: 支持分布式部署
- ✅ **强一致性**: 使用Zookies确保一致性读
- ✅ **多后端支持**: PostgreSQL, CockroachDB, MySQL, Spanner

#### 架构

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ gRPC
┌──────▼──────────────────────────────────────────────┐
│                   SpiceDB                            │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │   CheckAPI   │  │ LookupAPI    │  │ WriteAPI  │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
│         │                 │                 │        │
│  ┌──────▼─────────────────▼─────────────────▼─────┐ │
│  │          Graph Engine (Dispatch)                │ │
│  └──────────────────────┬──────────────────────────┘ │
│                         │                             │
│  ┌──────────────────────▼──────────────────────────┐ │
│  │        Datastore (Relationships)                 │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐     │ │
│  │  │PostgreSQL│  │CockroachDB│ │  Spanner │ ... │ │
│  │  └──────────┘  └──────────┘  └──────────┘     │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

#### Schema示例 (Authzed Schema Language)

```zed
definition user {}

definition document {
    relation owner: user
    relation editor: user
    relation viewer: user

    permission edit = owner + editor
    permission view = owner + editor + viewer
}

definition folder {
    relation owner: user
    relation parent: folder

    permission view = owner + parent->view
}
```

#### 使用示例

```go
package main

import (
    v1 "github.com/authzed/authzed-go/proto/authzed/api/v1"
    "github.com/authzed/authzed-go/v1"
    "github.com/authzed/grpcutil"
)

func main() {
    client, err := authzed.NewClient(
        "grpc.authzed.com:443",
        grpcutil.WithInsecureBearerToken("your-token"),
    )

    // 检查权限
    resp, err := client.CheckPermission(ctx, &v1.CheckPermissionRequest{
        Resource: &v1.ObjectReference{
            ObjectType: "document",
            ObjectId:   "doc123",
        },
        Permission: "view",
        Subject: &v1.SubjectReference{
            Object: &v1.ObjectReference{
                ObjectType: "user",
                ObjectId:   "user456",
            },
        },
    })

    if resp.Permissionship == v1.CheckPermissionResponse_PERMISSIONSHIP_HAS_PERMISSION {
        fmt.Println("Access granted!")
    }

    // 反向查询: 用户能访问哪些文档？
    stream, err := client.LookupResources(ctx, &v1.LookupResourcesRequest{
        ResourceObjectType: "document",
        Permission:         "view",
        Subject: &v1.SubjectReference{
            Object: &v1.ObjectReference{
                ObjectType: "user",
                ObjectId:   "user456",
            },
        },
    })
}
```

#### 优势

- ✅ 生产级稳定性
- ✅ 性能最佳（5ms P95）
- ✅ 支持复杂关系图
- ✅ 双向查询能力
- ✅ 完整的验证工具

#### 劣势

- ❌ 学习曲线较陡峭
- ❌ 需要额外部署服务
- ❌ Schema语言需要学习

---

### 2. Ory Keto ⭐️⭐️⭐️⭐️

**官网**: https://www.ory.sh/keto
**GitHub**: https://github.com/ory/keto (4.7k stars)
**授权**: Apache 2.0

#### 特点

- ✅ **一致性低延迟**: 专为高并发设计
- ✅ **REST + gRPC**: 双协议支持
- ✅ **云原生**: Kubernetes友好
- ✅ **Ory生态**: 与Ory Hydra, Kratos无缝集成

#### 权限模型示例

```json
{
  "namespace": "documents",
  "object": "doc123",
  "relation": "viewers",
  "subject_id": "user456"
}
```

#### REST API使用

```bash
# 创建关系
curl -X PUT http://localhost:4467/relation-tuples \
  -H "Content-Type: application/json" \
  -d '{
    "namespace": "documents",
    "object": "doc123",
    "relation": "owner",
    "subject_id": "user456"
  }'

# 检查权限
curl -X POST http://localhost:4466/check \
  -H "Content-Type: application/json" \
  -d '{
    "namespace": "documents",
    "object": "doc123",
    "relation": "viewer",
    "subject_id": "user789"
  }'
```

#### 优势

- ✅ REST API简单易用
- ✅ Ory生态集成
- ✅ 部署简单

#### 劣势

- ❌ 功能相对SpiceDB较少
- ❌ 文档不够完善
- ❌ 社区相对较小

---

### 3. OpenFGA ⭐️⭐️⭐️⭐️

**官网**: https://openfga.dev
**GitHub**: https://github.com/openfga/openfga (2.6k stars)
**授权**: Apache 2.0
**维护者**: Linux Foundation

#### 特点

- ✅ **Auth0背书**: 由Auth0团队开发
- ✅ **Linux基金会托管**: 开放治理
- ✅ **类型系统**: 强类型Schema
- ✅ **DSL支持**: 支持FGA DSL

#### Authorization Model示例

```
model
  schema 1.1

type user

type document
  relations
    define owner: [user]
    define editor: [user] or owner
    define viewer: [user] or editor
    define can_view: viewer
    define can_edit: editor
```

#### Go SDK使用

```go
import (
    openfga "github.com/openfga/go-sdk"
)

func main() {
    configuration := openfga.NewConfiguration()
    apiClient := openfga.NewAPIClient(configuration)

    // 检查权限
    body := openfga.CheckRequest{
        TupleKey: openfga.CheckRequestTupleKey{
            User:     openfga.PtrString("user:alice"),
            Relation: openfga.PtrString("viewer"),
            Object:   openfga.PtrString("document:budget"),
        },
    }

    data, response, err := apiClient.OpenFgaApi.Check(ctx).Body(body).Execute()
}
```

---

### 4. Permify ⭐️⭐️⭐️⭐️ (现已被FusionAuth收购)

**官网**: https://permify.co
**GitHub**: https://github.com/Permify/permify (4.5k stars)
**授权**: Apache 2.0

#### 特点

- ✅ **易用性强**: 最友好的Zanzibar实现
- ✅ **多模型支持**: RBAC + ABAC + ReBAC
- ✅ **可视化工具**: Schema可视化编辑器
- ✅ **现已被FusionAuth收购**: 商业支持更强

#### Schema示例

```permify
entity user {}

entity organization {
    relation admin @user
    relation member @user

    action create_repository = admin or member
    action delete_repository = admin
}

entity repository {
    relation owner @user
    relation organization @organization
    relation contributor @user

    action push = owner or contributor
    action delete = owner or organization.admin
}
```

---

## 策略引擎类

### 1. Open Policy Agent (OPA) ⭐️⭐️⭐️⭐️⭐️

**官网**: https://www.openpolicyagent.org
**GitHub**: https://github.com/open-policy-agent/opa (9.4k stars)
**授权**: Apache 2.0
**维护者**: CNCF (毕业项目)

#### 特点

- ✅ **CNCF毕业项目**: 云原生标准
- ✅ **通用策略引擎**: 不限于授权，可用于合规、审计等
- ✅ **Rego语言**: 声明式策略语言
- ✅ **广泛集成**: Kubernetes、Envoy、Terraform等
- ✅ **可嵌入**: 可作为库或sidecar部署

#### Rego策略示例

```rego
package authz

import future.keywords.if
import future.keywords.in

# 默认拒绝
default allow := false

# 资源所有者可以执行任何操作
allow if {
    input.user == data.resources[input.resource].owner
}

# 管理员可以执行任何操作
allow if {
    "admin" in data.users[input.user].roles
}

# 编辑权限
allow if {
    input.action == "edit"
    input.user in data.resources[input.resource].editors
}

# ABAC策略: 根据时间、位置等
allow if {
    input.action == "view"
    input.time >= data.resources[input.resource].available_from
    input.time <= data.resources[input.resource].available_until
    input.ip in data.allowed_ip_ranges
}
```

#### 使用示例 (Go)

```go
package main

import (
    "github.com/open-policy-agent/opa/rego"
)

func checkPermission(user, resource, action string) (bool, error) {
    ctx := context.Background()

    query, err := rego.New(
        rego.Query("data.authz.allow"),
        rego.Load([]string{"policy.rego"}, nil),
    ).PrepareForEval(ctx)

    input := map[string]interface{}{
        "user":     user,
        "resource": resource,
        "action":   action,
    }

    results, err := query.Eval(ctx, rego.EvalInput(input))

    if len(results) > 0 && results[0].Expressions[0].Value == true {
        return true, nil
    }

    return false, nil
}
```

#### REST API使用

```bash
# 启动OPA服务器
opa run --server policy.rego

# 检查权限
curl -X POST http://localhost:8181/v1/data/authz/allow \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "user": "alice",
      "resource": "document123",
      "action": "edit"
    }
  }'
```

#### 优势

- ✅ 极其灵活，适用于各种场景
- ✅ CNCF项目，社区活跃
- ✅ 丰富的工具链（测试、性能分析）
- ✅ 可以做策略即代码 (Policy as Code)

#### 劣势

- ❌ Rego语言学习曲线
- ❌ 不专注于权限，需要自己设计数据模型
- ❌ 性能依赖于策略复杂度

---

### 2. Casbin ⭐️⭐️⭐️⭐️

**官网**: https://casbin.org
**GitHub**: https://github.com/casbin/casbin (17.3k stars)
**授权**: Apache 2.0

#### 特点

- ✅ **多语言支持**: Go, Java, Python, PHP, Node.js等40+
- ✅ **多模型支持**: ACL, RBAC, ABAC, RESTful, Deny-override等
- ✅ **轻量级**: 可直接嵌入应用
- ✅ **适配器丰富**: 支持MySQL, PostgreSQL, Redis等多种存储

#### 模型配置 (PERM metamodel)

```ini
# model.conf
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && r.obj == p.obj && r.act == p.act
```

#### 策略文件

```csv
# policy.csv
p, alice, data1, read
p, bob, data2, write
p, data_group_admin, data_group, write

g, alice, data_group_admin
```

#### 使用示例 (Go)

```go
package main

import (
    "github.com/casbin/casbin/v2"
)

func main() {
    // 加载模型和策略
    e, err := casbin.NewEnforcer("model.conf", "policy.csv")
    if err != nil {
        log.Fatal(err)
    }

    // 检查权限
    ok, err := e.Enforce("alice", "data1", "read")
    if ok {
        fmt.Println("Alice can read data1")
    } else {
        fmt.Println("Access denied")
    }

    // 动态添加策略
    e.AddPolicy("bob", "data3", "write")

    // 使用适配器持久化
    adapter, _ := xormadapter.NewAdapter("mysql", "root:@tcp(127.0.0.1:3306)/casbin")
    e, _ = casbin.NewEnforcer("model.conf", adapter)
    e.LoadPolicy()
}
```

#### Java Spring Boot集成

```java
@Configuration
public class CasbinConfig {
    @Bean
    public Enforcer enforcer() {
        Enforcer enforcer = new Enforcer("model.conf", "policy.csv");
        return enforcer;
    }
}

@RestController
public class AuthController {
    @Autowired
    private Enforcer enforcer;

    @GetMapping("/checkPermission")
    public boolean checkPermission(
            @RequestParam String user,
            @RequestParam String resource,
            @RequestParam String action) {
        return enforcer.enforce(user, resource, action);
    }
}
```

#### 优势

- ✅ 简单易用，学习曲线平缓
- ✅ 多语言支持最广泛
- ✅ 可直接嵌入应用
- ✅ 丰富的适配器和中间件

#### 劣势

- ❌ 不适合超大规模部署
- ❌ 不支持复杂的关系图查询
- ❌ 集中式部署相对困难

---

### 3. Cerbos ⭐️⭐️⭐️⭐️

**官网**: https://cerbos.dev
**GitHub**: https://github.com/cerbos/cerbos (2.8k stars)
**授权**: Apache 2.0

#### 特点

- ✅ **企业级**: 专为企业应用设计
- ✅ **YAML策略**: 易读易写
- ✅ **零信任集成**: 内置零信任支持
- ✅ **Git集成**: 策略可存储在Git

#### 策略示例 (YAML)

```yaml
# resource_policy.yaml
apiVersion: api.cerbos.dev/v1
resourcePolicy:
  version: "default"
  resource: "document"
  rules:
    - actions: ["view", "edit"]
      effect: EFFECT_ALLOW
      roles:
        - owner

    - actions: ["view"]
      effect: EFFECT_ALLOW
      roles:
        - viewer
      condition:
        match:
          expr: >
            request.resource.attr.published == true

    - actions: ["delete"]
      effect: EFFECT_ALLOW
      roles:
        - admin
      condition:
        match:
          expr: >
            request.resource.attr.status == "draft"
```

#### 使用示例 (Go)

```go
import (
    "github.com/cerbos/cerbos/client"
)

func main() {
    c, err := client.New("localhost:3593", client.WithPlaintext())

    principal := client.NewPrincipal("user123").
        WithRoles("viewer").
        WithAttr("department", "engineering")

    resource := client.NewResource("document", "doc456").
        WithAttr("owner", "user123").
        WithAttr("published", true)

    // 检查单个权限
    ok, err := c.IsAllowed(
        ctx,
        principal,
        resource,
        "view",
    )

    // 批量检查
    batch := client.NewCheckResourcesRequest().
        WithPrincipal(principal).
        WithResourceKind("document").
        WithActions("view", "edit", "delete")

    resp, err := c.CheckResources(ctx, batch)
}
```

---

## IAM平台类

### 1. Keycloak ⭐️⭐️⭐️⭐️⭐️

**官网**: https://www.keycloak.org
**GitHub**: https://github.com/keycloak/keycloak (22k stars)
**授权**: Apache 2.0
**维护者**: Red Hat

#### 特点

- ✅ **功能最全面**: SSO + 用户管理 + 权限管理
- ✅ **协议支持**: OAuth2, OIDC, SAML
- ✅ **企业级**: 生产验证，大规模使用
- ✅ **可扩展**: 丰富的SPI

#### Authorization Services (细粒度权限)

Keycloak支持UMA 2.0 (User-Managed Access)，可以实现资源级别的权限控制。

**资源定义**:

```json
{
  "name": "Document 123",
  "type": "document",
  "owner": "alice",
  "ownerManagedAccess": true,
  "attributes": {
    "department": ["engineering"],
    "classification": ["confidential"]
  },
  "scopes": ["view", "edit", "delete"]
}
```

**权限策略**:

```javascript
// JavaScript策略
var context = $evaluation.getContext();
var resource = context.getResource();

if (resource.owner == $evaluation.getContext().getIdentity().getId()) {
    $evaluation.grant();
}

var attributes = resource.getAttributes();
if (attributes.get('department').contains($evaluation.getContext().getIdentity().getAttribute('department'))) {
    $evaluation.grant();
}
```

#### Spring Boot集成

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig extends KeycloakWebSecurityConfigurerAdapter {

    @Override
    protected void configure(HttpSecurity http) throws Exception {
        super.configure(http);
        http.authorizeRequests()
            .antMatchers("/documents/**").hasRole("USER")
            .anyRequest().authenticated();
    }

    @Bean
    @Override
    protected SessionAuthenticationStrategy sessionAuthenticationStrategy() {
        return new RegisterSessionAuthenticationStrategy(
            new SessionRegistryImpl());
    }
}

@RestController
public class DocumentController {

    @GetMapping("/documents/{id}")
    @PreAuthorize("hasPermission(#id, 'document', 'view')")
    public Document getDocument(@PathVariable String id) {
        return documentService.findById(id);
    }
}
```

#### 优势

- ✅ 开箱即用的完整IAM解决方案
- ✅ 强大的用户界面
- ✅ 企业级稳定性
- ✅ 活跃的社区

#### 劣势

- ❌ 资源占用较大
- ❌ 配置复杂
- ❌ 授权服务相对较重

---

### 2. Zitadel ⭐️⭐️⭐️⭐️

**官网**: https://zitadel.com
**GitHub**: https://github.com/zitadel/zitadel (8.1k stars)
**授权**: Apache 2.0

#### 特点

- ✅ **现代化**: Go编写，云原生
- ✅ **多租户**: 原生支持多租户
- ✅ **RBAC集成**: 内置RBAC
- ✅ **性能好**: 比Keycloak轻量

---

## 详细对比表

### 功能对比

| 特性 | SpiceDB | OPA | Casbin | Keycloak | Permify |
|------|---------|-----|--------|----------|---------|
| **关系型权限** | ✅ 最强 | ❌ 需自建 | ⚠️ 基础 | ⚠️ 基础 | ✅ 强 |
| **策略引擎** | ⚠️ 基础 | ✅ 最强 | ✅ 强 | ✅ 强 | ✅ 强 |
| **反向查询** | ✅ 原生 | ❌ 需自建 | ❌ | ❌ | ✅ 支持 |
| **性能** | ✅ 5ms P95 | ✅ 优秀 | ✅ 优秀 | ⚠️ 中等 | ✅ 优秀 |
| **水平扩展** | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| **多租户** | ✅ | 需自建 | 需自建 | ✅ | ✅ |
| **用户管理** | ❌ | ❌ | ❌ | ✅ 完整 | ❌ |
| **SSO** | ❌ | ❌ | ❌ | ✅ 完整 | ❌ |
| **学习曲线** | 陡 | 陡 | 平缓 | 中等 | 平缓 |
| **部署复杂度** | 中 | 低 | 低 | 高 | 低 |

### 性能对比

| 系统 | P50延迟 | P95延迟 | P99延迟 | 吞吐量 |
|------|---------|---------|---------|--------|
| **SpiceDB** | <1ms | ~5ms | ~10ms | 100k+ QPS |
| **OPA** | <1ms | ~3ms | ~8ms | 50k+ QPS |
| **Casbin** | <0.1ms | <1ms | <2ms | 100k+ QPS (内存) |
| **Keycloak** | ~10ms | ~50ms | ~100ms | 5k+ QPS |
| **Permify** | <1ms | ~5ms | ~10ms | 50k+ QPS |

### 适用场景对比

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| **大规模社交网络** | SpiceDB / OpenFGA | 需要处理复杂关系图 |
| **企业SaaS (多租户)** | Permify / Keycloak | 多租户支持，易集成 |
| **微服务架构** | OPA / Cerbos | 轻量级，可作为sidecar |
| **简单RBAC** | Casbin | 简单易用，快速集成 |
| **需要SSO的企业应用** | Keycloak | 完整IAM解决方案 |
| **Kubernetes资源权限** | OPA (Gatekeeper) | K8s原生集成 |
| **文档协作系统** | SpiceDB / Permify | 支持资源继承 |
| **API网关授权** | OPA / Casbin | 性能好，灵活 |

---

## 选型建议

### 决策树

```
是否需要用户管理和SSO？
├─ 是 → Keycloak (完整IAM)
└─ 否 → 是否需要复杂关系图查询？
    ├─ 是 → 是否需要反向查询？
    │   ├─ 是 → SpiceDB (最成熟)
    │   └─ 否 → OpenFGA / Permify
    └─ 否 → 是否需要极致灵活性？
        ├─ 是 → OPA (通用策略引擎)
        └─ 否 → 是否追求简单？
            ├─ 是 → Casbin (轻量级)
            └─ 否 → Cerbos (企业级)
```

### 具体推荐

#### 1️⃣ 如果你需要完整的IAM解决方案
**推荐: Keycloak**

理由:
- 包含用户管理、SSO、授权
- 开箱即用
- 企业级稳定

#### 2️⃣ 如果你需要高性能的细粒度权限
**推荐: SpiceDB**

理由:
- 性能最强 (5ms P95)
- 支持复杂关系
- 支持反向查询
- 生产就绪

#### 3️⃣ 如果你需要嵌入式的简单RBAC
**推荐: Casbin**

理由:
- 学习曲线平缓
- 多语言支持
- 直接嵌入应用

#### 4️⃣ 如果你需要通用策略引擎
**推荐: OPA**

理由:
- CNCF毕业项目
- 极其灵活
- 可用于授权、合规等多种场景

#### 5️⃣ 如果你需要易用的Zanzibar实现
**推荐: Permify**

理由:
- 最友好的Zanzibar实现
- 可视化工具
- 现有商业支持

---

## 集成示例

### 方案1: Keycloak (认证) + SpiceDB (授权)

这是最强大的组合，适合大型企业应用。

```
┌─────────┐
│  User   │
└────┬────┘
     │ 1. Login
┌────▼─────────┐
│  Keycloak    │ ← 用户管理、SSO、JWT签发
└────┬─────────┘
     │ 2. JWT Token
┌────▼─────────┐
│ Application  │
└────┬─────────┘
     │ 3. CheckPermission (user from JWT)
┌────▼─────────┐
│   SpiceDB    │ ← 细粒度权限检查
└──────────────┘
```

**Spring Boot集成代码**:

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtConverter()))
            )
            .authorizeHttpRequests(auth -> auth
                .anyRequest().authenticated()
            );
        return http.build();
    }
}

@Service
public class PermissionService {

    private final SpiceDBClient spiceDB;

    public boolean checkPermission(String userId, String resourceId, String permission) {
        CheckPermissionRequest request = CheckPermissionRequest.newBuilder()
            .setResource(ObjectReference.newBuilder()
                .setObjectType("document")
                .setObjectId(resourceId)
                .build())
            .setPermission(permission)
            .setSubject(SubjectReference.newBuilder()
                .setObject(ObjectReference.newBuilder()
                    .setObjectType("user")
                    .setObjectId(userId)
                    .build())
                .build())
            .build();

        CheckPermissionResponse response = spiceDB.checkPermission(request);
        return response.getPermissionship() == Permissionship.HAS_PERMISSION;
    }
}

@RestController
public class DocumentController {

    @Autowired
    private PermissionService permissionService;

    @GetMapping("/documents/{id}")
    public ResponseEntity<Document> getDocument(
            @PathVariable String id,
            @AuthenticationPrincipal Jwt jwt) {

        String userId = jwt.getSubject();

        // 使用SpiceDB检查权限
        if (!permissionService.checkPermission(userId, id, "view")) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        return ResponseEntity.ok(documentService.findById(id));
    }
}
```

### 方案2: Casbin (嵌入式简单方案)

适合中小型应用，简单快速。

```java
@Configuration
public class CasbinConfig {

    @Bean
    public Enforcer enforcer() {
        JdbcAdapter adapter = new JdbcAdapter(dataSource);
        Enforcer enforcer = new Enforcer("classpath:casbin/model.conf", adapter);
        enforcer.loadPolicy();
        return enforcer;
    }
}

@Component
@Aspect
public class PermissionAspect {

    @Autowired
    private Enforcer enforcer;

    @Around("@annotation(requiresPermission)")
    public Object checkPermission(ProceedingJoinPoint joinPoint,
                                 RequiresPermission requiresPermission) throws Throwable {
        String user = SecurityContextHolder.getContext()
            .getAuthentication().getName();
        String resource = requiresPermission.resource();
        String action = requiresPermission.action();

        if (enforcer.enforce(user, resource, action)) {
            return joinPoint.proceed();
        }

        throw new AccessDeniedException("Permission denied");
    }
}

@RestController
public class DocumentController {

    @GetMapping("/documents/{id}")
    @RequiresPermission(resource = "document", action = "read")
    public Document getDocument(@PathVariable String id) {
        return documentService.findById(id);
    }
}
```

### 方案3: OPA (Sidecar模式)

适合微服务架构。

```yaml
# Kubernetes Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: document-service
spec:
  template:
    spec:
      containers:
        # 应用容器
        - name: app
          image: document-service:latest
          env:
            - name: OPA_URL
              value: "http://localhost:8181"

        # OPA Sidecar
        - name: opa
          image: openpolicyagent/opa:latest
          args:
            - "run"
            - "--server"
            - "--config-file=/config/config.yaml"
          volumeMounts:
            - name: policy
              mountPath: /policy
      volumes:
        - name: policy
          configMap:
            name: opa-policy
```

**应用代码**:

```java
@Service
public class OPAPermissionService {

    private final RestTemplate restTemplate;

    public boolean checkPermission(String user, String resource, String action) {
        Map<String, Object> input = Map.of(
            "user", user,
            "resource", resource,
            "action", action
        );

        Map<String, Object> request = Map.of("input", input);

        ResponseEntity<Map> response = restTemplate.postForEntity(
            "http://localhost:8181/v1/data/authz/allow",
            request,
            Map.class
        );

        return (Boolean) response.getBody().get("result");
    }
}
```

---

## 总结

### 快速选择指南

| 你的需求 | 推荐方案 | 上手难度 |
|---------|---------|----------|
| 我需要最简单的RBAC | **Casbin** | ⭐️ 简单 |
| 我需要完整的用户系统 | **Keycloak** | ⭐️⭐️ 中等 |
| 我需要高性能细粒度权限 | **SpiceDB** | ⭐️⭐️⭐️ 较难 |
| 我需要通用策略引擎 | **OPA** | ⭐️⭐️⭐️ 较难 |
| 我需要易用的Zanzibar | **Permify** | ⭐️⭐️ 中等 |

### 组合方案推荐

#### 🏆 最佳生产组合
**Keycloak (认证) + SpiceDB (授权)**
- 优势: 功能最全，性能最好
- 劣势: 复杂度高，运维成本高

#### 🥈 平衡方案
**Keycloak (认证+基础授权) + Casbin (细粒度授权)**
- 优势: 易集成，上手快
- 劣势: Casbin不适合超大规模

#### 🥉 轻量级方案
**Casbin 单独使用**
- 优势: 最简单，可嵌入
- 劣势: 功能有限

#### 🎯 云原生方案
**OPA (Sidecar模式)**
- 优势: Kubernetes友好，灵活
- 劣势: 需要自己设计数据模型

---

## 参考资源

- **SpiceDB文档**: https://authzed.com/docs
- **OPA文档**: https://www.openpolicyagent.org/docs
- **Casbin文档**: https://casbin.org/docs
- **Keycloak文档**: https://www.keycloak.org/documentation
- **Permify文档**: https://docs.permify.co
- **Zanzibar论文**: https://research.google/pubs/pub48190/
- **对比网站**: https://awesome-zanzibar.cerberauth.com/

---

**最后更新**: 2024-12-28
**作者**: Permission System Research Team
