# 高级权限场景与解决方案

现实生产环境中的复杂权限问题及解决方案

## 📋 目录

1. [动态权限 (ABAC)](#动态权限-abac)
2. [数据级权限](#数据级权限)
3. [字段级权限](#字段级权限)
4. [临时权限与委托](#临时权限与委托)
5. [职责分离 (SOD)](#职责分离-sod)
6. [权限继承冲突](#权限继承冲突)
7. [跨系统权限](#跨系统权限)
8. [权限审批流](#权限审批流)
9. [合规性要求](#合规性要求)
10. [性能优化](#性能优化)

---

## 动态权限 (ABAC)

**Attribute-Based Access Control - 基于属性的访问控制**

### 问题场景

RBAC 只考虑"谁"、"什么资源"、"什么权限"，但现实中还需要考虑：
- **何时**：工作时间才能访问
- **何地**：只能在办公室访问
- **何设备**：只能从公司设备访问
- **什么状态**：只能访问进行中的项目，已关闭的不能修改

### 解决方案：扩展为 ABAC

```typescript
interface AccessContext {
  // 时间属性
  currentTime: Date;
  isWorkingHours: boolean;

  // 地理位置属性
  ipAddress: string;
  country: string;
  isInOffice: boolean;

  // 设备属性
  deviceType: 'desktop' | 'mobile' | 'tablet';
  isTrustedDevice: boolean;
  deviceId?: string;

  // 数据属性
  resourceAttributes: {
    status?: 'draft' | 'active' | 'archived';
    department?: string;
    classification?: 'public' | 'internal' | 'confidential' | 'secret';
    ownerId?: string;
    createdAt?: Date;
  };

  // 用户属性
  userAttributes: {
    employeeLevel: number;
    department: string;
    clearanceLevel: number;
    isContractor: boolean;
  };
}

interface PolicyRule {
  id: string;
  name: string;
  description: string;
  conditions: PolicyCondition[];
  effect: 'allow' | 'deny';
  priority: number;
}

interface PolicyCondition {
  type: 'time' | 'location' | 'device' | 'attribute';
  operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'in' | 'notIn';
  field: string;
  value: any;
}
```

### 实现示例

```typescript
class ABACEvaluator extends PermissionEvaluator {
  /**
   * 扩展权限检查，考虑上下文
   */
  async checkPermissionWithContext(
    userId: string,
    resourceId: string,
    requiredPermission: PermissionBits,
    context: AccessContext
  ): Promise<PermissionCheckResult> {
    // 1. 先执行基本 RBAC 检查
    const basicResult = await this.checkPermission(
      userId,
      resourceId,
      requiredPermission
    );

    if (!basicResult.allowed) {
      return basicResult;
    }

    // 2. 应用策略规则
    const policies = await this.getApplicablePolicies(userId, resourceId);

    for (const policy of policies) {
      const policyResult = this.evaluatePolicy(policy, context);

      if (policyResult.effect === 'deny') {
        return {
          allowed: false,
          effectivePermission: PermissionFlags.NONE,
          source: 'policy',
          reason: `Denied by policy: ${policy.name} - ${policyResult.reason}`,
        };
      }
    }

    return basicResult;
  }

  /**
   * 评估策略
   */
  private evaluatePolicy(
    policy: PolicyRule,
    context: AccessContext
  ): { effect: 'allow' | 'deny'; reason?: string } {
    // 所有条件都必须满足
    for (const condition of policy.conditions) {
      if (!this.evaluateCondition(condition, context)) {
        return {
          effect: policy.effect,
          reason: `Condition not met: ${condition.field} ${condition.operator} ${condition.value}`,
        };
      }
    }

    return { effect: policy.effect };
  }

  /**
   * 评估单个条件
   */
  private evaluateCondition(
    condition: PolicyCondition,
    context: AccessContext
  ): boolean {
    const actualValue = this.getContextValue(condition.field, context);

    switch (condition.operator) {
      case 'equals':
        return actualValue === condition.value;

      case 'greaterThan':
        return actualValue > condition.value;

      case 'lessThan':
        return actualValue < condition.value;

      case 'in':
        return Array.isArray(condition.value) &&
               condition.value.includes(actualValue);

      case 'contains':
        return String(actualValue).includes(String(condition.value));

      default:
        return false;
    }
  }

  /**
   * 获取上下文值
   */
  private getContextValue(field: string, context: AccessContext): any {
    const parts = field.split('.');
    let value: any = context;

    for (const part of parts) {
      value = value?.[part];
    }

    return value;
  }
}
```

### 策略示例

```typescript
// 示例 1: 工作时间限制
const workingHoursPolicy: PolicyRule = {
  id: 'policy-working-hours',
  name: '工作时间访问限制',
  description: '敏感数据只能在工作时间访问',
  conditions: [
    {
      type: 'time',
      operator: 'equals',
      field: 'isWorkingHours',
      value: true,
    },
    {
      type: 'attribute',
      operator: 'in',
      field: 'resourceAttributes.classification',
      value: ['confidential', 'secret'],
    },
  ],
  effect: 'deny',
  priority: 100,
};

// 示例 2: 地理位置限制
const officeOnlyPolicy: PolicyRule = {
  id: 'policy-office-only',
  name: '办公室访问限制',
  description: '机密文件只能在办公室访问',
  conditions: [
    {
      type: 'location',
      operator: 'equals',
      field: 'isInOffice',
      value: true,
    },
    {
      type: 'attribute',
      operator: 'equals',
      field: 'resourceAttributes.classification',
      value: 'secret',
    },
  ],
  effect: 'deny',
  priority: 100,
};

// 示例 3: 数据所有者检查
const dataOwnerPolicy: PolicyRule = {
  id: 'policy-data-owner',
  name: '数据所有者限制',
  description: '只能修改自己的数据',
  conditions: [
    {
      type: 'attribute',
      operator: 'equals',
      field: 'resourceAttributes.ownerId',
      value: '{{userId}}', // 动态替换
    },
  ],
  effect: 'allow',
  priority: 50,
};
```

---

## 数据级权限

**Row-Level Security - 行级安全**

### 问题场景

用户可以访问"客户表"，但只能看到：
- 销售员：只能看自己负责的客户
- 销售经理：能看整个团队的客户
- 地区总监：能看整个地区的客户
- 财务：只能看已付款的客户

### 解决方案：数据过滤规则

```typescript
interface DataFilter {
  id: string;
  resourceType: string;
  subjectId: string;
  subjectType: 'user' | 'group' | 'role';
  filterType: 'sql' | 'function' | 'template';
  filterExpression: string | Function;
  priority: number;
}

class DataLevelPermissionManager {
  /**
   * 获取用户对资源类型的数据过滤器
   */
  async getDataFilters(
    userId: string,
    resourceType: string
  ): Promise<DataFilter[]> {
    const user = await this.dataStore.getUser(userId);
    const groups = await this.dataStore.getUserGroups(userId);

    const filters: DataFilter[] = [];

    // 1. 用户级过滤器
    const userFilters = await this.dataStore.getDataFilters({
      resourceType,
      subjectId: userId,
      subjectType: 'user',
    });
    filters.push(...userFilters);

    // 2. 组级过滤器
    for (const group of groups) {
      const groupFilters = await this.dataStore.getDataFilters({
        resourceType,
        subjectId: group.id,
        subjectType: 'group',
      });
      filters.push(...groupFilters);
    }

    // 3. 角色级过滤器
    const roles = await this.getUserRoles(userId);
    for (const role of roles) {
      const roleFilters = await this.dataStore.getDataFilters({
        resourceType,
        subjectId: role.id,
        subjectType: 'role',
      });
      filters.push(...roleFilters);
    }

    // 按优先级排序
    return filters.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 应用数据过滤器到 SQL 查询
   */
  async applySQLFilters(
    userId: string,
    resourceType: string,
    baseQuery: string
  ): Promise<string> {
    const filters = await this.getDataFilters(userId, resourceType);

    if (filters.length === 0) {
      // 没有过滤器，默认拒绝
      return `${baseQuery} WHERE 1=0`;
    }

    const conditions: string[] = [];

    for (const filter of filters) {
      if (filter.filterType === 'sql') {
        let expression = String(filter.filterExpression);

        // 替换变量
        expression = expression.replace(/\{\{userId\}\}/g, userId);

        conditions.push(`(${expression})`);
      }
    }

    // 使用 OR 连接多个过滤器（满足任一即可）
    const filterClause = conditions.join(' OR ');

    return `${baseQuery} WHERE ${filterClause}`;
  }

  /**
   * 应用数据过滤器到对象数组
   */
  async applyObjectFilters<T>(
    userId: string,
    resourceType: string,
    data: T[]
  ): Promise<T[]> {
    const filters = await this.getDataFilters(userId, resourceType);

    if (filters.length === 0) {
      return []; // 没有过滤器，返回空
    }

    return data.filter(item => {
      // 满足任一过滤器即可
      return filters.some(filter => {
        if (filter.filterType === 'function') {
          const filterFn = filter.filterExpression as Function;
          return filterFn(item, userId);
        }
        return false;
      });
    });
  }
}
```

### 使用示例

```typescript
// 定义数据过滤规则

// 销售员：只看自己的客户
const salesPersonFilter: DataFilter = {
  id: 'filter-salesperson',
  resourceType: 'customer',
  subjectId: 'role-salesperson',
  subjectType: 'role',
  filterType: 'sql',
  filterExpression: 'sales_person_id = {{userId}}',
  priority: 10,
};

// 销售经理：看整个团队的客户
const salesManagerFilter: DataFilter = {
  id: 'filter-sales-manager',
  resourceType: 'customer',
  subjectId: 'role-sales-manager',
  subjectType: 'role',
  filterType: 'sql',
  filterExpression: `
    sales_person_id IN (
      SELECT user_id FROM team_members
      WHERE manager_id = {{userId}}
    ) OR sales_person_id = {{userId}}
  `,
  priority: 20,
};

// 地区总监：看整个地区的客户
const regionalDirectorFilter: DataFilter = {
  id: 'filter-regional-director',
  resourceType: 'customer',
  subjectId: 'role-regional-director',
  subjectType: 'role',
  filterType: 'sql',
  filterExpression: `
    region = (
      SELECT region FROM users WHERE id = {{userId}}
    )
  `,
  priority: 30,
};

// 在查询中使用
const manager = new DataLevelPermissionManager(dataStore);

// 自动添加过滤条件
const filteredQuery = await manager.applySQLFilters(
  userId,
  'customer',
  'SELECT * FROM customers'
);
// 结果: SELECT * FROM customers WHERE (sales_person_id = 'user-123' OR ...)

// 或在应用层过滤
const customers = await db.query('SELECT * FROM customers');
const visibleCustomers = await manager.applyObjectFilters(
  userId,
  'customer',
  customers
);
```

---

## 字段级权限

**Column-Level Security - 列级安全**

### 问题场景

HR 可以看员工信息，但：
- 基本信息：所有 HR 可见
- 薪资信息：只有薪资专员可见
- 绩效评分：只有主管和更高级别可见
- 身份证号：需要特殊审批才能查看

### 解决方案

```typescript
interface FieldPermission {
  id: string;
  resourceType: string;
  fieldName: string;
  subjectId: string;
  subjectType: 'user' | 'group' | 'role';
  permission: 'read' | 'write' | 'mask' | 'deny';
  maskingRule?: MaskingRule;
}

interface MaskingRule {
  type: 'partial' | 'full' | 'hash' | 'custom';
  // partial: 部分遮蔽，如 "张***"
  partialConfig?: {
    visibleStart?: number;
    visibleEnd?: number;
    maskChar?: string;
  };
  // custom: 自定义函数
  customFn?: (value: any) => any;
}

class FieldLevelPermissionManager {
  /**
   * 过滤对象字段
   */
  async filterFields<T extends object>(
    userId: string,
    resourceType: string,
    data: T | T[],
    operation: 'read' | 'write'
  ): Promise<T | T[]> {
    const isArray = Array.isArray(data);
    const items = isArray ? data : [data];

    const fieldPermissions = await this.getFieldPermissions(
      userId,
      resourceType
    );

    const filtered = items.map(item => {
      const result: any = {};

      for (const [key, value] of Object.entries(item)) {
        const permission = this.getFieldPermission(
          key,
          fieldPermissions,
          operation
        );

        if (permission === 'deny') {
          // 完全不返回这个字段
          continue;
        } else if (permission === 'mask') {
          // 脱敏处理
          const maskingRule = this.getMaskingRule(key, fieldPermissions);
          result[key] = this.maskValue(value, maskingRule);
        } else {
          // 正常返回
          result[key] = value;
        }
      }

      return result as T;
    });

    return isArray ? filtered : filtered[0];
  }

  /**
   * 脱敏处理
   */
  private maskValue(value: any, rule?: MaskingRule): any {
    if (!rule || value === null || value === undefined) {
      return value;
    }

    switch (rule.type) {
      case 'full':
        return '***';

      case 'partial':
        const str = String(value);
        const config = rule.partialConfig || {};
        const start = config.visibleStart || 1;
        const end = config.visibleEnd || 1;
        const maskChar = config.maskChar || '*';

        if (str.length <= start + end) {
          return maskChar.repeat(str.length);
        }

        const visibleStart = str.substring(0, start);
        const visibleEnd = str.substring(str.length - end);
        const masked = maskChar.repeat(str.length - start - end);

        return visibleStart + masked + visibleEnd;

      case 'hash':
        return this.hashValue(value);

      case 'custom':
        return rule.customFn ? rule.customFn(value) : value;

      default:
        return value;
    }
  }

  private hashValue(value: any): string {
    // 简单哈希示例，实际应使用加密库
    return `HASH_${btoa(String(value)).substring(0, 8)}`;
  }
}
```

### 使用示例

```typescript
// 配置字段权限

// 普通 HR：基本信息可见，敏感信息脱敏
const hrFieldPermissions: FieldPermission[] = [
  {
    id: 'fp-1',
    resourceType: 'employee',
    fieldName: 'name',
    subjectId: 'role-hr',
    subjectType: 'role',
    permission: 'read',
  },
  {
    id: 'fp-2',
    resourceType: 'employee',
    fieldName: 'salary',
    subjectId: 'role-hr',
    subjectType: 'role',
    permission: 'deny', // 完全不可见
  },
  {
    id: 'fp-3',
    resourceType: 'employee',
    fieldName: 'idNumber',
    subjectId: 'role-hr',
    subjectType: 'role',
    permission: 'mask',
    maskingRule: {
      type: 'partial',
      partialConfig: {
        visibleStart: 4,
        visibleEnd: 4,
        maskChar: '*',
      },
    },
  },
];

// 薪资专员：可以看薪资
const payrollFieldPermissions: FieldPermission[] = [
  {
    id: 'fp-4',
    resourceType: 'employee',
    fieldName: 'salary',
    subjectId: 'role-payroll',
    subjectType: 'role',
    permission: 'read',
  },
];

// 使用
const manager = new FieldLevelPermissionManager(dataStore);

const employee = {
  id: 'emp-123',
  name: '张三',
  idNumber: '110101199001011234',
  salary: 15000,
  department: 'Engineering',
};

// 普通 HR 查看
const hrView = await manager.filterFields(
  'hr-user-1',
  'employee',
  employee,
  'read'
);
// 结果:
// {
//   id: 'emp-123',
//   name: '张三',
//   idNumber: '1101**********1234',  // 脱敏
//   department: 'Engineering'
//   // salary 字段被完全移除
// }

// 薪资专员查看
const payrollView = await manager.filterFields(
  'payroll-user-1',
  'employee',
  employee,
  'read'
);
// 结果:
// {
//   id: 'emp-123',
//   name: '张三',
//   idNumber: '1101**********1234',
//   salary: 15000,  // 可以看到
//   department: 'Engineering'
// }
```

---

## 临时权限与委托

### 问题场景

1. **请假委托**：经理请假，临时把审批权限委托给副经理
2. **紧急访问**：晚上紧急bug，开发需要临时访问生产数据库
3. **临时协作**：跨团队项目，临时授予外部团队成员访问权限
4. **会议权限**：会议期间临时授予参会者访问文档的权限

### 解决方案

```typescript
interface DelegatedPermission {
  id: string;
  tenantId: string;
  delegatorId: string;        // 委托人
  delegateeId: string;        // 受托人
  resourceId?: string;        // 特定资源（可选，null表示所有）
  permissions: PermissionBits;
  startTime: Date;
  endTime: Date;
  reason: string;
  requireApproval: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approverId?: string;
  revokedAt?: Date;
  metadata: {
    autoRevoke?: boolean;     // 是否自动撤销
    maxUsageCount?: number;   // 最大使用次数
    usageCount?: number;      // 已使用次数
  };
  createdAt: Date;
}

class DelegationManager {
  /**
   * 创建权限委托
   */
  async createDelegation(
    delegatorId: string,
    delegateeId: string,
    resourceId: string | null,
    permissions: PermissionBits,
    duration: number, // 毫秒
    reason: string,
    requireApproval: boolean = true
  ): Promise<DelegatedPermission> {
    // 1. 验证委托人是否有权限
    if (resourceId) {
      const hasPermission = await this.evaluator.checkPermission(
        delegatorId,
        resourceId,
        permissions
      );

      if (!hasPermission.allowed) {
        throw new Error('Delegator does not have the permissions to delegate');
      }
    }

    // 2. 创建委托记录
    const delegation: DelegatedPermission = {
      id: this.generateId(),
      tenantId: await this.getUserTenant(delegatorId),
      delegatorId,
      delegateeId,
      resourceId: resourceId || undefined,
      permissions,
      startTime: new Date(),
      endTime: new Date(Date.now() + duration),
      reason,
      requireApproval,
      approvalStatus: requireApproval ? 'pending' : 'approved',
      metadata: {
        autoRevoke: true,
        usageCount: 0,
      },
      createdAt: new Date(),
    };

    await this.dataStore.saveDelegation(delegation);

    // 3. 如果需要审批，发送通知
    if (requireApproval) {
      await this.sendApprovalRequest(delegation);
    }

    // 4. 清除受托人的权限缓存
    this.evaluator.invalidateCache(delegateeId);

    return delegation;
  }

  /**
   * 审批委托
   */
  async approveDelegation(
    delegationId: string,
    approverId: string,
    approved: boolean,
    comment?: string
  ): Promise<void> {
    const delegation = await this.dataStore.getDelegation(delegationId);

    if (!delegation) {
      throw new Error('Delegation not found');
    }

    // 验证审批人权限
    const canApprove = await this.canApproveDelegation(approverId, delegation);
    if (!canApprove) {
      throw new Error('Not authorized to approve this delegation');
    }

    // 更新状态
    delegation.approvalStatus = approved ? 'approved' : 'rejected';
    delegation.approverId = approverId;

    await this.dataStore.updateDelegation(delegation);

    // 清除缓存
    this.evaluator.invalidateCache(delegation.delegateeId);

    // 发送通知
    await this.sendApprovalNotification(delegation, approved, comment);
  }

  /**
   * 撤销委托
   */
  async revokeDelegation(delegationId: string, revokerId: string): Promise<void> {
    const delegation = await this.dataStore.getDelegation(delegationId);

    if (!delegation) {
      throw new Error('Delegation not found');
    }

    // 只有委托人或管理员可以撤销
    const canRevoke = revokerId === delegation.delegatorId ||
                     await this.isAdmin(revokerId);

    if (!canRevoke) {
      throw new Error('Not authorized to revoke this delegation');
    }

    delegation.revokedAt = new Date();
    await this.dataStore.updateDelegation(delegation);

    // 清除缓存
    this.evaluator.invalidateCache(delegation.delegateeId);

    // 记录审计日志
    await this.auditLogger.log({
      userId: revokerId,
      action: 'delegation_revoked',
      metadata: { delegationId },
      tenantId: delegation.tenantId,
      result: 'success',
    });
  }

  /**
   * 检查委托权限
   */
  async checkDelegatedPermission(
    userId: string,
    resourceId: string,
    requiredPermission: PermissionBits
  ): Promise<PermissionCheckResult | null> {
    const delegations = await this.getActiveDelegations(userId, resourceId);

    for (const delegation of delegations) {
      // 检查是否满足所需权限
      if ((delegation.permissions & requiredPermission) === requiredPermission) {
        // 检查使用次数限制
        if (delegation.metadata.maxUsageCount) {
          if (delegation.metadata.usageCount! >= delegation.metadata.maxUsageCount) {
            continue; // 已达到使用次数上限
          }
        }

        // 增加使用次数
        delegation.metadata.usageCount = (delegation.metadata.usageCount || 0) + 1;
        await this.dataStore.updateDelegation(delegation);

        return {
          allowed: true,
          effectivePermission: delegation.permissions,
          source: 'delegation' as any,
          reason: `Delegated by ${delegation.delegatorId}`,
        };
      }
    }

    return null;
  }

  /**
   * 获取有效的委托
   */
  private async getActiveDelegations(
    userId: string,
    resourceId: string
  ): Promise<DelegatedPermission[]> {
    const now = new Date();

    const delegations = await this.dataStore.getDelegations({
      delegateeId: userId,
      approvalStatus: 'approved',
    });

    return delegations.filter(d => {
      // 检查时间范围
      if (d.startTime > now || d.endTime < now) {
        return false;
      }

      // 检查是否已撤销
      if (d.revokedAt) {
        return false;
      }

      // 检查资源匹配
      if (d.resourceId && d.resourceId !== resourceId) {
        return false;
      }

      return true;
    });
  }

  /**
   * 自动清理过期委托
   */
  async cleanupExpiredDelegations(): Promise<void> {
    const now = new Date();

    const expiredDelegations = await this.dataStore.getDelegations({
      endTimeBefore: now,
      autoRevoke: true,
      revokedAt: null,
    });

    for (const delegation of expiredDelegations) {
      delegation.revokedAt = now;
      await this.dataStore.updateDelegation(delegation);

      // 清除缓存
      this.evaluator.invalidateCache(delegation.delegateeId);
    }
  }
}
```

### 使用示例

```typescript
const delegationMgr = new DelegationManager(dataStore, evaluator, auditLogger);

// 场景 1: 经理请假，委托审批权限
await delegationMgr.createDelegation(
  'manager-123',           // 委托人（经理）
  'vice-manager-456',      // 受托人（副经理）
  null,                    // 所有资源
  PermissionFlags.WRITE | PermissionFlags.ADMIN,  // 审批权限
  7 * 24 * 60 * 60 * 1000, // 7天
  '请假期间临时委托审批权限',
  false                    // 不需要审批（因为是自己的权限）
);

// 场景 2: 紧急访问生产数据库
const emergencyAccess = await delegationMgr.createDelegation(
  'dba-admin',
  'developer-789',
  'resource-prod-db',
  PermissionFlags.READ,
  2 * 60 * 60 * 1000,      // 2小时
  '紧急修复生产bug',
  true                     // 需要审批
);

// DBA 审批
await delegationMgr.approveDelegation(
  emergencyAccess.id,
  'dba-admin',
  true,  // 批准
  '已确认是紧急情况，批准2小时访问'
);

// 场景 3: 限制使用次数的临时权限
await delegationMgr.createDelegation(
  'owner-123',
  'contractor-999',
  'resource-doc-456',
  PermissionFlags.READ,
  30 * 24 * 60 * 60 * 1000, // 30天
  '外包人员临时查看文档',
  true,
  {
    maxUsageCount: 10,  // 最多查看10次
  }
);

// 定时清理过期委托
setInterval(async () => {
  await delegationMgr.cleanupExpiredDelegations();
}, 60 * 60 * 1000); // 每小时清理一次
```

---

## 职责分离 (SOD)

**Segregation of Duties - 防止权限滥用**

### 问题场景

金融系统中的经典案例：
- 同一人不能既创建付款又审批付款
- 同一人不能既开发代码又部署到生产环境
- 同一人不能既创建用户又分配管理员权限

### 解决方案

```typescript
interface SODRule {
  id: string;
  name: string;
  description: string;
  conflictingPermissions: Array<{
    resourceType: string;
    permission: PermissionBits;
  }>;
  enforcement: 'hard' | 'soft';  // hard: 禁止, soft: 警告
  exemptions?: string[];          // 豁免的用户/角色
}

class SODManager {
  /**
   * 检查 SOD 冲突
   */
  async checkSODConflict(
    userId: string,
    resourceId: string,
    requestedPermission: PermissionBits,
    action: string
  ): Promise<{
    hasConflict: boolean;
    conflictingRules: SODRule[];
    canProceed: boolean;
    warnings: string[];
  }> {
    const user = await this.dataStore.getUser(userId);
    const resource = await this.dataStore.getResource(resourceId);

    // 获取适用的 SOD 规则
    const applicableRules = await this.getApplicableSODRules(
      resource.type
    );

    const conflictingRules: SODRule[] = [];
    const warnings: string[] = [];

    for (const rule of applicableRules) {
      // 检查用户是否有豁免权
      if (await this.hasExemption(userId, rule)) {
        continue;
      }

      // 检查是否存在冲突
      const hasConflict = await this.detectConflict(
        userId,
        resourceId,
        requestedPermission,
        rule
      );

      if (hasConflict) {
        conflictingRules.push(rule);

        if (rule.enforcement === 'soft') {
          warnings.push(
            `Warning: ${rule.name} - ${rule.description}`
          );
        }
      }
    }

    // 判断是否可以继续
    const hardConflicts = conflictingRules.filter(
      r => r.enforcement === 'hard'
    );

    return {
      hasConflict: conflictingRules.length > 0,
      conflictingRules,
      canProceed: hardConflicts.length === 0,
      warnings,
    };
  }

  /**
   * 检测冲突
   */
  private async detectConflict(
    userId: string,
    resourceId: string,
    requestedPermission: PermissionBits,
    rule: SODRule
  ): Promise<boolean> {
    // 检查用户已有的权限
    const userPermissions = await this.getUserAllPermissions(userId, resourceId);

    for (const conflict of rule.conflictingPermissions) {
      // 如果用户已有冲突权限之一，且现在请求另一个冲突权限
      const hasConflictPerm = (userPermissions & conflict.permission) !== 0;
      const requestsConflictPerm = (requestedPermission & conflict.permission) !== 0;

      if (hasConflictPerm && requestsConflictPerm) {
        return true;
      }
    }

    return false;
  }

  /**
   * 记录 SOD 违规
   */
  async recordSODViolation(
    userId: string,
    resourceId: string,
    rule: SODRule,
    action: string,
    approved: boolean
  ): Promise<void> {
    await this.auditLogger.log({
      userId,
      resourceId,
      action: 'sod_violation',
      result: approved ? 'approved' : 'denied',
      metadata: {
        ruleId: rule.id,
        ruleName: rule.name,
        enforcementType: rule.enforcement,
      },
      tenantId: await this.getUserTenant(userId),
    });

    // 如果是硬性规则违规，发送警报
    if (rule.enforcement === 'hard' && !approved) {
      await this.sendSODAlert(userId, rule);
    }
  }
}
```

### SOD 规则示例

```typescript
// 规则 1: 创建和审批分离
const createApprovalSOD: SODRule = {
  id: 'sod-create-approve',
  name: '创建和审批分离',
  description: '同一用户不能既创建付款单又审批付款单',
  conflictingPermissions: [
    {
      resourceType: 'payment',
      permission: PermissionFlags.WRITE,  // 创建
    },
    {
      resourceType: 'payment',
      permission: PermissionFlags.ADMIN,  // 审批
    },
  ],
  enforcement: 'hard',
};

// 规则 2: 开发和部署分离
const devDeploySOD: SODRule = {
  id: 'sod-dev-deploy',
  name: '开发和部署分离',
  description: '同一开发者不能将自己的代码部署到生产环境',
  conflictingPermissions: [
    {
      resourceType: 'code',
      permission: PermissionFlags.WRITE,    // 开发
    },
    {
      resourceType: 'production',
      permission: PermissionFlags.EXECUTE,  // 部署
    },
  ],
  enforcement: 'soft',  // 警告但不禁止
  exemptions: ['role-devops-lead'],  // DevOps 负责人豁免
};

// 使用
const sodMgr = new SODManager(dataStore, auditLogger);

// 在分配权限前检查
const result = await sodMgr.checkSODConflict(
  'user-123',
  'payment-456',
  PermissionFlags.ADMIN,
  'approve_payment'
);

if (!result.canProceed) {
  throw new Error(
    `SOD violation: Cannot grant permission due to conflicts with: ${
      result.conflictingRules.map(r => r.name).join(', ')
    }`
  );
}

if (result.warnings.length > 0) {
  console.warn('SOD warnings:', result.warnings);
  // 记录但允许继续
}
```

---

---

## 权限审批流

### 问题场景

- 员工申请访问某个系统/资源
- 需要经过主管 → 部门经理 → IT 安全审批
- 不同资源需要不同的审批流程
- 审批可能被拒绝或需要补充信息

### 解决方案

```typescript
interface ApprovalWorkflow {
  id: string;
  resourceType: string;
  permissionLevel: PermissionBits;
  steps: ApprovalStep[];
  metadata: {
    autoExpire?: number;      // 自动过期时间（天）
    requireAllApprovals: boolean;  // 是否需要所有步骤批准
  };
}

interface ApprovalStep {
  order: number;
  approverType: 'user' | 'role' | 'group' | 'manager';
  approverId?: string;
  autoApprove?: boolean;
  timeoutHours?: number;
  escalationTo?: string;    // 超时后升级给谁
}

interface PermissionRequest {
  id: string;
  requesterId: string;
  resourceId: string;
  requestedPermission: PermissionBits;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  currentStep: number;
  approvals: Approval[];
  createdAt: Date;
  expiresAt?: Date;
}

interface Approval {
  stepOrder: number;
  approverId: string;
  status: 'pending' | 'approved' | 'rejected';
  comment?: string;
  approvedAt?: Date;
}

class ApprovalWorkflowManager {
  /**
   * 创建权限申请
   */
  async createPermissionRequest(
    requesterId: string,
    resourceId: string,
    requestedPermission: PermissionBits,
    reason: string
  ): Promise<PermissionRequest> {
    const resource = await this.dataStore.getResource(resourceId);

    // 获取适用的审批流程
    const workflow = await this.getWorkflow(
      resource.type,
      requestedPermission
    );

    if (!workflow) {
      throw new Error('No approval workflow found for this resource type');
    }

    // 创建申请
    const request: PermissionRequest = {
      id: this.generateId(),
      requesterId,
      resourceId,
      requestedPermission,
      reason,
      status: 'pending',
      currentStep: 1,
      approvals: workflow.steps.map(step => ({
        stepOrder: step.order,
        approverId: await this.resolveApproverId(step, requesterId),
        status: 'pending',
      })),
      createdAt: new Date(),
      expiresAt: workflow.metadata.autoExpire
        ? new Date(Date.now() + workflow.metadata.autoExpire * 24 * 60 * 60 * 1000)
        : undefined,
    };

    await this.dataStore.savePermissionRequest(request);

    // 发送通知给第一个审批人
    await this.notifyNextApprover(request);

    return request;
  }

  /**
   * 处理审批
   */
  async processApproval(
    requestId: string,
    approverId: string,
    approved: boolean,
    comment?: string
  ): Promise<void> {
    const request = await this.dataStore.getPermissionRequest(requestId);

    if (!request || request.status !== 'pending') {
      throw new Error('Request not found or not pending');
    }

    // 查找当前步骤
    const currentApproval = request.approvals.find(
      a => a.stepOrder === request.currentStep && a.approverId === approverId
    );

    if (!currentApproval) {
      throw new Error('Not authorized to approve this step');
    }

    // 更新审批状态
    currentApproval.status = approved ? 'approved' : 'rejected';
    currentApproval.comment = comment;
    currentApproval.approvedAt = new Date();

    if (!approved) {
      // 拒绝 - 整个申请被拒绝
      request.status = 'rejected';

      await this.dataStore.updatePermissionRequest(request);

      // 通知申请人
      await this.notifyRequester(request, 'rejected');

      // 记录审计日志
      await this.auditLogger.log({
        userId: approverId,
        action: 'permission_request_rejected',
        resourceId: request.resourceId,
        result: 'success',
        metadata: { requestId, reason: comment },
        tenantId: await this.getUserTenant(approverId),
      });

      return;
    }

    // 批准 - 检查是否还有后续步骤
    if (request.currentStep < request.approvals.length) {
      // 进入下一步
      request.currentStep++;

      await this.dataStore.updatePermissionRequest(request);

      // 通知下一个审批人
      await this.notifyNextApprover(request);
    } else {
      // 所有步骤都批准了 - 授予权限
      request.status = 'approved';

      await this.dataStore.updatePermissionRequest(request);

      // 实际授予权限
      await this.grantPermission(request);

      // 通知申请人
      await this.notifyRequester(request, 'approved');

      // 记录审计日志
      await this.auditLogger.log({
        userId: approverId,
        action: 'permission_request_approved',
        resourceId: request.resourceId,
        result: 'success',
        metadata: { requestId },
        tenantId: await this.getUserTenant(approverId),
      });
    }
  }

  /**
   * 实际授予权限
   */
  private async grantPermission(request: PermissionRequest): Promise<void> {
    const permission: ResourcePermission = {
      id: this.generateId(),
      tenantId: await this.getUserTenant(request.requesterId),
      resourceId: request.resourceId,
      subjectId: request.requesterId,
      subjectType: 'user',
      permissions: request.requestedPermission,
      inherited: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.dataStore.saveResourcePermission(permission);

    // 清除缓存
    this.evaluator.invalidateCache(request.requesterId, request.resourceId);
  }

  /**
   * 解析审批人ID
   */
  private async resolveApproverId(
    step: ApprovalStep,
    requesterId: string
  ): Promise<string> {
    switch (step.approverType) {
      case 'user':
        return step.approverId!;

      case 'role':
        // 获取该角色的负责人
        return await this.getRoleOwner(step.approverId!);

      case 'manager':
        // 获取申请人的直属经理
        const user = await this.dataStore.getUser(requesterId);
        return user.metadata.managerId;

      default:
        throw new Error(`Unknown approver type: ${step.approverType}`);
    }
  }
}
```

### 审批流程示例

```typescript
// 定义审批流程

// 流程 1: 普通资源 - 只需主管批准
const basicWorkflow: ApprovalWorkflow = {
  id: 'wf-basic',
  resourceType: 'document',
  permissionLevel: PermissionFlags.READ | PermissionFlags.WRITE,
  steps: [
    {
      order: 1,
      approverType: 'manager',  // 直属经理
      timeoutHours: 48,
    },
  ],
  metadata: {
    requireAllApprovals: true,
    autoExpire: 90,  // 90天后自动过期
  },
};

// 流程 2: 敏感资源 - 多级审批
const sensitiveWorkflow: ApprovalWorkflow = {
  id: 'wf-sensitive',
  resourceType: 'customer_data',
  permissionLevel: PermissionFlags.READ,
  steps: [
    {
      order: 1,
      approverType: 'manager',  // 1. 直属经理
      timeoutHours: 24,
    },
    {
      order: 2,
      approverType: 'role',     // 2. 部门经理
      approverId: 'role-dept-manager',
      timeoutHours: 48,
    },
    {
      order: 3,
      approverType: 'role',     // 3. 安全团队
      approverId: 'role-security-team',
      timeoutHours: 72,
    },
  ],
  metadata: {
    requireAllApprovals: true,
    autoExpire: 30,  // 30天后自动过期
  },
};

// 使用
const workflowMgr = new ApprovalWorkflowManager(dataStore, evaluator, auditLogger);

// 员工申请权限
const request = await workflowMgr.createPermissionRequest(
  'employee-123',
  'resource-sensitive-data',
  PermissionFlags.READ,
  '需要访问客户数据进行分析报告'
);

// 第一步：经理审批
await workflowMgr.processApproval(
  request.id,
  'manager-456',
  true,
  '同意，该员工确实需要这些数据'
);

// 第二步：部门经理审批
await workflowMgr.processApproval(
  request.id,
  'dept-manager-789',
  true,
  '批准，项目需要'
);

// 第三步：安全团队审批
await workflowMgr.processApproval(
  request.id,
  'security-lead-999',
  true,
  '已验证用途正当，批准访问'
);

// 所有步骤通过后，权限自动授予
```

---

## 跨系统权限

### 问题场景

- 单点登录 (SSO) - 一次登录，多个系统
- OAuth/OIDC - 第三方应用访问
- 跨系统权限同步
- 联邦身份管理

### 解决方案

```typescript
interface ExternalIdentity {
  id: string;
  userId: string;           // 内部用户ID
  provider: string;         // 'google', 'microsoft', 'okta', etc.
  externalId: string;       // 外部系统的用户ID
  email: string;
  metadata: Record<string, any>;
  createdAt: Date;
  lastSyncAt?: Date;
}

interface OAuthClient {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  allowedScopes: string[];  // 允许申请的权限范围
  trustedClient: boolean;   // 是否是受信任的客户端
}

interface OAuthToken {
  id: string;
  userId: string;
  clientId: string;
  accessToken: string;
  refreshToken?: string;
  scopes: string[];
  expiresAt: Date;
  createdAt: Date;
}

class CrossSystemPermissionManager {
  /**
   * SSO 登录
   */
  async ssoLogin(
    provider: string,
    externalId: string,
    email: string,
    externalProfile: any
  ): Promise<{ user: User; token: string }> {
    // 1. 查找或创建外部身份映射
    let identity = await this.dataStore.getExternalIdentity(provider, externalId);

    if (!identity) {
      // 首次登录 - 创建或关联用户
      let user = await this.dataStore.getUserByEmail(email);

      if (!user) {
        // 自动创建用户
        user = await this.createUserFromExternal(provider, externalProfile);
      }

      // 创建身份映射
      identity = {
        id: this.generateId(),
        userId: user.id,
        provider,
        externalId,
        email,
        metadata: externalProfile,
        createdAt: new Date(),
      };

      await this.dataStore.saveExternalIdentity(identity);
    }

    // 2. 同步权限（如果外部系统提供了角色/组信息）
    await this.syncExternalRoles(identity.userId, externalProfile);

    // 3. 生成内部 token
    const user = await this.dataStore.getUser(identity.userId);
    const token = await this.generateToken(user);

    return { user, token };
  }

  /**
   * OAuth 授权
   */
  async oauthAuthorize(
    userId: string,
    clientId: string,
    requestedScopes: string[]
  ): Promise<{ authorizationCode: string }> {
    const client = await this.dataStore.getOAuthClient(clientId);

    if (!client) {
      throw new Error('Invalid client');
    }

    // 验证请求的 scopes 是否在允许范围内
    const allowedScopes = requestedScopes.filter(scope =>
      client.allowedScopes.includes(scope)
    );

    if (allowedScopes.length === 0) {
      throw new Error('No valid scopes requested');
    }

    // 如果不是受信任的客户端，需要用户同意
    if (!client.trustedClient) {
      // 这里应该跳转到用户同意页面
      // 暂时假设用户已同意
    }

    // 生成授权码
    const authCode = this.generateAuthorizationCode();

    // 保存授权信息
    await this.dataStore.saveOAuthAuthorization({
      userId,
      clientId,
      authorizationCode: authCode,
      scopes: allowedScopes,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10分钟有效
    });

    return { authorizationCode: authCode };
  }

  /**
   * OAuth 获取 token
   */
  async oauthGetToken(
    clientId: string,
    clientSecret: string,
    authorizationCode: string
  ): Promise<OAuthToken> {
    // 1. 验证客户端
    const client = await this.dataStore.getOAuthClient(clientId);

    if (!client || client.clientSecret !== clientSecret) {
      throw new Error('Invalid client credentials');
    }

    // 2. 验证授权码
    const authorization = await this.dataStore.getOAuthAuthorization(authorizationCode);

    if (!authorization || authorization.clientId !== clientId) {
      throw new Error('Invalid authorization code');
    }

    if (new Date() > authorization.expiresAt) {
      throw new Error('Authorization code expired');
    }

    // 3. 生成 token
    const token: OAuthToken = {
      id: this.generateId(),
      userId: authorization.userId,
      clientId,
      accessToken: this.generateAccessToken(),
      refreshToken: this.generateRefreshToken(),
      scopes: authorization.scopes,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1小时
      createdAt: new Date(),
    };

    await this.dataStore.saveOAuthToken(token);

    // 4. 删除已使用的授权码
    await this.dataStore.deleteOAuthAuthorization(authorizationCode);

    return token;
  }

  /**
   * 验证 OAuth token 并获取权限
   */
  async validateOAuthToken(
    accessToken: string
  ): Promise<{ userId: string; scopes: string[] }> {
    const token = await this.dataStore.getOAuthTokenByAccessToken(accessToken);

    if (!token) {
      throw new Error('Invalid token');
    }

    if (new Date() > token.expiresAt) {
      throw new Error('Token expired');
    }

    return {
      userId: token.userId,
      scopes: token.scopes,
    };
  }

  /**
   * 同步外部角色/组
   */
  private async syncExternalRoles(
    userId: string,
    externalProfile: any
  ): Promise<void> {
    // 从外部 profile 中提取角色/组信息
    const externalGroups = externalProfile.groups || [];

    // 映射到内部组
    for (const externalGroup of externalGroups) {
      const internalGroup = await this.mapExternalGroup(externalGroup);

      if (internalGroup) {
        await this.addUserToGroup(userId, internalGroup.id);
      }
    }
  }
}
```

---

## 性能优化高级策略

### 1. 权限预计算

```typescript
class PermissionPrecomputation {
  /**
   * 预计算用户对常用资源的权限
   */
  async precomputePermissions(userId: string): Promise<void> {
    // 获取用户最常访问的资源
    const frequentResources = await this.getFrequentResources(userId);

    const computedPermissions: Map<string, PermissionBits> = new Map();

    for (const resourceId of frequentResources) {
      const result = await this.evaluator.checkPermission(
        userId,
        resourceId,
        PermissionFlags.READ // 检查读权限
      );

      computedPermissions.set(resourceId, result.effectivePermission);
    }

    // 存储到快速访问的存储（如 Redis）
    await this.cache.setMany(
      Array.from(computedPermissions.entries()).map(([resourceId, perm]) => ({
        key: `precomputed:${userId}:${resourceId}`,
        value: perm,
        ttl: 3600, // 1小时
      }))
    );
  }

  /**
   * 批量预计算
   */
  async batchPrecomputePermissions(userIds: string[]): Promise<void> {
    await Promise.all(
      userIds.map(userId => this.precomputePermissions(userId))
    );
  }
}
```

### 2. 权限位图索引

```typescript
/**
 * 使用位图索引加速权限查询
 */
class PermissionBitmapIndex {
  // 用户ID -> 资源位图
  private userResourceBitmap: Map<string, Set<number>> = new Map();

  // 资源ID -> 数字索引的映射
  private resourceIndex: Map<string, number> = new Map();
  private indexToResource: Map<number, string> = new Map();

  /**
   * 构建索引
   */
  async buildIndex(): Promise<void> {
    const allResources = await this.dataStore.getAllResources();

    // 建立资源索引
    allResources.forEach((resource, index) => {
      this.resourceIndex.set(resource.id, index);
      this.indexToResource.set(index, resource.id);
    });

    // 为每个用户构建位图
    const allUsers = await this.dataStore.getAllUsers();

    for (const user of allUsers) {
      const bitmap = new Set<number>();

      // 获取用户有权限的资源
      const permissions = await this.getUserAllResourcePermissions(user.id);

      for (const perm of permissions) {
        const index = this.resourceIndex.get(perm.resourceId);
        if (index !== undefined) {
          bitmap.add(index);
        }
      }

      this.userResourceBitmap.set(user.id, bitmap);
    }
  }

  /**
   * 快速检查用户是否有资源权限
   */
  hasPermission(userId: string, resourceId: string): boolean {
    const bitmap = this.userResourceBitmap.get(userId);
    const index = this.resourceIndex.get(resourceId);

    if (!bitmap || index === undefined) {
      return false;
    }

    return bitmap.has(index);
  }

  /**
   * 获取用户所有有权限的资源
   */
  getUserResources(userId: string): string[] {
    const bitmap = this.userResourceBitmap.get(userId);

    if (!bitmap) {
      return [];
    }

    return Array.from(bitmap)
      .map(index => this.indexToResource.get(index))
      .filter((id): id is string => id !== undefined);
  }
}
```

### 3. 分布式权限缓存

```typescript
/**
 * 使用 Redis 的分布式缓存
 */
class DistributedPermissionCache {
  private redis: RedisClient;

  /**
   * 获取权限（分布式缓存）
   */
  async get(userId: string, resourceId: string): Promise<PermissionBits | null> {
    const key = `perm:${userId}:${resourceId}`;
    const cached = await this.redis.get(key);

    if (cached) {
      return parseInt(cached, 10);
    }

    return null;
  }

  /**
   * 设置权限（分布式缓存）
   */
  async set(
    userId: string,
    resourceId: string,
    permission: PermissionBits,
    ttl: number = 300
  ): Promise<void> {
    const key = `perm:${userId}:${resourceId}`;
    await this.redis.setex(key, ttl, permission.toString());
  }

  /**
   * 使用发布/订阅模式同步缓存失效
   */
  async invalidate(userId?: string, resourceId?: string): Promise<void> {
    const pattern = userId && resourceId
      ? `perm:${userId}:${resourceId}`
      : userId
      ? `perm:${userId}:*`
      : `perm:*`;

    // 发布失效消息
    await this.redis.publish('cache:invalidate', pattern);

    // 删除匹配的键
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

---

## 总结

现实中的权限系统需要考虑：

### 基础层（已实现）
1. **RBAC** - 基于角色的访问控制
2. **多租户** - 租户隔离
3. **层级权限** - 5层优先级

### 高级层（本文档）
4. **ABAC** - 基于属性的动态权限（时间、地点、设备、上下文）
5. **数据级权限** - 行级安全（Row-Level Security）
6. **字段级权限** - 列级安全（Column-Level Security）
7. **临时权限** - 委托、紧急访问、限时授权
8. **SOD** - 职责分离，防止权限滥用
9. **审批流** - 多级审批、自动升级
10. **跨系统** - SSO、OAuth、联邦身份
11. **性能优化** - 预计算、位图索引、分布式缓存

### 合规层
12. **审计** - 完整的操作日志
13. **合规** - GDPR、SOX、HIPAA
14. **生命周期** - 申请、审批、审查、回收

一个完整的企业级权限系统需要综合考虑这些场景，根据具体业务需求选择合适的功能组合！
