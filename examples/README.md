# 使用示例

本目录包含了如何在你的项目中使用这些可重用 workflows 的示例。

## 📁 示例文件

### 1. [simple-ci.yml](./simple-ci.yml)
最简单的 CI 示例，适合快速开始：
- 自动测试
- 自动构建
- 在 push 和 PR 时触发

**适用场景：** 简单的项目，只需要基本的 CI 功能

---

### 2. [full-cicd.yml](./full-cicd.yml)
完整的 CI/CD 流程示例，包含：
- 安全扫描
- 代码检查
- 测试和构建
- 多环境部署（staging + production）

**适用场景：** 生产环境项目，需要完整的质量保证和部署流程

---

### 3. [pr-check.yml](./pr-check.yml)
专门用于 Pull Request 检查：
- 代码质量检查
- 安全扫描
- 快速测试（跳过构建以节省时间）

**适用场景：** 团队协作项目，需要 PR 前的质量把关

---

### 4. [scheduled-security.yml](./scheduled-security.yml)
定时安全扫描：
- 每周自动运行
- 支持手动触发
- 发现漏洞时通知

**适用场景：** 所有项目，作为额外的安全保障

---

### 5. [private-org-usage.yml](./private-org-usage.yml) 🏢
私有组织内使用共享 workflows：
- 同组织内直接引用
- 组合多个可重用 workflows
- 完整的 CI/CD 流程

**适用场景：** 私有组织内的标准化 CI/CD

---

### 6. [cross-org-private-usage.yml](./cross-org-private-usage.yml) 🔐
跨组织使用私有 Composite Actions：
- 使用 PAT 访问私有仓库
- 使用 GitHub App Token（企业推荐）
- 带缓存优化
- 多个 Composite Actions 组合使用

**适用场景：** Actions 仓库和消费仓库在不同组织

---

## 🚀 如何使用

1. **选择适合你的示例**
2. **复制示例内容到你的项目**
   ```bash
   # 在你的项目根目录
   mkdir -p .github/workflows
   # 复制示例内容到 .github/workflows/ci.yml
   ```

3. **根据需要修改参数**
   - Node.js 版本
   - 工作目录
   - 触发条件
   - 等等...

4. **配置必要的 Secrets**
   - 进入你的仓库 Settings → Secrets and variables → Actions
   - 添加需要的密钥（如 `NPM_TOKEN`, `DEPLOY_TOKEN` 等）

5. **提交并推送**
   ```bash
   git add .github/workflows/
   git commit -m "Add GitHub Actions workflow"
   git push
   ```

## 💡 组合使用

你可以根据项目需求组合使用多个示例：

```yaml
# .github/workflows/pr.yml
# PR 检查（使用 pr-check.yml 的内容）

# .github/workflows/main.yml
# 主分支的完整 CI/CD（使用 full-cicd.yml 的内容）

# .github/workflows/security.yml
# 定时安全扫描（使用 scheduled-security.yml 的内容）
```

## 📚 更多信息

- [完整使用文档](../WORKFLOWS_USAGE.md)
- [项目主页](../README.md)
