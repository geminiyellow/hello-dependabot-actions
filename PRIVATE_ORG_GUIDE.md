# 私有组织共享 Actions 完整指南

本指南专门针对在私有组织（如 `af`）中创建和使用共享的 GitHub Actions workflows。

## 📋 目录

1. [创建共享 Actions 仓库](#创建共享-actions-仓库)
2. [在组织内使用](#在组织内使用)
3. [版本管理](#版本管理)
4. [权限配置](#权限配置)
5. [最佳实践](#最佳实践)

---

## 🏗️ 创建共享 Actions 仓库

### 1. 在组织中创建仓库

在你的私有组织 `af` 中创建一个专门的仓库 `actions-packages`：

```bash
# 创建并克隆仓库
gh repo create af/actions-packages --private --clone
cd actions-packages
```

### 2. 创建标准目录结构

```
af/actions-packages/
├── .github/
│   └── workflows/
│       ├── reusable-ci.yml          # CI 流程
│       ├── reusable-deploy.yml      # 部署流程
│       ├── reusable-lint.yml        # 代码检查
│       └── reusable-security.yml    # 安全扫描
├── examples/                         # 使用示例
│   └── usage-example.yml
├── README.md                         # 文档
└── CHANGELOG.md                      # 版本变更记录
```

### 3. 编写可重用 Workflow

例如 `.github/workflows/reusable-ci.yml`：

```yaml
name: Reusable CI

on:
  workflow_call:
    inputs:
      node-version:
        required: false
        type: string
        default: '18.x'
      working-directory:
        required: false
        type: string
        default: '.'
    secrets:
      NPM_TOKEN:
        required: false

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
          cache: 'npm'

      - name: Install dependencies
        working-directory: ${{ inputs.working-directory }}
        run: npm ci
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Run tests
        working-directory: ${{ inputs.working-directory }}
        run: npm test

      - name: Build
        working-directory: ${{ inputs.working-directory }}
        run: npm run build --if-present
```

---

## 🔧 在组织内使用

### 基本使用

在组织内的任何仓库（如 `af/working-repo`）中直接引用：

```yaml
# af/working-repo/.github/workflows/ci.yml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:

jobs:
  ci:
    uses: af/actions-packages/.github/workflows/reusable-ci.yml@v1.0.0
    with:
      node-version: '18.x'
    secrets:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 组合多个 Workflows

```yaml
# af/working-repo/.github/workflows/main.yml
name: Full Pipeline

on:
  push:
    branches: [ main ]

jobs:
  lint:
    uses: af/actions-packages/.github/workflows/reusable-lint.yml@v1.0.0

  security:
    uses: af/actions-packages/.github/workflows/reusable-security.yml@v1.0.0

  ci:
    needs: [lint, security]
    uses: af/actions-packages/.github/workflows/reusable-ci.yml@v1.0.0
    secrets:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}

  deploy:
    needs: ci
    if: github.ref == 'refs/heads/main'
    uses: af/actions-packages/.github/workflows/reusable-deploy.yml@v1.0.0
    secrets:
      DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
```

---

## 📦 版本管理

### 创建版本

```bash
# 在 af/actions-packages 仓库中

# 1. 完成所有更改并测试
git add .
git commit -m "feat: add new CI workflow"
git push

# 2. 创建版本标签
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

# 3. 创建 GitHub Release（推荐）
gh release create v1.0.0 \
  --title "v1.0.0 - Initial Release" \
  --notes "## Changes
- Added reusable CI workflow
- Added reusable deploy workflow
- Added security scan workflow"
```

### 语义化版本建议

```bash
# 主版本：破坏性更改
v2.0.0  # 更改了 workflow 输入参数，不兼容旧版本

# 次版本：新增功能
v1.1.0  # 添加了新的可选参数

# 补丁版本：Bug 修复
v1.0.1  # 修复了某个 bug
```

### 在工作仓库中引用版本

```yaml
jobs:
  # 推荐：使用具体版本号（生产环境）
  ci-prod:
    uses: af/actions-packages/.github/workflows/reusable-ci.yml@v1.0.0

  # 灵活：使用主版本（自动获取补丁更新）
  ci-auto-patch:
    uses: af/actions-packages/.github/workflows/reusable-ci.yml@v1

  # 最新：使用分支（开发测试）
  ci-dev:
    uses: af/actions-packages/.github/workflows/reusable-ci.yml@main

  # 最稳定：使用 commit SHA（完全锁定）
  ci-locked:
    uses: af/actions-packages/.github/workflows/reusable-ci.yml@abc123def456
```

---

## 🔒 权限配置

### 1. 设置仓库访问权限

**方法 A：在 actions-packages 仓库设置**

1. 进入 `af/actions-packages` → Settings → Actions → General
2. 在 "Access" 部分选择：
   - **Accessible from repositories in the 'af' organization** (推荐)
   - 或指定具体仓库

**方法 B：组织级别设置**

1. 进入组织 `af` → Settings → Actions → General
2. 在 "Policies" 中启用：
   - ✅ Allow all actions and reusable workflows
   - 或配置允许列表

### 2. 配置 GITHUB_TOKEN 权限

在工作仓库的 workflow 中：

```yaml
jobs:
  ci:
    uses: af/actions-packages/.github/workflows/reusable-ci.yml@v1.0.0
    permissions:
      contents: read       # 读取仓库内容
      pull-requests: write # 写 PR 评论（如果需要）
      checks: write        # 写检查结果（如果需要）
```

### 3. 跨组织使用（需要 PAT）

如果需要在组织外使用：

```yaml
# external-org/repo/.github/workflows/ci.yml
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout private actions
        uses: actions/checkout@v4
        with:
          repository: af/actions-packages
          ref: v1.0.0
          token: ${{ secrets.PAT_TOKEN }}  # 需要配置 PAT
          path: .github/actions

      - name: Use private action
        uses: ./.github/actions/ci-workflow
```

**创建 PAT (Personal Access Token):**
1. GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token
3. 权限选择：`repo` (Full control of private repositories)
4. 将 token 添加到目标仓库的 Secrets

---

## 💡 最佳实践

### 1. 文档化

在 `actions-packages` 仓库中维护清晰的文档：

```markdown
# README.md

## 可用的 Workflows

| Workflow | 用途 | 参数 | 示例 |
|---------|------|------|------|
| reusable-ci.yml | CI 测试 | node-version, working-directory | [查看](examples/ci.yml) |
| reusable-deploy.yml | 部署 | environment, build-command | [查看](examples/deploy.yml) |
```

### 2. 变更日志

维护 `CHANGELOG.md`：

```markdown
# Changelog

## [1.1.0] - 2024-01-15
### Added
- 新增 Python 项目支持
- 添加缓存优化

### Fixed
- 修复 Windows 环境下的路径问题

## [1.0.0] - 2024-01-01
### Added
- 初始版本发布
```

### 3. 测试新版本

在发布前创建测试仓库：

```bash
# 创建测试仓库
gh repo create af/actions-test --private

# 在测试仓库中引用开发分支
uses: af/actions-packages/.github/workflows/reusable-ci.yml@develop
```

### 4. 向后兼容

- 新增参数使用默认值
- 不要删除现有参数
- 重大更改使用新的主版本号

```yaml
# ✅ 好的做法：添加新参数带默认值
inputs:
  cache-enabled:
    required: false
    type: boolean
    default: true  # 不影响现有用户

# ❌ 避免：删除或重命名现有参数
# 旧版本: node-version
# 新版本: nodejs-version  # 这会破坏现有引用！
```

### 5. 统一标准

在组织内所有 workflows 使用统一的：
- 命名规范：`reusable-{purpose}.yml`
- 参数命名：使用 kebab-case
- 输出格式：统一的 JSON 格式
- 错误处理：统一的失败策略

---

## 🚀 快速开始检查清单

- [ ] 在组织中创建 `actions-packages` 仓库
- [ ] 创建 `.github/workflows/` 目录
- [ ] 编写可重用 workflows
- [ ] 添加文档和示例
- [ ] 测试 workflows
- [ ] 创建第一个版本标签 (v1.0.0)
- [ ] 配置仓库访问权限
- [ ] 在工作仓库中引用测试
- [ ] 通知团队成员新的共享 actions

---

## 📞 常见问题

### Q: 可以混合使用版本吗？

**A:** 可以！不同的 job 可以使用不同版本：

```yaml
jobs:
  stable:
    uses: af/actions-packages/.github/workflows/reusable-ci.yml@v1.0.0

  beta:
    uses: af/actions-packages/.github/workflows/reusable-ci.yml@v2.0.0-beta
```

### Q: 如何调试共享 workflow？

**A:** 使用分支引用进行测试：

```yaml
# 临时使用开发分支进行调试
uses: af/actions-packages/.github/workflows/reusable-ci.yml@feature/new-feature
```

### Q: 共享 workflow 中可以使用 secrets 吗？

**A:** 可以！通过 `workflow_call.secrets` 定义：

```yaml
on:
  workflow_call:
    secrets:
      MY_SECRET:
        required: true
```

---

## 📚 相关资源

- [GitHub 可重用 Workflows 官方文档](https://docs.github.com/en/actions/using-workflows/reusing-workflows)
- [创建私有 Actions](https://docs.github.com/en/actions/creating-actions)
- [GitHub Actions 最佳实践](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
