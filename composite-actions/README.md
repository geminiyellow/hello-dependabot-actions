# Composite Actions

本目录包含可重用的 Composite Actions，可以在任何 workflow 的 steps 中使用。

## 📦 可用的 Actions

### 1. Setup Node.js (`setup-node`)

设置 Node.js 环境并安装依赖。

**使用示例：**
```yaml
steps:
  - uses: actions/checkout@v4

  - name: Setup Node.js
    uses: geminiyellow/hello-dependabot-actions/composite-actions/setup-node@v1.0.0
    with:
      node-version: '18.x'
      working-directory: '.'
      cache-enabled: 'true'
```

**参数：**
- `node-version`: Node.js 版本（默认: `18.x`）
- `working-directory`: 工作目录（默认: `.`）
- `cache-enabled`: 是否启用缓存（默认: `true`）
- `registry-url`: npm registry URL（可选）

**输出：**
- `cache-hit`: 是否命中缓存
- `node-version`: 安装的 Node.js 版本

---

### 2. Send Notification (`notify`)

发送 workflow 状态通知到 Slack、Discord 等。

**使用示例：**
```yaml
steps:
  - name: Send success notification
    if: success()
    uses: geminiyellow/hello-dependabot-actions/composite-actions/notify@v1.0.0
    with:
      status: 'success'
      message: 'Build completed successfully!'
      webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}

  - name: Send failure notification
    if: failure()
    uses: geminiyellow/hello-dependabot-actions/composite-actions/notify@v1.0.0
    with:
      status: 'failure'
      message: 'Build failed!'
      webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
```

**参数：**
- `status`: 状态（success, failure, cancelled）【必填】
- `message`: 自定义消息（可选）
- `title`: 通知标题（默认: `Workflow Notification`）
- `webhook-url`: Webhook URL（可选）

**输出：**
- `notification-sent`: 是否成功发送通知

---

### 3. Cache Dependencies (`cache-dependencies`)

智能缓存项目依赖，支持多种包管理器。

**使用示例：**
```yaml
steps:
  - uses: actions/checkout@v4

  - name: Cache dependencies
    id: cache
    uses: geminiyellow/hello-dependabot-actions/composite-actions/cache-dependencies@v1.0.0
    with:
      package-manager: 'npm'
      working-directory: '.'
      cache-key-prefix: 'my-project'

  - name: Install dependencies
    if: steps.cache.outputs.cache-hit != 'true'
    run: npm ci
```

**参数：**
- `package-manager`: 包管理器（npm, yarn, pnpm）（默认: `npm`）
- `working-directory`: 工作目录（默认: `.`）
- `cache-key-prefix`: 缓存键前缀（默认: `deps`）

**输出：**
- `cache-hit`: 是否命中缓存
- `cache-key`: 使用的缓存键

---

## 🔗 组合使用示例

### 完整的 CI 流程

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # 使用 setup-node action
      - name: Setup environment
        uses: geminiyellow/hello-dependabot-actions/composite-actions/setup-node@v1.0.0
        with:
          node-version: '18.x'

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build

      # 使用 notify action
      - name: Notify success
        if: success()
        uses: geminiyellow/hello-dependabot-actions/composite-actions/notify@v1.0.0
        with:
          status: 'success'
          message: 'Tests passed and build successful!'
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}

      - name: Notify failure
        if: failure()
        uses: geminiyellow/hello-dependabot-actions/composite-actions/notify@v1.0.0
        with:
          status: 'failure'
          message: 'Build failed!'
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
```

### 优化缓存策略

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # 先缓存依赖
      - name: Cache dependencies
        id: cache
        uses: geminiyellow/hello-dependabot-actions/composite-actions/cache-dependencies@v1.0.0
        with:
          package-manager: 'npm'

      # 只在缓存未命中时安装
      - name: Install dependencies
        if: steps.cache.outputs.cache-hit != 'true'
        run: npm ci

      # Setup Node.js（不再安装依赖）
      - uses: actions/setup-node@v4
        with:
          node-version: '18.x'

      - run: npm test
```

---

## 🆚 对比 Reusable Workflows

| 特性 | Composite Actions | Reusable Workflows |
|------|------------------|-------------------|
| 使用位置 | `steps` 中 | `jobs` 中 |
| 灵活性 | ✅ 高 - 可以插入任何位置 | ⚠️ 低 - 必须是完整的 job |
| 适用场景 | 可重用的步骤组合 | 完整的工作流程 |

**查看完整对比：** [COMPOSITE_VS_REUSABLE.md](../COMPOSITE_VS_REUSABLE.md)

---

## 📝 私有组织使用

如果你的仓库在私有组织（如 `af/actions-packages`）中：

```yaml
steps:
  - uses: af/actions-packages/composite-actions/setup-node@v1.0.0
    with:
      node-version: '18.x'
```

组织内的其他仓库可以直接引用，无需额外配置！

---

## 🔧 自定义 Action

你可以基于这些示例创建自己的 composite actions：

1. 创建目录：`mkdir my-action`
2. 创建 `action.yml` 文件
3. 定义 `inputs`, `outputs`, 和 `steps`
4. 提交并创建版本标签
5. 在其他项目中使用！

**参考文档：** [GitHub Composite Actions 官方文档](https://docs.github.com/en/actions/creating-actions/creating-a-composite-action)
