# 开源授权方案：License和商业模式对比

## 快速答案

### ✅ 三者都是完全免费的开源软件！

| 项目 | License | 商业使用 | 自托管 | 托管服务 |
|------|---------|----------|--------|----------|
| **SpiceDB** | Apache 2.0 | ✅ 完全免费 | ✅ 免费 | 💰 AuthZed Cloud (付费) |
| **OpenFGA** | Apache 2.0 | ✅ 完全免费 | ✅ 免费 | 💰 Auth0 FGA (付费) |
| **Permify** | Apache 2.0 | ✅ 完全免费 | ✅ 免费 | 💰 Permify Cloud (付费) |

**结论**：三者都可以**免费商用**，永久免费，没有限制！

---

## 详细分析

### 1. SpiceDB (AuthZed)

#### License
```
Apache License 2.0
✅ 允许商业使用
✅ 允许修改
✅ 允许分发
✅ 允许私有使用
✅ 提供专利授权
```

**GitHub**: https://github.com/authzed/spicedb
**License文件**: Apache 2.0

#### 免费使用

**✅ 完全免费的功能**：
- 核心SpiceDB引擎
- gRPC API
- 所有查询功能（Check, LookupResources, Expand）
- Schema语言和验证
- PostgreSQL/MySQL/CockroachDB/Spanner支持
- 水平扩展
- Zookies一致性保证

**自托管部署**：
```bash
# 完全免费，永久免费
docker run -p 50051:50051 \
  authzed/spicedb serve \
  --grpc-preshared-key "your-secret"
```

#### 付费选项（可选，不是必需）

**AuthZed Cloud** (托管SaaS服务)：
- 起步价: **免费层**
  - 10,000 checks/month
  - 社区支持
- 付费层: 联系销售
  - 更高并发
  - SLA保证
  - 专业支持

**SpiceDB Enterprise**（自托管增强版）:
- 额外的企业功能：
  - API访问控制
  - 审计日志增强
  - 企业支持
- **注意**：核心功能已经足够强大，大部分公司不需要Enterprise

#### 适合场景

| 场景 | 推荐版本 | 费用 |
|------|----------|------|
| 创业公司 | 开源自托管 | ✅ 免费 |
| 中型公司 | 开源自托管 | ✅ 免费 |
| 大型企业（自己运维） | 开源自托管 | ✅ 免费 |
| 大型企业（要SLA） | AuthZed Cloud | 💰 付费 |
| 不想自己运维 | AuthZed Cloud | 💰 付费 |

---

### 2. OpenFGA (Auth0/Okta)

#### License
```
Apache License 2.0
✅ 允许商业使用
✅ 允许修改
✅ 允许分发
✅ 允许私有使用
✅ Linux Foundation托管
```

**GitHub**: https://github.com/openfga/openfga
**治理**: Linux Foundation (开放治理)

#### 免费使用

**✅ 完全免费的功能**：
- 核心OpenFGA引擎
- HTTP + gRPC API
- 所有查询功能（Check, ListObjects, Read, Expand）
- Conditions支持（ABAC）
- Playground UI（可视化工具）
- PostgreSQL/MySQL支持
- 水平扩展

**自托管部署**：
```bash
# 完全免费，永久免费
docker run -p 8080:8080 -p 3000:3000 \
  openfga/openfga run
```

#### 付费选项（可选）

**Auth0 FGA** (托管SaaS服务)：
- 起步价: 未公开（需联系销售）
- 托管在Auth0基础设施
- SLA保证
- 集成Auth0其他服务

**优势**：
- ✅ Linux Foundation托管，不依赖单一公司
- ✅ 开放治理，社区驱动
- ✅ 即使Auth0不维护，社区可以继续

#### 适合场景

| 场景 | 推荐版本 | 费用 |
|------|----------|------|
| 任何自托管需求 | 开源版本 | ✅ 免费 |
| 已使用Auth0 | Auth0 FGA | 💰 付费（集成方便） |
| 重视开源治理 | 开源版本 | ✅ 免费 |

---

### 3. Permify (FusionAuth)

#### License
```
Apache License 2.0
✅ 允许商业使用
✅ 允许修改
✅ 允许分发
✅ 允许私用使用
```

**GitHub**: https://github.com/Permify/permify
**最新动态**: 2024年11月被FusionAuth收购

#### 免费使用

**✅ 完全免费的功能**：
- 核心Permify引擎
- HTTP + gRPC API
- 所有查询功能
- 可视化Schema编辑器
- 批量操作API
- 原生多租户支持
- PostgreSQL/MySQL支持

**自托管部署**：
```bash
# 完全免费，永久免费
docker run -p 3476:3476 -p 3478:3478 \
  ghcr.io/permify/permify serve
```

#### 付费选项（可选）

**Permify Cloud** (托管SaaS - 旧定价，可能会变)：
- Community: **免费**
  - 有限功能
  - 社区支持
- Growth: $149/月起
  - 按MAU计费
  - 邮件支持
- Enterprise: 联系销售
  - SLA保证
  - 专业支持

**FusionAuth统一平台** (2026年推出)：
- 认证 + 授权统一
- 新的定价模式
- 开源核心保持免费

**承诺**：
> "Permify will continue to be available as a standalone authorization engine"
> "开源社区不会受影响"

#### 适合场景

| 场景 | 推荐版本 | 费用 |
|------|----------|------|
| 自托管 | 开源版本 | ✅ 免费 |
| 已使用FusionAuth | 统一平台（2026） | 💰 待定 |
| 需要可视化工具 | 开源版本 | ✅ 免费 |

---

## 商业模式对比

### 它们怎么赚钱？

#### SpiceDB (AuthZed)
```
开源免费 → 吸引用户 →
部分用户选择托管服务（AuthZed Cloud）→
获得收入
```

**策略**: "Open Core" - 核心开源，增强功能付费（但核心已经很强）

#### OpenFGA (Auth0)
```
开源免费 → 吸引用户 →
与Auth0其他产品交叉销售 →
获得收入
```

**策略**: 生态系统 - 通过Auth0平台其他服务盈利

#### Permify (FusionAuth)
```
开源免费 → 吸引用户 →
托管服务 + FusionAuth统一平台 →
获得收入
```

**策略**: 2024年被收购，未来整合到FusionAuth平台

---

## 对你的影响

### Q1: 我能免费商用吗？
**A**: ✅ **100%可以**，三者都是Apache 2.0

### Q2: 有使用限制吗？
**A**: ❌ **没有限制**
- 没有QPS限制
- 没有存储限制
- 没有用户数限制
- 没有功能限制

### Q3: 需要付费吗？
**A**: ❌ **自托管完全不需要**

你只有以下情况才需要付费：
1. 不想自己运维（用托管服务）
2. 需要官方SLA保证
3. 需要企业级技术支持

### Q4: 会不会突然改License？
**A**: 极低风险

- ✅ Apache 2.0是永久性的
- ✅ 已有的开源版本不会消失
- ✅ OpenFGA有Linux Foundation保护
- ✅ 社区可以fork

**历史案例**：
- Redis: 改License → 社区fork了Valkey
- Terraform: 改License → 社区fork了OpenTofu
- 即使改License，现有版本仍然可用

### Q5: 生产环境安全吗？
**A**: ✅ **完全安全**

实际使用案例：
- **SpiceDB**: CartHook, Authzed自己的产品
- **OpenFGA**: Auth0, Okta客户
- **Permify**: 多家SaaS公司

---

## 成本对比

### 自托管成本（AWS示例）

假设：10,000 QPS，99.9% SLA

| 组件 | 配置 | 月成本 |
|------|------|--------|
| **应用服务器** | 3x t3.large (SpiceDB/OpenFGA/Permify) | $150 |
| **PostgreSQL** | RDS db.r6g.large | $200 |
| **Redis** (可选缓存) | ElastiCache cache.r6g.large | $100 |
| **ALB** | Application Load Balancer | $20 |
| **Data Transfer** | 1TB/month | $90 |
| **总计** | | **~$560/月** |

### 托管服务成本（估算）

| 服务 | 10,000 QPS | 100,000 QPS |
|------|------------|-------------|
| **AuthZed Cloud** | 免费层可能够用 | 联系销售（估计$500-2000/月） |
| **Auth0 FGA** | 未公开 | 未公开（估计$1000+/月） |
| **Permify Cloud** | $149+/月 | 联系销售 |

**结论**：
- 10,000 QPS以下：自托管更便宜
- 100,000 QPS以上：看具体报价，可能托管更省心

---

## 最终推荐

### 按成本优先

| 需求 | 推荐 | 理由 |
|------|------|------|
| **完全免费** | 三者都行 | 自托管都免费 |
| **最省钱** | OpenFGA | Linux Foundation，长期保证 |
| **开源治理最好** | OpenFGA | Linux Foundation托管 |

### 按功能优先

| 需求 | 推荐 | License |
|------|------|---------|
| **性能最好** | SpiceDB | Apache 2.0，免费 |
| **最易用** | Permify | Apache 2.0，免费 |
| **社区最活跃** | OpenFGA | Apache 2.0，免费 |

---

## 总结

### 💰 费用结论

**三者都是完全免费的！**

✅ 可以商用
✅ 可以修改
✅ 可以自托管
✅ 没有功能限制
✅ 没有使用限制
✅ Apache 2.0永久授权

**你只需要为以下付费（可选）**：
- 托管服务（不想自己运维）
- 企业支持（需要SLA和技术支持）
- 增强功能（大部分公司不需要）

### 🎯 我的推荐

**创业公司/中小企业**：
- 选择：任何一个开源版本自托管
- 费用：AWS $500-1000/月（包括所有基础设施）
- License：完全免费

**大型企业**：
- 选择：开源版本自托管 + 内部运维团队
- 费用：AWS $2000-5000/月（高可用架构）
- License：完全免费

**不想运维的公司**：
- 选择：AuthZed Cloud / Auth0 FGA / Permify Cloud
- 费用：$500-5000/月（根据规模）
- License：免费，但托管服务收费

---

**最终答案**：

✅ **完全免费商用**
✅ **没有任何限制**
✅ **Apache 2.0永久授权**
✅ **推荐自托管（更便宜，完全掌控）**
