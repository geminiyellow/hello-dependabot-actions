# 三中心架构设计：AAC + IMC + PMC

企业级权限管理系统的清晰职责划分

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                      完整系统架构                                │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   Browser    │
└──────┬───────┘
       │ 1. Login
       ▼
┌────────────────────────────────────────────────────────────────┐
│                AAC (Account Authentication Center)             │
│                     基于 Keycloak                              │
├────────────────────────────────────────────────────────────────┤
│  职责:                                                         │
│  ✅ 用户认证 (登录/登出)                                        │
│  ✅ 密码管理 (重置/修改)                                        │
│  ✅ MFA (多因素认证)                                           │
│  ✅ SSO (单点登录)                                             │
│  ✅ OAuth2/OIDC协议                                            │
│  ✅ JWT签发                                                    │
│                                                                 │
│  输出: JWT Token                                               │
│  {                                                              │
│    "sub": "user-uuid-123",          ← 用户唯一标识             │
│    "email": "alice@acme.com",                                  │
│    "exp": 1234567890                                           │
│  }                                                              │
│                                                                 │
│  存储: Keycloak自己的数据库                                     │
│  • 用户凭证 (密码hash)                                         │
│  • 会话信息                                                    │
│  • OAuth2 tokens                                               │
└────────────────────────────────────────────────────────────────┘
       │
       │ 2. JWT Token
       ▼
┌────────────────────────────────────────────────────────────────┐
│               IMC (Identity Management Center)                 │
│                     自研微服务                                  │
├────────────────────────────────────────────────────────────────┤
│  职责:                                                         │
│  ✅ 租户管理 (Tenant CRUD)                                     │
│  ✅ 组织架构 (Organization hierarchy)                          │
│  ✅ 部门/组管理 (Department/Group CRUD)                        │
│  ✅ 用户档案管理 (User profiles)                               │
│  ✅ 用户-组关系 (User-Group membership)                        │
│  ✅ 用户属性 (Department, Title, Manager等)                    │
│                                                                 │
│  数据模型:                                                      │
│  ┌─────────────┐                                               │
│  │   Tenant    │                                               │
│  │ • id        │                                               │
│  │ • name      │                                               │
│  │ • domain    │                                               │
│  └─────┬───────┘                                               │
│        │ 1:N                                                   │
│  ┌─────▼───────┐                                               │
│  │  Group      │                                               │
│  │ • id        │                                               │
│  │ • name      │                                               │
│  │ • parent_id │ (树形结构)                                    │
│  │ • tenant_id │                                               │
│  └─────┬───────┘                                               │
│        │ N:M                                                   │
│  ┌─────▼───────┐                                               │
│  │    User     │                                               │
│  │ • id        │ ← 与AAC的user_id一致                          │
│  │ • email     │                                               │
│  │ • name      │                                               │
│  │ • dept      │                                               │
│  │ • tenant_id │                                               │
│  └─────────────┘                                               │
│                                                                 │
│  存储: PostgreSQL (业务数据库)                                  │
│                                                                 │
│  API:                                                           │
│  GET  /api/v1/tenants                                          │
│  GET  /api/v1/tenants/{id}/groups                              │
│  GET  /api/v1/groups/{id}/users                                │
│  GET  /api/v1/users/{id}/groups                                │
│  POST /api/v1/groups/{id}/members                              │
└────────────────────────────────────────────────────────────────┘
       │
       │ 3. 拉取租户/组/用户信息
       ▼
┌────────────────────────────────────────────────────────────────┐
│              PMC (Permission Management Center)                │
│              基于 SpiceDB/OpenFGA/Permify                      │
├────────────────────────────────────────────────────────────────┤
│  职责:                                                         │
│  ✅ 资源权限管理 (document, project, file等)                   │
│  ✅ 权限检查 (Check)                                           │
│  ✅ 反向查询 (ListObjects)                                     │
│  ✅ 细粒度授权 (owner, editor, viewer)                         │
│  ✅ 条件权限 (时间、IP、属性)                                   │
│  ✅ 权限继承 (租户→组→用户→资源)                               │
│                                                                 │
│  数据模型 (关系图):                                             │
│  ┌─────────────────────────────────────────────────┐          │
│  │  user:uuid-123  ──member──▶  tenant:acme       │          │
│  │  user:uuid-123  ──member──▶  group:engineering │          │
│  │  user:uuid-123  ──owner───▶  document:doc1     │          │
│  │  group:eng      ──viewer──▶  document:doc2     │          │
│  │  document:doc1  ──tenant──▶  tenant:acme       │          │
│  └─────────────────────────────────────────────────┘          │
│                                                                 │
│  存储: SpiceDB自己的数据库 (关系tuples)                         │
│                                                                 │
│  API:                                                           │
│  POST /v1/permissions/check                                    │
│  POST /v1/permissions/list-objects                             │
│  POST /v1/relationships/write                                  │
└────────────────────────────────────────────────────────────────┘
       │
       │ 4. 权限决策
       ▼
┌────────────────────────────────────────────────────────────────┐
│                   业务应用层                                    │
│  • 文档管理系统                                                 │
│  • 项目管理系统                                                 │
│  • 等等...                                                      │
└────────────────────────────────────────────────────────────────┘
```

---

## 职责划分矩阵

| 功能 | AAC (Keycloak) | IMC (自研) | PMC (SpiceDB) |
|------|---------------|-----------|---------------|
| **用户登录** | ✅ 主责 | ❌ | ❌ |
| **密码管理** | ✅ 主责 | ❌ | ❌ |
| **MFA** | ✅ 主责 | ❌ | ❌ |
| **SSO** | ✅ 主责 | ❌ | ❌ |
| **用户档案** | ⚠️ 基础信息 | ✅ 主责 | ❌ |
| **租户管理** | ❌ | ✅ 主责 | ⚠️ 引用 |
| **组织架构** | ❌ | ✅ 主责 | ⚠️ 引用 |
| **部门/组** | ❌ | ✅ 主责 | ⚠️ 引用 |
| **用户-组关系** | ❌ | ✅ 主责 | ⚠️ 同步/引用 |
| **资源权限** | ❌ | ❌ | ✅ 主责 |
| **权限检查** | ❌ | ❌ | ✅ 主责 |
| **反向查询** | ❌ | ❌ | ✅ 主责 |

---

## 数据流和协作关系

### 场景1: 用户登录

```
1. 用户访问系统
   ↓
2. 重定向到AAC (Keycloak)
   ↓
3. 输入用户名/密码
   ↓
4. AAC验证凭证 ✅
   ↓
5. 签发JWT
   {
     "sub": "user-uuid-123",
     "email": "alice@acme.com"
   }
   ↓
6. 重定向回应用，携带JWT
```

### 场景2: 查看用户信息

```
1. 前端调用 GET /api/v1/users/me
   Header: Authorization: Bearer <JWT>
   ↓
2. 后端验证JWT (AAC签发的)
   ↓
3. 提取user_id = "user-uuid-123"
   ↓
4. 调用IMC: GET /api/v1/users/user-uuid-123
   ↓
5. IMC返回:
   {
     "id": "user-uuid-123",
     "name": "Alice",
     "email": "alice@acme.com",
     "tenant": {"id": "tenant-1", "name": "ACME Corp"},
     "groups": [
       {"id": "group-1", "name": "Engineering"},
       {"id": "group-2", "name": "Frontend Team"}
     ],
     "department": "Engineering",
     "title": "Senior Engineer"
   }
   ↓
6. 返回给前端
```

### 场景3: 创建文档（关键流程）

```
1. 用户创建文档
   POST /api/v1/documents
   Header: Authorization: Bearer <JWT>
   Body: { "title": "Q1 Report", "content": "..." }
   ↓
2. 后端验证JWT，提取user_id = "user-uuid-123"
   ↓
3. 从IMC获取用户信息
   GET IMC:/api/v1/users/user-uuid-123
   返回: { tenant_id: "tenant-1", groups: ["group-1"] }
   ↓
4. 保存文档到业务数据库
   INSERT INTO documents (id, title, content, creator_id)
   VALUES ('doc-1', 'Q1 Report', '...', 'user-uuid-123')
   ↓
5. 写入PMC关系
   5.1 用户是所有者
       PMC.write(user:user-uuid-123, owner, document:doc-1)

   5.2 文档属于租户
       PMC.write(document:doc-1, tenant, tenant:tenant-1)

   5.3 (可选) 同步用户-租户关系（如果PMC还没有）
       PMC.write(user:user-uuid-123, member, tenant:tenant-1)
   ↓
6. 返回成功
```

### 场景4: 检查权限（关键流程）

```
1. 用户访问文档
   GET /api/v1/documents/doc-1
   Header: Authorization: Bearer <JWT>
   ↓
2. 后端验证JWT，提取user_id = "user-uuid-123"
   ↓
3. 调用PMC检查权限
   PMC.check(
     user: "user:user-uuid-123",
     relation: "viewer",
     object: "document:doc-1"
   )
   ↓
4. PMC内部计算:
   - 检查直接关系: user是doc的owner? ✅
   - 检查组关系: user的组有权限?
   - 检查租户关系: doc属于user的租户?
   - 检查黑名单: user被blocked?
   ↓
5. PMC返回: { allowed: true }
   ↓
6. 后端从数据库查询文档
   SELECT * FROM documents WHERE id = 'doc-1'
   ↓
7. 返回文档内容给前端
```

### 场景5: 列表页（反向查询）

```
1. 用户查看文档列表
   GET /api/v1/documents
   Header: Authorization: Bearer <JWT>
   ↓
2. 后端验证JWT，提取user_id = "user-uuid-123"
   ↓
3. 调用PMC反向查询
   PMC.listObjects(
     user: "user:user-uuid-123",
     type: "document",
     relation: "viewer"
   )
   返回: ["doc-1", "doc-2", "doc-5", "doc-9"]
   ↓
4. 从数据库批量查询
   SELECT * FROM documents
   WHERE id IN ('doc-1', 'doc-2', 'doc-5', 'doc-9')
   ↓
5. 返回列表给前端
```

---

## 数据同步策略

### 关键问题：IMC → PMC 如何同步？

你说的"从IMC拔取"有两种方式：

#### 方案A: 实时拉取 (Pull) ⚠️ 不推荐

```java
// 每次权限检查时都从IMC拉取
public boolean checkPermission(String userId, String docId) {
    // 1. 从IMC获取用户的租户和组
    UserInfo user = imcClient.getUser(userId);
    List<String> groups = user.getGroups();
    String tenant = user.getTenantId();

    // 2. 临时构建上下文关系
    // 3. 检查权限
    return pmc.checkWithContext(userId, docId, groups, tenant);
}
```

**问题**：
- ❌ 性能差（每次都调用IMC）
- ❌ IMC压力大
- ❌ 网络延迟

#### 方案B: 事件驱动同步 (Push) ✅ 推荐

```
┌─────────────────────────────────────────────────────────┐
│                    事件流                                │
└─────────────────────────────────────────────────────────┘

IMC中的变更                 →    Event Bus    →    PMC监听并更新

用户加入租户                 →   UserJoinedTenantEvent
用户加入组                   →   UserJoinedGroupEvent
用户离开组                   →   UserLeftGroupEvent
组被删除                     →   GroupDeletedEvent
租户被停用                   →   TenantDeactivatedEvent
```

**实现**：

```java
// IMC 发布事件
@Service
public class GroupService {

    @Autowired
    private EventPublisher eventPublisher;

    @Transactional
    public void addUserToGroup(String userId, String groupId) {
        // 1. 业务逻辑：IMC数据库写入
        groupMemberRepo.save(new GroupMember(userId, groupId));

        // 2. 发布事件
        eventPublisher.publish(new UserJoinedGroupEvent(
            userId, groupId, Instant.now()
        ));
    }
}

// PMC 监听事件
@Service
public class IMCEventListener {

    @Autowired
    private SpiceDBService spiceDB;

    @EventListener
    public void handleUserJoinedGroup(UserJoinedGroupEvent event) {
        // 同步到PMC
        spiceDB.writeRelationship(
            "user:" + event.getUserId(),
            "member",
            "group:" + event.getGroupId()
        );

        log.info("Synced: user {} joined group {}",
            event.getUserId(), event.getGroupId());
    }

    @EventListener
    public void handleUserLeftGroup(UserLeftGroupEvent event) {
        // 删除PMC关系
        spiceDB.deleteRelationship(
            "user:" + event.getUserId(),
            "member",
            "group:" + event.getGroupId()
        );
    }
}
```

**Event Bus选择**：
- Kafka (推荐，持久化，可回放)
- RabbitMQ
- AWS EventBridge
- 内部EventBus (如Spring Events，简单场景)

#### 方案C: 混合模式 ✅ 最推荐

```
常见关系（租户、组）:    事件同步到PMC
临时关系（资源权限）:    直接写入PMC
查询优化:               PMC缓存 + IMC兜底
```

**实现**：

```java
@Service
public class PermissionService {

    @Autowired
    private SpiceDBService pmc;

    @Autowired
    private IMCClient imcClient;

    @Cacheable("user-groups")
    public boolean checkPermission(String userId, String docId) {
        // 1. PMC检查（已同步的组关系 + 资源权限）
        boolean allowed = pmc.check(userId, docId, "viewer");

        if (!allowed) {
            // 2. 兜底：从IMC实时查询（处理延迟同步）
            UserInfo user = imcClient.getUser(userId);
            for (String groupId : user.getGroups()) {
                if (pmc.check("group:" + groupId, docId, "viewer")) {
                    // 发现遗漏的组关系，补充同步
                    pmc.writeRelationship(
                        "user:" + userId, "member", "group:" + groupId);
                    return true;
                }
            }
        }

        return allowed;
    }
}
```

---

## 架构优势分析

### ✅ 优点

1. **职责清晰**
   - AAC: 只管认证
   - IMC: 只管身份和组织
   - PMC: 只管权限

2. **独立扩展**
   - AAC瓶颈? 扩展Keycloak集群
   - IMC瓶颈? 扩展微服务
   - PMC瓶颈? 扩展SpiceDB集群

3. **技术选型灵活**
   - AAC: Keycloak (成熟IAM)
   - IMC: 自研 (完全掌控业务逻辑)
   - PMC: SpiceDB/OpenFGA (专业权限引擎)

4. **数据隔离**
   - 认证数据在AAC
   - 身份数据在IMC
   - 权限数据在PMC
   - 互不干扰

5. **容易替换**
   - 不满意Keycloak? 换Auth0
   - 不满意SpiceDB? 换OpenFGA
   - 不影响其他模块

### ⚠️ 需要注意的挑战

1. **数据一致性**
   ```
   问题: IMC说user属于group-1，但PMC还没同步
   方案:
   - 事件驱动 + 重试机制
   - 定期对账任务
   - 兜底查询IMC
   ```

2. **性能优化**
   ```
   问题: PMC检查权限时需要知道用户的组
   方案:
   - 事件同步（组关系预先同步到PMC）
   - 缓存（用户-组关系缓存5分钟）
   - JWT携带（JWT中包含groups claim）
   ```

3. **网络延迟**
   ```
   问题: 一次请求可能调用多个服务
   方案:
   - 服务间使用gRPC（比REST快）
   - 批量查询接口
   - 数据预加载
   ```

4. **事务一致性**
   ```
   问题: IMC创建组成功，但PMC同步失败
   方案:
   - Saga模式
   - Outbox模式（事件表）
   - 最终一致性（可接受短暂不一致）
   ```

---

## 完整代码示例

### IMC 服务

```java
// IMC - Group Service
@RestController
@RequestMapping("/api/v1/groups")
public class GroupController {

    @Autowired
    private GroupService groupService;

    @PostMapping("/{groupId}/members")
    public void addMember(
            @PathVariable String groupId,
            @RequestBody AddMemberRequest request) {

        groupService.addUserToGroup(request.getUserId(), groupId);
    }
}

@Service
public class GroupService {

    @Autowired
    private GroupMemberRepository repo;

    @Autowired
    private ApplicationEventPublisher eventPublisher;

    @Transactional
    public void addUserToGroup(String userId, String groupId) {
        // 1. 保存到IMC数据库
        GroupMember member = new GroupMember();
        member.setUserId(userId);
        member.setGroupId(groupId);
        member.setJoinedAt(Instant.now());
        repo.save(member);

        // 2. 发布事件
        UserJoinedGroupEvent event = new UserJoinedGroupEvent(
            this, userId, groupId, Instant.now()
        );
        eventPublisher.publishEvent(event);

        log.info("User {} added to group {}", userId, groupId);
    }
}
```

### PMC 服务

```java
// PMC - Event Listener
@Service
@Slf4j
public class IMCEventListener {

    @Autowired
    private SpiceDBService spiceDB;

    @Autowired
    private RetryTemplate retryTemplate;

    @EventListener
    @Async
    public void handleUserJoinedGroup(UserJoinedGroupEvent event) {
        // 重试机制：防止PMC临时不可用
        retryTemplate.execute(context -> {
            spiceDB.writeRelationship(
                "user:" + event.getUserId(),
                "member",
                "group:" + event.getGroupId()
            );

            log.info("✅ Synced to PMC: user {} → group {}",
                event.getUserId(), event.getGroupId());

            return null;
        });
    }

    @EventListener
    @Async
    public void handleUserLeftGroup(UserLeftGroupEvent event) {
        retryTemplate.execute(context -> {
            spiceDB.deleteRelationship(
                "user:" + event.getUserId(),
                "member",
                "group:" + event.getGroupId()
            );

            log.info("✅ Removed from PMC: user {} ✗ group {}",
                event.getUserId(), event.getGroupId());

            return null;
        });
    }
}

// PMC - Permission Check Service
@Service
public class PermissionCheckService {

    @Autowired
    private SpiceDBService spiceDB;

    public boolean checkPermission(String userId, String resourceType,
                                  String resourceId, String permission) {
        return spiceDB.check(
            "user:" + userId,
            permission,
            resourceType + ":" + resourceId
        );
    }

    public List<String> listAccessibleResources(String userId,
                                                String resourceType,
                                                String permission) {
        return spiceDB.lookupResources(
            "user:" + userId,
            resourceType,
            permission
        );
    }
}
```

### 业务应用

```java
// Business Application - Document Service
@RestController
@RequestMapping("/api/v1/documents")
public class DocumentController {

    @Autowired
    private DocumentRepository docRepo;

    @Autowired
    private IMCClient imcClient;  // 调用IMC

    @Autowired
    private PMCClient pmcClient;  // 调用PMC

    @PostMapping
    public DocumentDTO createDocument(
            @RequestBody CreateDocumentDTO dto,
            @AuthenticationPrincipal Jwt jwt) {

        String userId = jwt.getSubject();

        // 1. 从IMC获取用户的租户信息
        UserInfo userInfo = imcClient.getUser(userId);
        String tenantId = userInfo.getTenantId();

        // 2. 保存文档
        Document doc = new Document();
        doc.setTitle(dto.getTitle());
        doc.setContent(dto.getContent());
        doc.setCreatorId(userId);
        doc.setTenantId(tenantId);
        doc = docRepo.save(doc);

        // 3. 写入PMC权限
        // 3.1 用户是所有者
        pmcClient.writeRelationship(
            "user:" + userId,
            "owner",
            "document:" + doc.getId()
        );

        // 3.2 文档属于租户
        pmcClient.writeRelationship(
            "document:" + doc.getId(),
            "tenant",
            "tenant:" + tenantId
        );

        return DocumentDTO.from(doc);
    }

    @GetMapping("/{id}")
    public DocumentDTO getDocument(
            @PathVariable String id,
            @AuthenticationPrincipal Jwt jwt) {

        String userId = jwt.getSubject();

        // 1. 检查权限（调用PMC）
        boolean allowed = pmcClient.checkPermission(
            userId, "document", id, "viewer"
        );

        if (!allowed) {
            throw new AccessDeniedException("No permission to view document");
        }

        // 2. 查询文档
        Document doc = docRepo.findById(id)
            .orElseThrow(() -> new NotFoundException("Document not found"));

        return DocumentDTO.from(doc);
    }

    @GetMapping
    public List<DocumentDTO> listDocuments(@AuthenticationPrincipal Jwt jwt) {
        String userId = jwt.getSubject();

        // 1. 从PMC反向查询可访问的文档ID
        List<String> accessibleIds = pmcClient.listAccessibleResources(
            userId, "document", "viewer"
        );

        // 2. 批量查询文档
        List<Document> docs = docRepo.findByIdIn(accessibleIds);

        return docs.stream()
            .map(DocumentDTO::from)
            .collect(Collectors.toList());
    }
}
```

---

## 部署架构

```yaml
# docker-compose.yml
version: '3.8'

services:
  # AAC - Keycloak
  keycloak:
    image: quay.io/keycloak/keycloak:23.0
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres-aac/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: keycloak
    ports:
      - "8080:8080"
    depends_on:
      - postgres-aac

  # IMC - Identity Management Center
  imc-service:
    build: ./imc
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres-imc/imc
      SPRING_DATASOURCE_USERNAME: imc
      SPRING_DATASOURCE_PASSWORD: imc
      KAFKA_BOOTSTRAP_SERVERS: kafka:9092
    ports:
      - "8081:8080"
    depends_on:
      - postgres-imc
      - kafka

  # PMC - Permission Management Center
  pmc-service:
    build: ./pmc
    environment:
      SPICEDB_ENDPOINT: spicedb:50051
      KAFKA_BOOTSTRAP_SERVERS: kafka:9092
    ports:
      - "8082:8080"
    depends_on:
      - spicedb
      - kafka

  # SpiceDB
  spicedb:
    image: authzed/spicedb:latest
    command: serve --grpc-preshared-key "secret"
    environment:
      SPICEDB_DATASTORE_ENGINE: postgres
      SPICEDB_DATASTORE_CONN_URI: postgres://spicedb:spicedb@postgres-pmc/spicedb
    ports:
      - "50051:50051"
    depends_on:
      - postgres-pmc

  # Databases
  postgres-aac:
    image: postgres:15
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: keycloak

  postgres-imc:
    image: postgres:15
    environment:
      POSTGRES_DB: imc
      POSTGRES_USER: imc
      POSTGRES_PASSWORD: imc

  postgres-pmc:
    image: postgres:15
    environment:
      POSTGRES_DB: spicedb
      POSTGRES_USER: spicedb
      POSTGRES_PASSWORD: spicedb

  # Event Bus
  kafka:
    image: confluentinc/cp-kafka:7.5.0
    environment:
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
    depends_on:
      - zookeeper

  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
```

---

## 总结

### ✅ 你的架构设计非常合理！

**优点**：
1. ✅ 职责清晰（AAC认证、IMC身份、PMC权限）
2. ✅ 技术选型合适（Keycloak、自研、SpiceDB）
3. ✅ 独立扩展性强
4. ✅ 易于维护和替换

**关键成功因素**：
1. ✅ 事件驱动同步（IMC → PMC）
2. ✅ 重试和兜底机制
3. ✅ 清晰的数据所有权
4. ✅ 合理的缓存策略

**需要重点关注**：
1. ⚠️ IMC和PMC的数据一致性
2. ⚠️ 事件丢失/重复的处理
3. ⚠️ 性能优化（批量查询、缓存）
4. ⚠️ 监控和告警（同步延迟）

### 🎯 我的建议

**立即可以做**：
1. 先实现简单的同步（Spring Events）
2. 核心流程跑通后再引入Kafka
3. 监控IMC→PMC的同步延迟

**长期优化**：
1. 实现Outbox模式（保证事件可靠性）
2. 定期对账任务（发现不一致）
3. 性能测试和优化

需要我创建完整的实现代码吗？包括：
- IMC微服务（用户/组/租户管理）
- PMC微服务（SpiceDB集成）
- Event驱动同步
- 完整的Docker Compose
