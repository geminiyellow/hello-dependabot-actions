# 自动化配置脚本

让消费仓库一键配置使用私有 GitHub Actions！

## 📦 包含的脚本

### 1. `setup.sh` - 完整自动化安装 ⭐ 推荐

一键完成所有配置！

**功能：**
- ✅ 检查系统环境和依赖
- ✅ 自动检测或配置 PAT
- ✅ 生成 workflow 文件
- ✅ 生成配置文档
- ✅ 验证配置完整性
- ✅ 提供清晰的下一步指引

**使用方法：**

```bash
# 方法 1: 远程执行（推荐）
curl -sSL https://raw.githubusercontent.com/af/actions-packages/main/scripts/setup.sh | bash

# 方法 2: 本地执行
wget https://raw.githubusercontent.com/af/actions-packages/main/scripts/setup.sh
chmod +x setup.sh
./setup.sh

# 方法 3: 如果已经 clone 了仓库
cd your-repo
bash /path/to/actions-packages/scripts/setup.sh
```

**运行演示：**

```
🚀 Private GitHub Actions Setup Script
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This script will help you configure your repository to use
private GitHub Actions from: af/actions-packages

Continue? (y/n) y

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Checking Prerequisites
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ git is installed
✅ Current directory is a git repository
ℹ️  Repository: my-project
✅ GitHub CLI (gh) is installed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Generating Workflow File
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Workflow generated: .github/workflows/ci-with-private-actions.yml

...
```

---

### 2. `generate-workflow.sh` - Workflow 生成器

快速生成不同类型的 workflow 文件。

**使用方法：**

```bash
# 生成基本 CI workflow
./scripts/generate-workflow.sh

# 生成完整 CI/CD workflow
./scripts/generate-workflow.sh -t full -o .github/workflows/main.yml

# 生成仅测试的 workflow（用于 PR）
./scripts/generate-workflow.sh -t test-only -o .github/workflows/pr.yml

# 使用自定义配置
./scripts/generate-workflow.sh \
  -r myorg/my-actions \
  -v v2.0.0 \
  -s MY_CUSTOM_PAT \
  -t full
```

**可用参数：**

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-r, --repo` | Actions 仓库名称 | `af/actions-packages` |
| `-v, --version` | Actions 版本 | `v1.0.0` |
| `-s, --secret` | Secret 名称 | `AF_ACTIONS_PAT` |
| `-o, --output` | 输出文件路径 | `.github/workflows/ci-with-private-actions.yml` |
| `-t, --type` | Workflow 类型 | `basic` |
| `-h, --help` | 显示帮助 | - |

**Workflow 类型：**

- `basic` - 基本 CI（测试 + 构建）
- `full` - 完整 CI/CD（lint + 测试 + 构建 + 部署 + 通知）
- `test-only` - 仅测试（快速，用于 PR）

---

### 3. `verify-setup.sh` - 配置验证器

验证配置是否正确完整。

**使用方法：**

```bash
./scripts/verify-setup.sh
```

**检查项目：**

- ✅ Git 仓库检测
- ✅ GitHub CLI 安装和认证
- ✅ Workflow 文件存在和配置
- ✅ Secret 配置检查
- ✅ PAT 权限测试
- ✅ Node.js 项目配置

**运行演示：**

```
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   Private GitHub Actions Setup Verification                  ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Checking Git Repository
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Current directory is a git repository

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Checking Secret Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Secret 'AF_ACTIONS_PAT' is configured

...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Verification Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total Checks:    6
Passed:          5
Failed:          0
Warnings:        1

✅ All critical checks passed!

✨ Your repository is ready to use private GitHub Actions!
```

---

## 🚀 快速开始指南

### 对于消费仓库（microsb/working-repo）

#### 步骤 1：一键安装

在你的仓库根目录运行：

```bash
curl -sSL https://raw.githubusercontent.com/af/actions-packages/main/scripts/setup.sh | bash
```

#### 步骤 2：配置 PAT

如果脚本提示需要配置 PAT：

1. 生成 PAT：https://github.com/settings/tokens
   - 勾选 `repo` 权限

2. 添加到仓库 Secret：
   ```bash
   # 使用 gh CLI
   echo 'your_pat_here' | gh secret set AF_ACTIONS_PAT

   # 或者手动添加
   # Settings → Secrets and variables → Actions → New repository secret
   ```

#### 步骤 3：验证配置

```bash
./scripts/verify-setup.sh
```

#### 步骤 4：提交并推送

```bash
git add .github/
git commit -m "chore: setup private actions"
git push
```

#### 步骤 5：查看运行结果

访问你的仓库 Actions 标签页，查看 workflow 运行！

---

## 📝 使用场景

### 场景 1：新项目快速配置

```bash
# Clone 你的项目
git clone https://github.com/microsb/my-new-project
cd my-new-project

# 一键配置
curl -sSL https://raw.githubusercontent.com/af/actions-packages/main/scripts/setup.sh | bash

# 提交
git add .github/
git commit -m "chore: setup CI with private actions"
git push
```

### 场景 2：现有项目添加 workflow

```bash
# 进入现有项目
cd my-existing-project

# 生成特定类型的 workflow
./scripts/generate-workflow.sh -t full -o .github/workflows/main.yml

# 验证配置
./scripts/verify-setup.sh

# 提交
git add .github/workflows/main.yml
git commit -m "feat: add CI/CD workflow"
git push
```

### 场景 3：多个项目批量配置

```bash
#!/bin/bash
# batch-setup.sh

REPOS=(
  "microsb/project1"
  "microsb/project2"
  "microsb/project3"
)

for repo in "${REPOS[@]}"; do
  echo "Setting up $repo..."

  # Clone
  gh repo clone "$repo"
  cd "$(basename $repo)"

  # Setup
  curl -sSL https://raw.githubusercontent.com/af/actions-packages/main/scripts/setup.sh | bash -s -- --non-interactive

  # Commit and push
  git add .github/
  git commit -m "chore: setup private actions"
  git push

  cd ..
done
```

### 场景 4：CI/CD 模板化

```bash
# 为不同类型的项目生成不同的 workflow

# 前端项目
./scripts/generate-workflow.sh -t full -o .github/workflows/frontend.yml

# 后端项目
./scripts/generate-workflow.sh -t full -o .github/workflows/backend.yml

# PR 检查
./scripts/generate-workflow.sh -t test-only -o .github/workflows/pr-check.yml
```

---

## 🔧 高级用法

### 自定义 Actions 仓库

如果你的 actions 仓库不是 `af/actions-packages`：

```bash
# 方法 1: 使用环境变量
export ACTIONS_REPO="myorg/my-actions"
export ACTIONS_VERSION="v2.0.0"
export SECRET_NAME="MY_CUSTOM_PAT"

./scripts/setup.sh

# 方法 2: 直接修改脚本变量
# 编辑 setup.sh 文件，修改顶部的默认值
```

### 多个 Actions 仓库

如果需要使用多个私有 actions 仓库：

```bash
# 生成第一个
./scripts/generate-workflow.sh \
  -r org1/actions1 \
  -s ORG1_PAT \
  -o .github/workflows/ci1.yml

# 生成第二个
./scripts/generate-workflow.sh \
  -r org2/actions2 \
  -s ORG2_PAT \
  -o .github/workflows/ci2.yml
```

### 非交互式模式

在 CI/CD 或脚本中使用：

```bash
# 设置环境变量
export ACTIONS_REPO="af/actions-packages"
export ACTIONS_VERSION="v1.0.0"
export SECRET_NAME="AF_ACTIONS_PAT"
export PAT_TOKEN="ghp_your_token_here"

# 非交互式运行（需要修改脚本支持）
./scripts/setup.sh --non-interactive
```

---

## 🐛 故障排查

### 问题 1：脚本运行失败

```bash
# 检查权限
chmod +x scripts/*.sh

# 检查依赖
which git
which gh

# 查看详细输出
bash -x scripts/setup.sh
```

### 问题 2：Secret 配置失败

```bash
# 检查 gh CLI 认证
gh auth status

# 重新认证
gh auth login

# 手动设置 secret
gh secret set AF_ACTIONS_PAT
# 然后粘贴你的 PAT
```

### 问题 3：Workflow 无法访问私有仓库

```bash
# 验证 PAT 权限
gh api user -H "Authorization: token YOUR_PAT"

# 测试访问 actions 仓库
gh repo view af/actions-packages --token YOUR_PAT

# 确保 PAT 有 repo 权限
```

### 问题 4：生成的 workflow 不符合需求

```bash
# 手动编辑生成的文件
vim .github/workflows/ci-with-private-actions.yml

# 或者重新生成
./scripts/generate-workflow.sh -t full -o .github/workflows/ci.yml
```

---

## 📚 相关文档

- [跨组织私有访问完整指南](../CROSS_ORG_PRIVATE_ACCESS.md)
- [Composite Actions 文档](../composite-actions/README.md)
- [使用示例](../examples/cross-org-private-usage.yml)

---

## 🤝 贡献

欢迎改进这些脚本！

如果你有更好的想法或发现问题：
1. 提交 Issue
2. 发起 Pull Request
3. 分享你的使用经验

---

## 💡 提示

1. **首次使用推荐用 `setup.sh`**，它会引导你完成所有步骤
2. **熟悉后可以直接用 `generate-workflow.sh`** 快速生成特定类型的 workflow
3. **定期运行 `verify-setup.sh`** 确保配置正确
4. **保存好你的 PAT**，建议使用密码管理器
5. **为不同环境使用不同的 PAT**，提高安全性
