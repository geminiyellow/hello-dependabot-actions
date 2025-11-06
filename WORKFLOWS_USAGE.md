# 可重用 GitHub Actions Workflows 使用指南

本仓库提供了一系列可重用的 GitHub Actions workflows，可以在其他仓库中直接引用使用。

## 📦 可用的 Workflows

### 1. Node.js CI (`reusable-node-ci.yml`)

自动化的 Node.js 持续集成流程，包括依赖安装、代码检查、测试和构建。

**功能特性：**
- ✅ 自动安装依赖
- ✅ 运行 linting
- ✅ 执行测试
- ✅ 构建项目
- ✅ 支持私有 npm 包

**在其他仓库中使用：**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  ci:
    uses: geminiyellow/hello-dependabot-actions/.github/workflows/reusable-node-ci.yml@main
    with:
      node-version: '18.x'
      run-tests: true
      run-build: true
      working-directory: '.'
    secrets:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}  # 可选：用于私有包
```

**参数说明：**
- `node-version`: Node.js 版本（默认: `18.x`）
- `working-directory`: 工作目录（默认: `.`）
- `run-tests`: 是否运行测试（默认: `true`）
- `run-build`: 是否运行构建（默认: `true`）

---

### 2. 代码检查 (`reusable-lint.yml`)

专门用于代码质量检查和格式化验证。

**功能特性：**
- ✅ ESLint 代码检查
- ✅ 代码格式化检查
- ✅ 输出检查结果

**在其他仓库中使用：**

```yaml
# .github/workflows/lint.yml
name: Lint

on:
  pull_request:
    branches: [ main ]

jobs:
  lint:
    uses: geminiyellow/hello-dependabot-actions/.github/workflows/reusable-lint.yml@main
    with:
      node-version: '18.x'
      working-directory: '.'
```

**输出结果：**
- `lint-result`: 检查结果状态（success/failure）

---

### 3. 部署 (`reusable-deploy.yml`)

标准化的部署流程，支持多环境部署。

**功能特性：**
- ✅ 支持多环境（staging/production）
- ✅ 自定义构建命令
- ✅ 安全的密钥管理
- ✅ 返回部署 URL

**在其他仓库中使用：**

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy-staging:
    uses: geminiyellow/hello-dependabot-actions/.github/workflows/reusable-deploy.yml@main
    with:
      environment: 'staging'
      node-version: '18.x'
      build-command: 'npm run build:staging'
    secrets:
      DEPLOY_TOKEN: ${{ secrets.STAGING_DEPLOY_TOKEN }}

  deploy-production:
    needs: deploy-staging
    uses: geminiyellow/hello-dependabot-actions/.github/workflows/reusable-deploy.yml@main
    with:
      environment: 'production'
      node-version: '18.x'
      build-command: 'npm run build'
    secrets:
      DEPLOY_TOKEN: ${{ secrets.PROD_DEPLOY_TOKEN }}
```

**参数说明：**
- `environment`: 部署环境（必填）
- `node-version`: Node.js 版本（默认: `18.x`）
- `build-command`: 构建命令（默认: `npm run build`）

**输出结果：**
- `deployment-url`: 部署后的 URL

---

### 4. 安全扫描 (`reusable-security-scan.yml`)

使用 npm audit 进行依赖安全扫描。

**功能特性：**
- ✅ npm audit 安全扫描
- ✅ 可配置严重性阈值
- ✅ 根据严重性决定是否失败
- ✅ 输出漏洞报告

**在其他仓库中使用：**

```yaml
# .github/workflows/security.yml
name: Security Scan

on:
  schedule:
    - cron: '0 0 * * 1'  # 每周一运行
  pull_request:
    branches: [ main ]

jobs:
  security:
    uses: geminiyellow/hello-dependabot-actions/.github/workflows/reusable-security-scan.yml@main
    with:
      severity-threshold: 'moderate'
      fail-on-severity: 'high'
```

**参数说明：**
- `working-directory`: 工作目录（默认: `.`）
- `severity-threshold`: 报告的最低严重性（默认: `moderate`）
- `fail-on-severity`: 失败阈值（默认: `high`）

---

## 🚀 完整示例

组合多个 workflow 创建完整的 CI/CD 流程：

```yaml
# .github/workflows/main.yml
name: Main CI/CD

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  # 安全扫描
  security:
    uses: geminiyellow/hello-dependabot-actions/.github/workflows/reusable-security-scan.yml@main

  # 代码检查
  lint:
    uses: geminiyellow/hello-dependabot-actions/.github/workflows/reusable-lint.yml@main
    with:
      node-version: '18.x'

  # CI 测试
  ci:
    needs: [security, lint]
    uses: geminiyellow/hello-dependabot-actions/.github/workflows/reusable-node-ci.yml@main
    with:
      node-version: '18.x'
      run-tests: true
      run-build: true

  # 部署到 staging（仅在 main 分支）
  deploy-staging:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    needs: ci
    uses: geminiyellow/hello-dependabot-actions/.github/workflows/reusable-deploy.yml@main
    with:
      environment: 'staging'
    secrets:
      DEPLOY_TOKEN: ${{ secrets.STAGING_DEPLOY_TOKEN }}
```

---

## 📝 版本管理

### 推荐的版本引用方式：

1. **使用特定版本（推荐）：**
   ```yaml
   uses: geminiyellow/hello-dependabot-actions/.github/workflows/reusable-node-ci.yml@v1.0.0
   ```

2. **使用分支：**
   ```yaml
   uses: geminiyellow/hello-dependabot-actions/.github/workflows/reusable-node-ci.yml@main
   ```

3. **使用 commit SHA（最安全）：**
   ```yaml
   uses: geminiyellow/hello-dependabot-actions/.github/workflows/reusable-node-ci.yml@a5aa60e
   ```

---

## 🔒 密钥管理

### 在调用仓库中设置密钥：

1. 进入仓库 Settings → Secrets and variables → Actions
2. 点击 "New repository secret"
3. 添加需要的密钥（如 `NPM_TOKEN`, `DEPLOY_TOKEN` 等）

### 在 workflow 中传递密钥：

```yaml
jobs:
  my-job:
    uses: geminiyellow/hello-dependabot-actions/.github/workflows/reusable-node-ci.yml@main
    secrets:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## 🛠️ 自定义和扩展

如果需要修改这些 workflows：

1. **Fork 本仓库**
2. **修改 workflow 文件**
3. **在你的仓库中引用修改后的版本：**
   ```yaml
   uses: your-username/hello-dependabot-actions/.github/workflows/reusable-node-ci.yml@main
   ```

---

## 💡 最佳实践

1. **使用版本标签**：生产环境使用特定版本，避免意外更新
2. **最小权限原则**：只传递必要的 secrets
3. **环境隔离**：使用 GitHub Environments 管理不同环境的配置
4. **监控和日志**：定期检查 workflow 运行日志
5. **安全扫描**：定期运行安全扫描，及时更新依赖

---

## 📚 相关资源

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [可重用 Workflows 官方文档](https://docs.github.com/en/actions/using-workflows/reusing-workflows)
- [Workflow 语法参考](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions)

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进这些 workflows！

## 📄 许可证

MIT License
