# Composite Action vs Reusable Workflow 对比指南

## 📋 核心区别

| 特性 | Composite Action | Reusable Workflow |
|------|-----------------|-------------------|
| **文件名** | ⚠️ 必须叫 `action.yml` 或 `action.yaml` | ✅ 任意命名（如 `reusable-ci.yml`） |
| **位置** | 任意目录（如 `src/ci-action/action.yml`） | 必须在 `.github/workflows/` |
| **封装单位** | 一组 **steps**（步骤） | 完整的 **jobs**（工作） |
| **使用位置** | 在 `steps` 中使用 | 在 `jobs` 中使用 |
| **可以包含** | 多个 steps | 多个 jobs，每个 job 可以有多个 steps |
| **运行环境** | 继承调用者的 runner | 每个 job 可以指定自己的 runner |
| **secrets 传递** | 自动继承（无需显式传递） | 必须显式传递 |
| **outputs** | 可以有多个 outputs | 可以有多个 outputs |
| **条件执行** | 每个 step 可以有 if 条件 | 每个 job 可以有 if 条件 |

---

## 🔍 详细对比

### 1. Composite Action - 封装步骤

**适用场景**：重复使用的一组步骤（如：checkout + setup + install）

**文件结构**：
```
af/actions-packages/
├── setup-node-action/
│   └── action.yml          ← 必须叫这个名字
├── deploy-action/
│   └── action.yml          ← 必须叫这个名字
└── lint-action/
    └── action.yml          ← 必须叫这个名字
```

**action.yml 示例**：
```yaml
# af/actions-packages/setup-node-action/action.yml
name: 'Setup Node.js Environment'
description: 'Setup Node.js with cache and install dependencies'

inputs:
  node-version:
    description: 'Node.js version'
    required: false
    default: '18.x'
  working-directory:
    description: 'Working directory'
    required: false
    default: '.'

outputs:
  cache-hit:
    description: 'Whether cache was hit'
    value: ${{ steps.cache.outputs.cache-hit }}

runs:
  using: 'composite'
  steps:
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ inputs.node-version }}
        cache: 'npm'
        cache-dependency-path: ${{ inputs.working-directory }}/package-lock.json

    - name: Cache dependencies
      id: cache
      uses: actions/cache@v3
      with:
        path: ${{ inputs.working-directory }}/node_modules
        key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}

    - name: Install dependencies
      if: steps.cache.outputs.cache-hit != 'true'
      shell: bash
      working-directory: ${{ inputs.working-directory }}
      run: npm ci

    - name: Print success
      shell: bash
      run: echo "✅ Node.js environment ready!"
```

**使用方式**：
```yaml
# 在你的工作仓库 af/working-repo/.github/workflows/ci.yml
name: CI

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # 使用 composite action
      - name: Setup environment
        uses: af/actions-packages/setup-node-action@v1.0.0
        with:
          node-version: '18.x'
          working-directory: '.'

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build
```

---

### 2. Reusable Workflow - 封装完整工作流

**适用场景**：完整的 CI/CD 流程（如：完整的测试+构建流程）

**文件结构**：
```
af/actions-packages/
└── .github/workflows/
    ├── reusable-ci.yml        ← 可以任意命名
    ├── reusable-deploy.yml    ← 可以任意命名
    └── reusable-test.yml      ← 可以任意命名
```

**reusable-ci.yml 示例**：
```yaml
# af/actions-packages/.github/workflows/reusable-ci.yml
name: Reusable CI

on:
  workflow_call:
    inputs:
      node-version:
        required: false
        type: string
        default: '18.x'
      run-lint:
        required: false
        type: boolean
        default: true
    secrets:
      NPM_TOKEN:
        required: false
    outputs:
      build-status:
        description: 'Build status'
        value: ${{ jobs.build.outputs.status }}

jobs:
  # 可以包含多个 jobs
  lint:
    if: ${{ inputs.run-lint }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm ci
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
      - run: npm test

  build:
    needs: [test]
    runs-on: ubuntu-latest
    outputs:
      status: ${{ steps.build.outcome }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm ci
      - id: build
        run: npm run build
```

**使用方式**：
```yaml
# 在你的工作仓库 af/working-repo/.github/workflows/main.yml
name: Main

on: [push]

jobs:
  # 使用 reusable workflow
  ci:
    uses: af/actions-packages/.github/workflows/reusable-ci.yml@v1.0.0
    with:
      node-version: '18.x'
      run-lint: true
    secrets:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}

  # 可以在 CI 完成后继续其他 jobs
  deploy:
    needs: ci
    runs-on: ubuntu-latest
    steps:
      - name: Deploy
        run: echo "Deploying..."
```

---

## 🎯 使用场景对比

### 适合用 Composite Action 的场景：

✅ **重复的步骤组合**
```yaml
# 例如：每个项目都要做的 setup
- checkout 代码
- setup Node.js
- 安装依赖
- 配置缓存
```

✅ **小而专注的功能**
```yaml
# 例如：发送通知
- 格式化消息
- 调用 API
- 处理错误
```

✅ **需要在同一个 runner 中执行**
```yaml
# 例如：需要共享文件系统
- 生成文件
- 处理文件
- 上传文件
```

✅ **简单的参数和逻辑**
```yaml
# inputs 和 outputs 比较简单
inputs:
  version: '1.0.0'
  path: './dist'
```

### 适合用 Reusable Workflow 的场景：

✅ **完整的 CI/CD 流程**
```yaml
# 例如：标准的测试流程
jobs:
  lint: ...
  test: ...
  build: ...
  security-scan: ...
```

✅ **需要多个 runners**
```yaml
# 例如：跨平台测试
jobs:
  test-linux:
    runs-on: ubuntu-latest
  test-windows:
    runs-on: windows-latest
  test-macos:
    runs-on: macos-latest
```

✅ **复杂的依赖关系**
```yaml
jobs:
  build:
    needs: [lint, test]
  deploy-staging:
    needs: build
  deploy-production:
    needs: deploy-staging
```

✅ **需要矩阵策略**
```yaml
jobs:
  test:
    strategy:
      matrix:
        node-version: [16, 18, 20]
        os: [ubuntu-latest, windows-latest]
```

---

## 💡 组合使用示例

**最佳实践：在 Reusable Workflow 中使用 Composite Actions**

```yaml
# af/actions-packages/.github/workflows/reusable-ci.yml
name: Reusable CI

on:
  workflow_call:
    inputs:
      node-version:
        type: string
        default: '18.x'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # 使用 composite action 来 setup 环境
      - name: Setup Node.js environment
        uses: af/actions-packages/setup-node-action@v1.0.0
        with:
          node-version: ${{ inputs.node-version }}

      - name: Run tests
        run: npm test

      # 使用另一个 composite action 来发送通知
      - name: Send notification
        if: failure()
        uses: af/actions-packages/notify-action@v1.0.0
        with:
          status: 'failed'
```

---

## 📊 实际示例对比

### 场景：设置 Node.js 环境并安装依赖

#### 使用 Composite Action：

**创建 action**：
```yaml
# af/actions-packages/setup-node/action.yml
name: 'Setup Node.js'
runs:
  using: 'composite'
  steps:
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ inputs.node-version }}
    - shell: bash
      run: npm ci
```

**使用**：
```yaml
steps:
  - uses: actions/checkout@v4
  - uses: af/actions-packages/setup-node@v1
    with:
      node-version: '18.x'
  - run: npm test  # 可以继续添加其他 steps
```

#### 使用 Reusable Workflow：

**创建 workflow**：
```yaml
# af/actions-packages/.github/workflows/setup-and-test.yml
on:
  workflow_call:
    inputs:
      node-version:
        type: string

jobs:
  setup-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm ci
      - run: npm test
```

**使用**：
```yaml
jobs:
  test:
    uses: af/actions-packages/.github/workflows/setup-and-test.yml@v1
    with:
      node-version: '18.x'
  # 如果需要添加其他逻辑，必须创建新的 job
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploy"
```

---

## 🤔 如何选择？

### 选择 Composite Action 如果：
- ✅ 你需要在现有 workflow 中插入可重用的步骤
- ✅ 逻辑比较简单，只是步骤的组合
- ✅ 需要在同一个 runner 环境中执行
- ✅ 想要更灵活地组合和插入到现有流程中

### 选择 Reusable Workflow 如果：
- ✅ 你需要定义完整的 CI/CD 流程
- ✅ 需要多个 jobs 和复杂的依赖关系
- ✅ 需要不同的运行环境（多个 runners）
- ✅ 需要使用矩阵策略
- ✅ 需要严格控制 secrets 的传递

---

## 🏗️ 推荐的仓库结构（混合使用）

```
af/actions-packages/
├── .github/workflows/           # Reusable Workflows
│   ├── reusable-ci.yml         # 完整的 CI 流程
│   ├── reusable-deploy.yml     # 完整的部署流程
│   └── reusable-security.yml   # 完整的安全扫描流程
│
├── setup-node/                  # Composite Action
│   └── action.yml              # 设置 Node.js 环境
│
├── setup-python/                # Composite Action
│   └── action.yml              # 设置 Python 环境
│
├── notify/                      # Composite Action
│   └── action.yml              # 发送通知
│
└── cache-deps/                  # Composite Action
    └── action.yml              # 缓存依赖
```

**使用示例**：
```yaml
# af/working-repo/.github/workflows/main.yml
jobs:
  # 使用 reusable workflow 做完整的 CI
  ci:
    uses: af/actions-packages/.github/workflows/reusable-ci.yml@v1

  # 自定义 job，使用 composite actions
  custom-task:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # 使用 composite action 设置环境
      - uses: af/actions-packages/setup-node@v1
        with:
          node-version: '18.x'

      # 自定义步骤
      - run: npm run custom-script

      # 使用 composite action 发送通知
      - uses: af/actions-packages/notify@v1
        if: success()
        with:
          message: 'Task completed!'
```

---

## 📝 总结建议

### 对于你的 `af/actions-packages` 仓库：

**推荐策略**：
1. **使用 Reusable Workflows** 作为主要方式
   - 提供标准的 CI/CD 流程
   - 例如：`reusable-ci.yml`, `reusable-deploy.yml`

2. **补充 Composite Actions** 用于通用步骤
   - 提供可复用的步骤组合
   - 例如：`setup-node`, `cache-deps`, `notify`

3. **在 Reusable Workflows 中使用 Composite Actions**
   - 让 workflows 更简洁
   - 提高代码复用性

**这样可以获得两者的优势！** 🎉
