# 🚀 Reusable GitHub Actions Workflows

一个可重用的 GitHub Actions 工作流集合，让你在其他项目中直接引用使用，无需复制粘贴。

## 📚 特性

- ✅ **Node.js CI/CD** - 完整的持续集成和部署流程
- ✅ **代码质量检查** - ESLint 和代码格式化
- ✅ **安全扫描** - 自动化的依赖安全检查
- ✅ **多环境部署** - 支持 staging 和 production 环境
- ✅ **高度可配置** - 通过参数自定义每个工作流
- ✅ **开箱即用** - 直接在你的项目中引用使用

## 🎯 快速开始

### 1. 在你的项目中创建 workflow 文件

在你的仓库中创建 `.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  ci:
    uses: geminiyellow/hello-dependabot-actions/.github/workflows/reusable-node-ci.yml@main
    with:
      node-version: '18.x'
      run-tests: true
      run-build: true
```

### 2. 推送代码

提交并推送代码，GitHub Actions 会自动运行！

## 📦 可用的 Workflows

| Workflow | 用途 | 文档 |
|----------|------|------|
| `reusable-node-ci.yml` | Node.js CI 流程 | [查看详情](WORKFLOWS_USAGE.md#1-nodejs-ci-reusable-node-ciyml) |
| `reusable-lint.yml` | 代码检查 | [查看详情](WORKFLOWS_USAGE.md#2-代码检查-reusable-lintyml) |
| `reusable-deploy.yml` | 部署流程 | [查看详情](WORKFLOWS_USAGE.md#3-部署-reusable-deployyml) |
| `reusable-security-scan.yml` | 安全扫描 | [查看详情](WORKFLOWS_USAGE.md#4-安全扫描-reusable-security-scanyml) |

## 🔐 跨组织私有访问

如果你的 Actions 仓库是**私有的**，并且需要在**不同组织**的仓库中使用：

### Reusable Workflows
⚠️ **无法直接跨组织使用私有的 Reusable Workflows**

### Composite Actions
✅ **可以跨组织使用！** 需要配置访问权限：

```yaml
# 在消费仓库中
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Checkout 私有 actions 仓库
      - uses: actions/checkout@v4
        with:
          repository: af/actions-packages  # 私有仓库
          token: ${{ secrets.AF_ACTIONS_PAT }}  # Personal Access Token
          path: .github/private-actions
          ref: v1.0.0

      # 使用 Composite Action
      - uses: ./.github/private-actions/composite-actions/setup-node
```

📘 **详细配置指南：** [CROSS_ORG_PRIVATE_ACCESS.md](CROSS_ORG_PRIVATE_ACCESS.md)

包含：
- Personal Access Token (PAT) 配置方法
- GitHub App Token 配置方法（企业推荐）
- 完整的使用示例和最佳实践
- 安全性建议

---

## 📖 完整文档

### 核心文档

查看 [WORKFLOWS_USAGE.md](WORKFLOWS_USAGE.md) 了解：
- 每个 workflow 的详细说明
- 所有可用参数和配置
- 完整的使用示例
- 最佳实践建议

### 专题指南

- 📋 [Composite Actions vs Reusable Workflows 对比](COMPOSITE_VS_REUSABLE.md)
  - 详细功能对比
  - 使用场景分析
  - 如何选择合适的方案

- 🏢 [私有组织使用指南](PRIVATE_ORG_GUIDE.md)
  - 组织内部共享 Actions
  - 版本管理和发布流程
  - 权限配置

- 🔐 [跨组织私有访问配置](CROSS_ORG_PRIVATE_ACCESS.md)
  - PAT 和 GitHub App 配置
  - 跨组织使用私有 Actions
  - 安全最佳实践

## 💡 示例

在 [examples](./examples) 目录中查看更多示例：
- [simple-ci.yml](./examples/simple-ci.yml) - 简单的 CI 流程
- [full-cicd.yml](./examples/full-cicd.yml) - 完整的 CI/CD 流程
- [pr-check.yml](./examples/pr-check.yml) - Pull Request 检查
- [scheduled-security.yml](./examples/scheduled-security.yml) - 定时安全扫描

## 🔧 版本管理

### 推荐使用方式

**生产环境 - 使用版本标签（推荐）：**
```yaml
uses: geminiyellow/hello-dependabot-actions/.github/workflows/reusable-node-ci.yml@v1.0.0
```

**开发环境 - 使用分支：**
```yaml
uses: geminiyellow/hello-dependabot-actions/.github/workflows/reusable-node-ci.yml@main
```

## 🤝 贡献

欢迎贡献新的 workflows 或改进现有的！

1. Fork 本仓库
2. 创建你的功能分支
3. 提交更改
4. 发起 Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🔗 相关资源

- [GitHub Actions 官方文档](https://docs.github.com/en/actions)
- [可重用 Workflows 指南](https://docs.github.com/en/actions/using-workflows/reusing-workflows)

---

**开始使用 → 查看 [完整使用文档](WORKFLOWS_USAGE.md)**