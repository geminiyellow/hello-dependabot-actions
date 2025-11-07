# 跨组织访问私有 GitHub Actions 完全指南

当你的 Actions 仓库和消费仓库在**不同组织**的**私有仓库**中时，需要特殊配置。

## 📋 场景说明

```
组织 A (af)
└── actions-packages (private)  ← 你的 Actions 仓库

组织 B (microsb)
└── working-repo (private)      ← 消费 Actions 的仓库
```

---

## ⚠️ 重要限制

### Reusable Workflow 的跨组织限制

**GitHub 官方限制：Reusable Workflows 跨组织访问私有仓库非常困难！**

根据 GitHub 文档：
- ✅ **同组织内**：私有仓库的 Reusable Workflows 可以直接访问
- ❌ **跨组织**：私有仓库的 Reusable Workflows **无法直接使用**
- ✅ **公开仓库**：任何人都可以使用

**解决方案：**
1. 将 actions-packages 改为公开仓库（最简单）
2. 使用 Composite Actions 代替 Reusable Workflows（推荐）
3. 将 Reusable Workflows 复制到消费组织（不推荐）

### Composite Actions 的跨组织访问

**Composite Actions 可以跨组织使用！** 但需要先 checkout 私有仓库。

---

## ✅ 推荐方案：使用 Composite Actions + PAT

### 方案 1: Personal Access Token (PAT)

这是最常用和最简单的方式。

#### 步骤 1：创建 Personal Access Token

1. 在有权访问 `af/actions-packages` 的 GitHub 账号中
2. 进入 Settings → Developer settings → Personal access tokens → Tokens (classic)
3. 点击 "Generate new token (classic)"
4. 设置：
   - **Note**: `Access to af/actions-packages`
   - **Expiration**: 根据需要设置（建议 90 天或无限期）
   - **Scopes**:
     - ✅ `repo` (Full control of private repositories)

5. 点击 "Generate token"
6. **重要：立即复制 token！** 离开页面后无法再次查看

#### 步骤 2：在消费仓库中添加 Secret

1. 进入 `microsb/working-repo` → Settings → Secrets and variables → Actions
2. 点击 "New repository secret"
3. 添加 secret：
   - **Name**: `AF_ACTIONS_PAT`
   - **Secret**: 粘贴刚才创建的 PAT

#### 步骤 3：在 Workflow 中使用 Composite Action

```yaml
# microsb/working-repo/.github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      # 1. Checkout 你自己的代码
      - name: Checkout working repo
        uses: actions/checkout@v4

      # 2. Checkout 私有 actions 仓库
      - name: Checkout private actions
        uses: actions/checkout@v4
        with:
          repository: af/actions-packages
          token: ${{ secrets.AF_ACTIONS_PAT }}  # 👈 使用 PAT
          path: .github/private-actions
          ref: v1.0.0  # 可以指定版本

      # 3. 使用 Composite Action（使用本地路径）
      - name: Setup Node.js
        uses: ./.github/private-actions/composite-actions/setup-node
        with:
          node-version: '18.x'

      # 4. 继续你的构建流程
      - name: Run tests
        run: npm test

      # 5. 使用另一个 Composite Action
      - name: Send notification
        if: always()
        uses: ./.github/private-actions/composite-actions/notify
        with:
          status: ${{ job.status }}
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
```

---

## 🔐 方案 2: GitHub App Token（企业推荐）

GitHub App 比 PAT 更安全，权限更细粒度，且不依赖个人账号。

### 步骤 1：创建 GitHub App

1. 在组织 `af` 中创建 GitHub App：
   - 进入组织设置 → Developer settings → GitHub Apps → New GitHub App

2. 配置 App：
   - **GitHub App name**: `Actions Access App`
   - **Homepage URL**: `https://github.com/af/actions-packages`
   - **Webhook**: 取消勾选 "Active"

3. 权限设置：
   - **Repository permissions**:
     - Contents: **Read-only** ✅
     - Metadata: **Read-only** ✅

4. **Where can this GitHub App be installed?**
   - 选择 "Any account"

5. 创建后，记录：
   - **App ID**
   - 生成并下载 **Private Key**

### 步骤 2：安装 App 到 actions-packages 仓库

1. 进入刚创建的 GitHub App 设置
2. 点击 "Install App"
3. 选择组织 `af`
4. 选择 "Only select repositories"
5. 选择 `actions-packages`

### 步骤 3：在消费仓库配置 Secrets

在 `microsb/working-repo` 添加 secrets：
- `APP_ID`: GitHub App ID
- `APP_PRIVATE_KEY`: Private Key 内容（完整的 PEM 格式）

### 步骤 4：在 Workflow 中使用

```yaml
# microsb/working-repo/.github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout working repo
        uses: actions/checkout@v4

      # 1. 生成 GitHub App Token
      - name: Generate token
        id: generate_token
        uses: tibdex/github-app-token@v1
        with:
          app_id: ${{ secrets.APP_ID }}
          private_key: ${{ secrets.APP_PRIVATE_KEY }}

      # 2. Checkout 私有 actions 仓库
      - name: Checkout private actions
        uses: actions/checkout@v4
        with:
          repository: af/actions-packages
          token: ${{ steps.generate_token.outputs.token }}  # 👈 使用 App Token
          path: .github/private-actions
          ref: v1.0.0

      # 3. 使用 Composite Actions
      - name: Setup Node.js
        uses: ./.github/private-actions/composite-actions/setup-node
        with:
          node-version: '18.x'

      - name: Run tests
        run: npm test
```

---

## 🔄 方案 3: 缓存 Actions 仓库（优化性能）

每次 checkout 私有仓库会增加构建时间，可以使用缓存优化：

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout working repo
        uses: actions/checkout@v4

      # 缓存 actions 仓库
      - name: Cache actions repo
        id: cache-actions
        uses: actions/cache@v3
        with:
          path: .github/private-actions
          key: actions-repo-${{ github.run_id }}
          restore-keys: |
            actions-repo-

      # 只在缓存未命中时 checkout
      - name: Checkout private actions
        if: steps.cache-actions.outputs.cache-hit != 'true'
        uses: actions/checkout@v4
        with:
          repository: af/actions-packages
          token: ${{ secrets.AF_ACTIONS_PAT }}
          path: .github/private-actions
          ref: v1.0.0

      - name: Use action
        uses: ./.github/private-actions/composite-actions/setup-node
```

---

## 📦 Reusable Workflow 的替代方案

由于 Reusable Workflow 跨组织限制，有以下替代方案：

### 方案 A: 转换为 Composite Action

将 Reusable Workflow 改写为 Composite Action：

**原 Reusable Workflow:**
```yaml
# af/actions-packages/.github/workflows/reusable-ci.yml
on:
  workflow_call:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
```

**转换为 Composite Action:**
```yaml
# af/actions-packages/composite-actions/ci/action.yml
name: 'CI Action'
runs:
  using: 'composite'
  steps:
    - uses: actions/checkout@v4
      with:
        repository: ${{ github.repository }}
    - shell: bash
      run: npm ci
    - shell: bash
      run: npm test
```

**使用:**
```yaml
# microsb/working-repo/.github/workflows/ci.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/checkout@v4
        with:
          repository: af/actions-packages
          token: ${{ secrets.AF_ACTIONS_PAT }}
          path: .github/actions

      - uses: ./.github/actions/composite-actions/ci
```

### 方案 B: 复制 Workflow 到消费组织（不推荐）

在 `microsb` 组织创建一个仓库 `microsb/shared-workflows`，复制需要的 workflows。

缺点：
- ❌ 需要手动同步更新
- ❌ 维护成本高
- ❌ 容易出现版本不一致

---

## 🔒 安全最佳实践

### 1. 使用最小权限

**PAT 权限：**
- ✅ 只勾选 `repo`（如果只需读取）
- ❌ 不要勾选 `admin` 等高级权限

**GitHub App 权限：**
- ✅ Contents: Read-only
- ✅ Metadata: Read-only
- ❌ 不要给 Write 权限（除非必要）

### 2. 定期轮换 Token

```yaml
# 在 PAT 即将过期前设置提醒
# 建议使用 GitHub App，可以自动刷新 token
```

### 3. 限制 Secret 访问范围

在组织 `microsb` 中：
1. Settings → Secrets and variables → Actions
2. 对于敏感 secrets，使用 **Environment secrets** 而非 Repository secrets
3. 配置 Environment protection rules

### 4. 审计日志

定期检查：
- PAT 使用情况
- GitHub App 访问日志
- Actions 运行日志

---

## 📊 方案对比

| 方案 | 复杂度 | 安全性 | 维护成本 | 推荐场景 |
|------|--------|--------|----------|----------|
| **PAT** | ⭐ 低 | ⭐⭐ 中 | ⭐⭐ 中 | 小团队，快速开始 |
| **GitHub App** | ⭐⭐ 中 | ⭐⭐⭐ 高 | ⭐ 低 | 企业级，多仓库 |
| **复制到消费组织** | ⭐ 低 | ⭐⭐⭐ 高 | ⭐⭐⭐ 高 | 不推荐 |
| **公开仓库** | ⭐ 低 | ⭐ 低 | ⭐ 低 | 开源项目 |

---

## 🚀 快速开始检查清单

### 使用 PAT 方式（推荐快速开始）：

- [ ] 创建 PAT（勾选 `repo` 权限）
- [ ] 在消费仓库添加 Secret (`AF_ACTIONS_PAT`)
- [ ] 修改 workflow：
  - [ ] Checkout 私有 actions 仓库
  - [ ] 使用本地路径引用 Composite Actions
- [ ] 测试运行

### 使用 GitHub App 方式（推荐企业）：

- [ ] 创建 GitHub App
- [ ] 配置权限（Contents: Read, Metadata: Read）
- [ ] 安装 App 到 actions-packages 仓库
- [ ] 在消费仓库添加 Secrets (`APP_ID`, `APP_PRIVATE_KEY`)
- [ ] 修改 workflow 使用 `tibdex/github-app-token`
- [ ] 测试运行

---

## 💡 常见问题

### Q: 可以直接使用 Reusable Workflow 吗？

**A:** 不行。GitHub 不支持跨组织访问私有仓库的 Reusable Workflows。必须：
1. 将 actions-packages 改为公开仓库，或
2. 使用 Composite Actions 代替

### Q: PAT 过期了怎么办？

**A:**
1. 生成新的 PAT
2. 更新消费仓库的 Secret
3. 建议使用 GitHub App，token 会自动刷新

### Q: 可以在多个消费仓库使用吗？

**A:** 可以！
- **PAT**: 在每个消费仓库添加相同的 Secret
- **GitHub App**: 安装 App 到多个仓库即可

### Q: 如何版本控制？

**A:** 在 checkout 时指定 `ref`:
```yaml
- uses: actions/checkout@v4
  with:
    repository: af/actions-packages
    ref: v1.0.0  # 或 main, 或 commit SHA
```

---

## 📚 相关资源

- [GitHub Actions - Accessing private repositories](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token)
- [Creating a GitHub App](https://docs.github.com/en/developers/apps/building-github-apps/creating-a-github-app)
- [tibdex/github-app-token Action](https://github.com/tibdex/github-app-token)
- [Reusable Workflows Limitations](https://docs.github.com/en/actions/using-workflows/reusing-workflows#limitations)
