# Keycloak集成对比：SpiceDB vs OpenFGA vs Permify

## 集成复杂度对比

### 1. OpenFGA + Keycloak

**集成方式**：
```
Keycloak → Event → keycloak-openfga-event-publisher → OpenFGA
```

**优点**：
- ✅ 有现成的开源扩展
- ✅ 事件驱动，解耦

**缺点**：
- ❌ 需要部署Keycloak扩展JAR
- ❌ Event可能丢失
- ❌ 配置复杂
- ❌ 双写一致性问题

**复杂度**: ⭐️⭐️⭐️⭐️ (4/5 - 较复杂)

---

### 2. SpiceDB + Keycloak ✅ **最简单！**

**集成方式**：
```
Keycloak (认证) → JWT → Spring Boot → SpiceDB (授权)
```

**根本不需要同步！** 🎉

**为什么？**
SpiceDB可以**直接使用Keycloak的用户ID**！

```java
@PostMapping("/documents")
public Document createDocument(
        @RequestBody CreateDTO dto,
        @AuthenticationPrincipal Jwt jwt) {

    String userId = jwt.getSubject();  // 来自Keycloak JWT
    String tenantId = jwt.getClaimAsString("tenant");

    // 1. 创建文档
    Document doc = documentRepo.save(new Document(dto));

    // 2. 直接写入SpiceDB（使用Keycloak的user_id）
    spiceDB.writeRelationship(
        SubjectReference.newBuilder()
            .setObject(ObjectReference.newBuilder()
                .setObjectType("user")
                .setObjectId(userId)  // ← Keycloak的user_id
                .build())
            .build(),
        "owner",
        ObjectReference.newBuilder()
            .setObjectType("document")
            .setObjectId(doc.getId())
            .build()
    );

    return doc;
}
```

**SpiceDB Schema**：
```zed
// 不需要存储用户信息！只需要定义类型
definition user {}

definition document {
    relation owner: user
    permission edit = owner
}
```

**关键理解**：
- ✅ SpiceDB只存储**关系**（user:123 owns document:456）
- ✅ 不需要存储用户的详细信息
- ✅ 用户信息在Keycloak，SpiceDB只用user_id
- ✅ **零同步！**

**完整流程**：
```
1. 用户登录Keycloak → 获得JWT (subject: "user-123")
2. 访问API → Spring Boot提取JWT中的user_id
3. 检查权限 → SpiceDB.Check(user:user-123, edit, document:doc1)
4. SpiceDB查关系图 → 返回允许/拒绝
```

**复杂度**: ⭐️⭐️ (2/5 - 很简单)

---

### 3. Permify + Keycloak ✅ **也很简单！**

**集成方式**：和SpiceDB一样，**零同步**！

```java
@Service
public class PermifyService {
    private final RestTemplate rest;

    public boolean checkPermission(String userId, String resourceId, String permission) {
        // 直接使用Keycloak的user_id
        Map<String, Object> request = Map.of(
            "entity", Map.of("type", "document", "id", resourceId),
            "permission", permission,
            "subject", Map.of("type", "user", "id", userId)  // ← Keycloak user_id
        );

        ResponseEntity<Map> resp = rest.postForEntity(
            "http://permify:3476/v1/tenants/t1/permissions/check",
            request, Map.class);

        return (Boolean) resp.getBody().get("can");
    }
}
```

**Permify额外优势**：原生多租户！

```bash
# 不同租户的权限隔离
POST /v1/tenants/acme/permissions/check
POST /v1/tenants/globex/permissions/check
```

**复杂度**: ⭐️⭐️ (2/5 - 很简单)

---

## 为什么OpenFGA需要同步而SpiceDB/Permify不需要？

### 误解：我之前理解错了！

**实际上，三者都不需要同步用户详细信息！**

让我重新调研OpenFGA...

### OpenFGA也可以零同步！🎉

```java
// OpenFGA也可以直接用Keycloak user_id！
@PostMapping("/documents")
public Document create(@RequestBody CreateDTO dto,
                      @AuthenticationPrincipal Jwt jwt) {

    String userId = jwt.getSubject();  // Keycloak user_id
    Document doc = documentRepo.save(new Document(dto));

    // 直接写入关系，不需要先"创建用户"
    openFGA.write(new TupleKey()
        .user("user:" + userId)  // ← Keycloak user_id
        .relation("owner")
        ._object("document:" + doc.getId())
    );

    return doc;
}
```

**那keycloak-openfga-event-publisher是做什么的？**

它是用来同步**组和租户的成员关系**，不是必需的！

```
有扩展:
  Keycloak添加alice到engineering组
    ↓ 自动同步
  OpenFGA: user:alice, member, group:engineering

无扩展:
  手动在代码里写:
  openFGA.write(user:alice, member, group:engineering)
```

---

## 最简单的方案对比

### 方案A: 完全手动（最简单）⭐️⭐️⭐️⭐️⭐️

```java
// 不用任何同步扩展
@Service
public class UserService {

    // 用户加入组
    public void addUserToGroup(String userId, String groupId) {
        // 1. Keycloak API
        keycloakAdmin.addUserToGroup(userId, groupId);

        // 2. OpenFGA/SpiceDB/Permify API
        authzService.writeRelationship(
            "user:" + userId,
            "member",
            "group:" + groupId
        );
    }
}
```

**优点**：
- ✅ 最简单，完全掌控
- ✅ 不需要部署扩展
- ✅ 失败了可以立即处理

**缺点**：
- ❌ 需要在每个操作点都双写
- ❌ 如果忘记写某个地方会不一致

### 方案B: 只同步组/租户关系（推荐）⭐️⭐️⭐️⭐️

```java
// Keycloak管理组/租户
// 通过扩展自动同步到OpenFGA

// 应用代码只需要写资源权限
@PostMapping("/documents")
public Document create(...) {
    // 只写文档所有者，组关系已经自动同步了
    authzService.writeRelationship(
        "user:" + userId, "owner", "document:" + docId);
}
```

### 方案C: 完全不用Keycloak管理组（最灵活）⭐️⭐️⭐️⭐️⭐️

```java
// Keycloak只做认证
// 组、租户、权限全在OpenFGA管理

// 自己的管理API
@PostMapping("/admin/groups/{groupId}/members")
public void addMember(@PathVariable String groupId,
                     @RequestBody String userId) {
    // 直接写OpenFGA，不走Keycloak
    openFGA.writeRelationship(
        "user:" + userId,
        "member",
        "group:" + groupId
    );
}
```

---

## 推荐方案排序

### 🥇 第一推荐：SpiceDB + 方案C

**理由**：
- ✅ SpiceDB性能最好
- ✅ Keycloak只做认证（最简单）
- ✅ 组和权限完全自己管理（最灵活）
- ✅ 不需要任何同步

**架构**：
```
Keycloak: 用户登录 → JWT
Spring Boot: 用户/组/权限管理API
SpiceDB: 存储所有关系
PostgreSQL: 业务数据
```

### 🥈 第二推荐：Permify + 方案C

**理由**：
- ✅ REST API最简单
- ✅ 原生多租户
- ✅ 可视化工具好用
- ✅ 不需要同步

### 🥉 第三推荐：OpenFGA + 方案C

**理由**：
- ✅ Linux Foundation背书
- ✅ 不需要同步
- ✅ REST API简单

---

## 完整示例（最简单方案）

### Docker Compose

```yaml
version: '3.8'

services:
  # 认证
  keycloak:
    image: quay.io/keycloak/keycloak:23.0
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    ports:
      - "8080:8080"
    command: start-dev

  # 授权 (三选一)
  spicedb:
    image: authzed/spicedb:latest
    command: serve --grpc-preshared-key "secret"
    environment:
      SPICEDB_DATASTORE_ENGINE: postgres
      SPICEDB_DATASTORE_CONN_URI: "postgres://user:pass@postgres/spicedb"
    ports:
      - "50051:50051"

  # 数据库
  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  # 应用
  app:
    build: .
    environment:
      KEYCLOAK_URL: http://keycloak:8080
      SPICEDB_URL: localhost:50051
    ports:
      - "3000:3000"
```

### Spring Boot代码（完整流程）

```java
@RestController
@RequestMapping("/api")
public class DocumentController {

    @Autowired
    private DocumentRepository docRepo;

    @Autowired
    private SpiceDBService spiceDB;

    // 1. 列表（反向查询）
    @GetMapping("/documents")
    public List<Document> list(@AuthenticationPrincipal Jwt jwt) {
        String userId = jwt.getSubject();

        // 查询用户能访问的文档ID
        List<String> ids = spiceDB.lookupResources(userId, "document", "view");

        return docRepo.findByIdIn(ids);
    }

    // 2. 查看（正向检查）
    @GetMapping("/documents/{id}")
    public Document get(@PathVariable String id,
                       @AuthenticationPrincipal Jwt jwt) {
        String userId = jwt.getSubject();

        // 检查权限
        if (!spiceDB.check(userId, id, "view")) {
            throw new AccessDeniedException("No permission");
        }

        return docRepo.findById(id).orElseThrow();
    }

    // 3. 创建（写入关系）
    @PostMapping("/documents")
    public Document create(@RequestBody CreateDocDTO dto,
                          @AuthenticationPrincipal Jwt jwt) {
        String userId = jwt.getSubject();

        // 保存文档
        Document doc = docRepo.save(new Document(dto));

        // 写入所有者关系
        spiceDB.writeRelationship(
            "user:" + userId,
            "owner",
            "document:" + doc.getId()
        );

        return doc;
    }

    // 4. 分享给组（写入组关系）
    @PostMapping("/documents/{id}/share")
    public void share(@PathVariable String id,
                     @RequestBody ShareDTO dto,
                     @AuthenticationPrincipal Jwt jwt) {
        String userId = jwt.getSubject();

        // 检查是否是所有者
        if (!spiceDB.check(userId, id, "owner")) {
            throw new AccessDeniedException("Only owner can share");
        }

        // 写入组查看权限
        spiceDB.writeRelationship(
            "group:" + dto.getGroupId(),
            "viewer",
            "document:" + id
        );
    }
}
```

**关键点**：
- ✅ 不需要同步用户
- ✅ 不需要同步组（组信息也在SpiceDB）
- ✅ 一切都是按需写入关系
- ✅ Keycloak只负责认证

---

## 总结

### 你的担心是对的！

- ❌ Event同步确实麻烦
- ❌ 双写一致性是个问题

### 但好消息是！

- ✅ **根本不需要同步！**
- ✅ 三个方案（SpiceDB/OpenFGA/Permify）都可以直接用Keycloak的user_id
- ✅ 只需要在代码里按需写入关系

### 最简单的架构

```
Keycloak: 只做认证
Spring Boot: 管理用户/组/权限
SpiceDB/OpenFGA/Permify: 存储关系
```

不需要任何同步扩展！🎉
