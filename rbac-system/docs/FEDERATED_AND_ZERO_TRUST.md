# 联邦权限与零信任架构

本文档详细介绍两个现代企业级权限管理的核心架构模式：

1. **联邦权限 (Federated Permissions)** - 跨组织、跨系统的权限管理
2. **零信任架构 (Zero Trust Architecture)** - 持续验证的安全模型

---

## 第一部分：联邦权限 (Federated Permissions)

### 概述

联邦权限允许多个独立的组织或系统共享身份和权限信息，而无需集中式的用户数据库。用户可以使用一个组织的凭证访问另一个组织的资源。

### 核心概念

```
┌─────────────────────────────────────────────────────────────────┐
│                    联邦权限架构                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  组织 A (Identity Provider - IdP)                               │
│  ┌──────────────────────────────┐                              │
│  │  用户目录                     │                              │
│  │  - alice@company-a.com       │                              │
│  │  - bob@company-a.com         │                              │
│  └──────────────────────────────┘                              │
│             │                                                   │
│             │ 1. 用户在组织 A 认证                              │
│             ↓                                                   │
│  ┌──────────────────────────────┐                              │
│  │  身份断言 (SAML/JWT Token)   │                              │
│  │  - 用户身份                   │                              │
│  │  - 属性 (department, role)    │                              │
│  │  - 签名/加密                  │                              │
│  └──────────────────────────────┘                              │
│             │                                                   │
│             │ 2. 携带令牌访问                                   │
│             ↓                                                   │
│  ═══════════════════════════════════════════════════           │
│  信任关系 (Trust Relationship)                                  │
│  ═══════════════════════════════════════════════════           │
│             │                                                   │
│             │ 3. 验证令牌                                       │
│             ↓                                                   │
│  组织 B (Service Provider - SP)                                │
│  ┌──────────────────────────────┐                              │
│  │  权限映射引擎                 │                              │
│  │  IdP Attribute → Local Role   │                              │
│  │  department=eng → Developer   │                              │
│  └──────────────────────────────┘                              │
│             │                                                   │
│             │ 4. 应用本地权限                                   │
│             ↓                                                   │
│  ┌──────────────────────────────┐                              │
│  │  资源访问控制                 │                              │
│  │  - 文档                       │                              │
│  │  - API                        │                              │
│  └──────────────────────────────┘                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 数据模型

```typescript
// ==================== 联邦身份 ====================

/**
 * 身份提供者配置
 */
interface IdentityProvider {
  id: string;
  name: string;
  type: 'saml' | 'oauth2' | 'oidc' | 'custom';

  // SAML 配置
  samlConfig?: {
    entityId: string;
    ssoUrl: string;
    x509Certificate: string; // 用于验证签名
    logoutUrl?: string;
  };

  // OAuth/OIDC 配置
  oauthConfig?: {
    clientId: string;
    clientSecret: string;
    authorizationUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    scopes: string[];
  };

  // 信任设置
  trusted: boolean;
  trustLevel: 'full' | 'partial' | 'minimal';

  // 属性映射
  attributeMappings: AttributeMapping[];

  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 属性映射
 */
interface AttributeMapping {
  id: string;
  idpAttribute: string;        // IdP 提供的属性名
  localAttribute: string;      // 本地系统的属性名
  transform?: string;           // 转换函数（可选）
  required: boolean;
  defaultValue?: any;
}

/**
 * 联邦用户
 */
interface FederatedUser {
  id: string;
  localUserId?: string;        // 关联的本地用户ID（Just-in-Time Provisioning）
  idpId: string;               // 身份提供者ID
  idpUserId: string;           // IdP中的用户ID
  federatedAttributes: Record<string, any>; // 从IdP获取的属性
  mappedAttributes: Record<string, any>;    // 映射后的本地属性
  lastLoginAt: Date;
  createdAt: Date;
  expiresAt?: Date;            // 联邦会话过期时间
}

/**
 * 联邦令牌
 */
interface FederationToken {
  id: string;
  type: 'saml_assertion' | 'jwt' | 'oauth_token';
  token: string;
  userId: string;
  idpId: string;
  claims: Record<string, any>;  // 令牌声明
  issuedAt: Date;
  expiresAt: Date;
  audience?: string[];          // 目标受众
  scopes?: string[];
}

/**
 * 信任关系
 */
interface TrustRelationship {
  id: string;
  name: string;
  fromOrganization: string;     // 身份提供方组织
  toOrganization: string;       // 服务提供方组织
  idpId: string;
  trustLevel: 'full' | 'partial' | 'minimal';

  // 权限策略
  permissionPolicy: {
    allowAllPermissions: boolean;
    allowedPermissions?: PermissionBits[];
    deniedPermissions?: PermissionBits[];
    maxPermissionLevel?: PermissionBits;
  };

  // 资源访问限制
  resourceRestrictions?: {
    allowedResourceTypes?: string[];
    deniedResourceTypes?: string[];
    resourceTagFilter?: Record<string, any>;
  };

  // 时间限制
  validFrom?: Date;
  validUntil?: Date;

  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 权限映射规则
 */
interface PermissionMappingRule {
  id: string;
  idpId: string;
  name: string;
  priority: number;

  // 条件匹配
  conditions: {
    idpAttribute: string;
    operator: 'equals' | 'contains' | 'in' | 'matches';
    value: any;
  }[];

  // 映射结果
  mappedPermissions: {
    action: 'grant' | 'revoke';
    permissions: PermissionBits;
    resourceType?: string;
    scope?: 'global' | 'tenant' | 'resource';
  };

  enabled: boolean;
}

// ==================== 跨域访问 ====================

/**
 * 跨域访问请求
 */
interface CrossDomainAccessRequest {
  id: string;
  userId: string;
  sourceOrganization: string;
  targetOrganization: string;
  targetResourceId: string;
  requestedPermissions: PermissionBits;
  federationToken: string;

  status: 'pending' | 'approved' | 'denied' | 'expired';
  approvedBy?: string;
  approvedAt?: Date;
  expiresAt: Date;

  auditTrail: {
    timestamp: Date;
    action: string;
    actor: string;
    details: string;
  }[];
}

/**
 * 跨域权限委托
 */
interface CrossDomainDelegation {
  id: string;
  delegatorOrganization: string;
  delegateeOrganization: string;
  delegatedPermissions: {
    resourceType: string;
    permissions: PermissionBits;
    conditions?: Record<string, any>;
  }[];
  validFrom: Date;
  validUntil: Date;
  revocable: boolean;
  status: 'active' | 'suspended' | 'revoked' | 'expired';
}
```

### 实现：联邦权限管理器

```typescript
/**
 * 联邦权限管理器
 */
export class FederatedPermissionManager {
  constructor(
    private dataStore: IPermissionDataStore,
    private tokenValidator: ITokenValidator
  ) {}

  /**
   * 验证联邦令牌并创建联邦会话
   */
  async authenticateFederatedUser(
    token: string,
    idpId: string
  ): Promise<{
    federatedUser: FederatedUser;
    sessionToken: string;
  }> {
    // 1. 获取 IdP 配置
    const idp = await this.dataStore.getIdentityProvider(idpId);
    if (!idp || !idp.trusted) {
      throw new Error('Untrusted or unknown identity provider');
    }

    // 2. 验证令牌
    const tokenData = await this.tokenValidator.validate(token, idp);
    if (!tokenData.valid) {
      throw new Error('Invalid token: ' + tokenData.error);
    }

    // 3. 提取用户属性
    const federatedAttributes = this.extractAttributes(tokenData.claims, idp);

    // 4. 属性映射
    const mappedAttributes = this.mapAttributes(federatedAttributes, idp.attributeMappings);

    // 5. Just-in-Time (JIT) 用户创建/更新
    const federatedUser = await this.provisionUser(
      idpId,
      tokenData.claims.sub, // 用户唯一标识
      federatedAttributes,
      mappedAttributes
    );

    // 6. 创建本地会话
    const sessionToken = await this.createFederatedSession(
      federatedUser,
      tokenData.expiresAt
    );

    // 7. 审计日志
    await this.logFederatedLogin(federatedUser, idpId);

    return {
      federatedUser,
      sessionToken,
    };
  }

  /**
   * 检查联邦用户权限
   */
  async checkFederatedPermission(
    federatedUserId: string,
    resourceId: string,
    requiredPermission: PermissionBits,
    context: AccessContext
  ): Promise<PermissionCheckResult> {
    // 1. 获取联邦用户信息
    const federatedUser = await this.dataStore.getFederatedUser(federatedUserId);
    if (!federatedUser) {
      return this.createDeniedResult('Federated user not found');
    }

    // 2. 检查会话是否过期
    if (federatedUser.expiresAt && federatedUser.expiresAt < new Date()) {
      return this.createDeniedResult('Federated session expired');
    }

    // 3. 获取信任关系
    const trust = await this.dataStore.getTrustRelationship(federatedUser.idpId);
    if (!trust || !trust.enabled) {
      return this.createDeniedResult('Trust relationship not found or disabled');
    }

    // 4. 检查信任级别和权限策略
    const trustCheck = this.checkTrustPolicy(requiredPermission, trust);
    if (!trustCheck.allowed) {
      return this.createDeniedResult(`Trust policy denied: ${trustCheck.reason}`);
    }

    // 5. 应用权限映射规则
    const mappedPermissions = await this.applyPermissionMappingRules(
      federatedUser,
      resourceId
    );

    // 6. 检查资源访问限制
    const resource = await this.dataStore.getResource(resourceId);
    if (!this.checkResourceRestrictions(resource, trust)) {
      return this.createDeniedResult('Resource access restricted by trust relationship');
    }

    // 7. 执行标准权限检查（使用映射后的权限）
    const hasPermission = (mappedPermissions & requiredPermission) === requiredPermission;

    if (!hasPermission) {
      return this.createDeniedResult('Insufficient federated permissions');
    }

    // 8. 记录跨域访问
    await this.logCrossDomainAccess(federatedUser, resourceId, requiredPermission);

    return {
      allowed: true,
      effectivePermissions: mappedPermissions,
      reasons: ['Federated access granted via trust relationship'],
      appliedPolicies: ['federated_trust', `idp_${federatedUser.idpId}`],
    };
  }

  /**
   * 应用权限映射规则
   */
  private async applyPermissionMappingRules(
    federatedUser: FederatedUser,
    resourceId: string
  ): Promise<PermissionBits> {
    const rules = await this.dataStore.getPermissionMappingRules(federatedUser.idpId);
    let grantedPermissions: PermissionBits = PermissionFlags.NONE;

    // 按优先级排序
    rules.sort((a, b) => b.priority - a.priority);

    for (const rule of rules) {
      if (!rule.enabled) continue;

      // 检查条件
      const matches = this.evaluateMappingConditions(
        rule.conditions,
        federatedUser.federatedAttributes
      );

      if (matches) {
        if (rule.mappedPermissions.action === 'grant') {
          grantedPermissions |= rule.mappedPermissions.permissions;
        } else {
          grantedPermissions &= ~rule.mappedPermissions.permissions;
        }
      }
    }

    return grantedPermissions;
  }

  /**
   * 评估映射条件
   */
  private evaluateMappingConditions(
    conditions: any[],
    attributes: Record<string, any>
  ): boolean {
    for (const condition of conditions) {
      const value = attributes[condition.idpAttribute];

      switch (condition.operator) {
        case 'equals':
          if (value !== condition.value) return false;
          break;
        case 'contains':
          if (!String(value).includes(condition.value)) return false;
          break;
        case 'in':
          if (!condition.value.includes(value)) return false;
          break;
        case 'matches':
          if (!new RegExp(condition.value).test(String(value))) return false;
          break;
      }
    }
    return true;
  }

  /**
   * 检查信任策略
   */
  private checkTrustPolicy(
    requiredPermission: PermissionBits,
    trust: TrustRelationship
  ): { allowed: boolean; reason?: string } {
    const policy = trust.permissionPolicy;

    // 检查拒绝列表
    if (policy.deniedPermissions) {
      for (const denied of policy.deniedPermissions) {
        if ((requiredPermission & denied) !== 0) {
          return {
            allowed: false,
            reason: 'Permission explicitly denied by trust policy',
          };
        }
      }
    }

    // 检查允许列表
    if (!policy.allowAllPermissions && policy.allowedPermissions) {
      let hasAllowed = false;
      for (const allowed of policy.allowedPermissions) {
        if ((requiredPermission & allowed) === requiredPermission) {
          hasAllowed = true;
          break;
        }
      }
      if (!hasAllowed) {
        return {
          allowed: false,
          reason: 'Permission not in allowed list',
        };
      }
    }

    // 检查最大权限级别
    if (policy.maxPermissionLevel) {
      if (requiredPermission > policy.maxPermissionLevel) {
        return {
          allowed: false,
          reason: 'Permission exceeds maximum allowed level',
        };
      }
    }

    return { allowed: true };
  }

  /**
   * 检查资源访问限制
   */
  private checkResourceRestrictions(
    resource: Resource,
    trust: TrustRelationship
  ): boolean {
    const restrictions = trust.resourceRestrictions;
    if (!restrictions) return true;

    // 检查资源类型
    if (restrictions.allowedResourceTypes) {
      if (!restrictions.allowedResourceTypes.includes(resource.type)) {
        return false;
      }
    }

    if (restrictions.deniedResourceTypes) {
      if (restrictions.deniedResourceTypes.includes(resource.type)) {
        return false;
      }
    }

    // 检查资源标签过滤
    if (restrictions.resourceTagFilter) {
      for (const [key, value] of Object.entries(restrictions.resourceTagFilter)) {
        if (resource.metadata[key] !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Just-in-Time 用户创建
   */
  private async provisionUser(
    idpId: string,
    idpUserId: string,
    federatedAttributes: Record<string, any>,
    mappedAttributes: Record<string, any>
  ): Promise<FederatedUser> {
    // 查找现有联邦用户
    let federatedUser = await this.dataStore.getFederatedUserByIdpUserId(
      idpId,
      idpUserId
    );

    if (federatedUser) {
      // 更新属性
      federatedUser.federatedAttributes = federatedAttributes;
      federatedUser.mappedAttributes = mappedAttributes;
      federatedUser.lastLoginAt = new Date();
      await this.dataStore.updateFederatedUser(federatedUser);
    } else {
      // 创建新用户
      federatedUser = {
        id: this.generateId(),
        idpId,
        idpUserId,
        federatedAttributes,
        mappedAttributes,
        lastLoginAt: new Date(),
        createdAt: new Date(),
      };
      await this.dataStore.createFederatedUser(federatedUser);
    }

    return federatedUser;
  }

  /**
   * 属性映射
   */
  private mapAttributes(
    federatedAttributes: Record<string, any>,
    mappings: AttributeMapping[]
  ): Record<string, any> {
    const mapped: Record<string, any> = {};

    for (const mapping of mappings) {
      let value = federatedAttributes[mapping.idpAttribute];

      // 应用转换函数
      if (mapping.transform && value !== undefined) {
        value = this.applyTransform(value, mapping.transform);
      }

      // 使用默认值
      if (value === undefined && mapping.defaultValue !== undefined) {
        value = mapping.defaultValue;
      }

      // 检查必填
      if (mapping.required && value === undefined) {
        throw new Error(`Required attribute ${mapping.idpAttribute} is missing`);
      }

      if (value !== undefined) {
        mapped[mapping.localAttribute] = value;
      }
    }

    return mapped;
  }

  /**
   * 提取属性
   */
  private extractAttributes(
    claims: Record<string, any>,
    idp: IdentityProvider
  ): Record<string, any> {
    // 根据 IdP 类型提取属性
    if (idp.type === 'saml') {
      return claims.attributes || {};
    } else if (idp.type === 'oidc') {
      return claims;
    } else {
      return claims;
    }
  }

  /**
   * 创建联邦会话
   */
  private async createFederatedSession(
    federatedUser: FederatedUser,
    expiresAt: Date
  ): Promise<string> {
    const sessionToken = this.generateSessionToken();

    await this.dataStore.createSession({
      token: sessionToken,
      userId: federatedUser.id,
      userType: 'federated',
      expiresAt,
      createdAt: new Date(),
    });

    return sessionToken;
  }

  private generateId(): string {
    return `fed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionToken(): string {
    return `sess-${Date.now()}-${Math.random().toString(36).substr(2, 16)}`;
  }

  private applyTransform(value: any, transform: string): any {
    // 简化实现，实际应支持更复杂的转换
    if (transform === 'lowercase') return String(value).toLowerCase();
    if (transform === 'uppercase') return String(value).toUpperCase();
    return value;
  }

  private async logFederatedLogin(user: FederatedUser, idpId: string): Promise<void> {
    await this.dataStore.saveAuditLog({
      id: this.generateId(),
      timestamp: new Date(),
      userId: user.id,
      action: 'federated_login',
      result: 'allowed',
      metadata: { idpId, idpUserId: user.idpUserId },
    } as any);
  }

  private async logCrossDomainAccess(
    user: FederatedUser,
    resourceId: string,
    permission: PermissionBits
  ): Promise<void> {
    await this.dataStore.saveAuditLog({
      id: this.generateId(),
      timestamp: new Date(),
      userId: user.id,
      action: 'cross_domain_access',
      resourceId,
      permission,
      result: 'allowed',
      metadata: { idpId: user.idpId },
    } as any);
  }

  private createDeniedResult(reason: string): PermissionCheckResult {
    return {
      allowed: false,
      effectivePermissions: PermissionFlags.NONE,
      reasons: [reason],
      appliedPolicies: [],
    };
  }
}

/**
 * 令牌验证器接口
 */
export interface ITokenValidator {
  validate(
    token: string,
    idp: IdentityProvider
  ): Promise<{
    valid: boolean;
    claims?: Record<string, any>;
    expiresAt?: Date;
    error?: string;
  }>;
}

/**
 * SAML 令牌验证器
 */
export class SAMLTokenValidator implements ITokenValidator {
  async validate(token: string, idp: IdentityProvider): Promise<any> {
    if (!idp.samlConfig) {
      return { valid: false, error: 'SAML configuration not found' };
    }

    try {
      // 1. 解析 SAML 断言
      const assertion = this.parseSAMLAssertion(token);

      // 2. 验证签名
      const signatureValid = this.verifySignature(
        assertion,
        idp.samlConfig.x509Certificate
      );
      if (!signatureValid) {
        return { valid: false, error: 'Invalid signature' };
      }

      // 3. 验证受众
      if (assertion.audience && assertion.audience !== idp.samlConfig.entityId) {
        return { valid: false, error: 'Invalid audience' };
      }

      // 4. 验证时效性
      const now = new Date();
      if (assertion.notBefore && now < assertion.notBefore) {
        return { valid: false, error: 'Token not yet valid' };
      }
      if (assertion.notOnOrAfter && now >= assertion.notOnOrAfter) {
        return { valid: false, error: 'Token expired' };
      }

      return {
        valid: true,
        claims: assertion.attributes,
        expiresAt: assertion.notOnOrAfter,
      };
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }
  }

  private parseSAMLAssertion(token: string): any {
    // 实际实现需要使用 SAML 库，如 saml2-js
    // 这里只是示意
    return {};
  }

  private verifySignature(assertion: any, certificate: string): boolean {
    // 实际实现需要验证 XML 签名
    return true;
  }
}

/**
 * JWT 令牌验证器（OAuth2/OIDC）
 */
export class JWTTokenValidator implements ITokenValidator {
  async validate(token: string, idp: IdentityProvider): Promise<any> {
    if (!idp.oauthConfig) {
      return { valid: false, error: 'OAuth configuration not found' };
    }

    try {
      // 1. 获取 JWKS（公钥集）
      const jwks = await this.fetchJWKS(idp.oauthConfig.tokenUrl);

      // 2. 验证并解码 JWT
      const decoded = await this.verifyJWT(token, jwks);

      // 3. 验证声明
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp && now >= decoded.exp) {
        return { valid: false, error: 'Token expired' };
      }
      if (decoded.nbf && now < decoded.nbf) {
        return { valid: false, error: 'Token not yet valid' };
      }

      // 4. 验证 issuer
      // if (decoded.iss !== idp.oauthConfig.authorizationUrl) {
      //   return { valid: false, error: 'Invalid issuer' };
      // }

      return {
        valid: true,
        claims: decoded,
        expiresAt: new Date(decoded.exp * 1000),
      };
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }
  }

  private async fetchJWKS(tokenUrl: string): Promise<any> {
    // 实际实现需要从 .well-known/jwks.json 获取
    return {};
  }

  private async verifyJWT(token: string, jwks: any): Promise<any> {
    // 实际实现需要使用 jsonwebtoken 或类似库
    // 这里只是示意
    return {};
  }
}
```

### 使用示例

```typescript
// 初始化联邦权限管理器
const federatedManager = new FederatedPermissionManager(
  dataStore,
  new JWTTokenValidator()
);

// 场景1：用户使用 Google 账号登录
const googleToken = 'eyJhbGciOiJSUzI1NiIs...'; // Google ID Token

const { federatedUser, sessionToken } = await federatedManager.authenticateFederatedUser(
  googleToken,
  'idp-google'
);

console.log('联邦用户已创建:', federatedUser.id);
console.log('会话令牌:', sessionToken);

// 场景2：检查联邦用户权限
const result = await federatedManager.checkFederatedPermission(
  federatedUser.id,
  'resource-123',
  PermissionFlags.READ,
  { ipAddress: '1.2.3.4' } as AccessContext
);

if (result.allowed) {
  console.log('✅ 跨域访问允许');
} else {
  console.log('❌ 跨域访问拒绝:', result.reasons[0]);
}
```

### 数据库 Schema

```sql
-- 身份提供者
CREATE TABLE identity_providers (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL,
    saml_config JSONB,
    oauth_config JSONB,
    trusted BOOLEAN NOT NULL DEFAULT false,
    trust_level VARCHAR(20),
    attribute_mappings JSONB NOT NULL DEFAULT '[]',
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 联邦用户
CREATE TABLE federated_users (
    id UUID PRIMARY KEY,
    local_user_id UUID REFERENCES users(id),
    idp_id UUID NOT NULL REFERENCES identity_providers(id),
    idp_user_id VARCHAR(255) NOT NULL,
    federated_attributes JSONB NOT NULL DEFAULT '{}',
    mapped_attributes JSONB NOT NULL DEFAULT '{}',
    last_login_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP,
    UNIQUE(idp_id, idp_user_id)
);

CREATE INDEX idx_federated_users_idp ON federated_users(idp_id, idp_user_id);

-- 信任关系
CREATE TABLE trust_relationships (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    from_organization VARCHAR(255) NOT NULL,
    to_organization VARCHAR(255) NOT NULL,
    idp_id UUID NOT NULL REFERENCES identity_providers(id),
    trust_level VARCHAR(20) NOT NULL,
    permission_policy JSONB NOT NULL,
    resource_restrictions JSONB,
    valid_from TIMESTAMP,
    valid_until TIMESTAMP,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 权限映射规则
CREATE TABLE permission_mapping_rules (
    id UUID PRIMARY KEY,
    idp_id UUID NOT NULL REFERENCES identity_providers(id),
    name VARCHAR(255) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    conditions JSONB NOT NULL,
    mapped_permissions JSONB NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_permission_mapping_rules_idp ON permission_mapping_rules(idp_id, priority DESC);

-- 跨域访问日志
CREATE TABLE cross_domain_access_logs (
    id UUID PRIMARY KEY,
    federated_user_id UUID NOT NULL REFERENCES federated_users(id),
    source_organization VARCHAR(255) NOT NULL,
    target_organization VARCHAR(255) NOT NULL,
    resource_id UUID,
    permission INTEGER,
    result VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX idx_cross_domain_logs_user ON cross_domain_access_logs(federated_user_id);
CREATE INDEX idx_cross_domain_logs_time ON cross_domain_access_logs(timestamp DESC);
```

---

## 第二部分：零信任架构 (Zero Trust Architecture)

### 概述

零信任架构的核心原则是 **"Never Trust, Always Verify"** （永不信任，始终验证）。不再基于网络位置（内网vs外网）授予信任，而是对每个访问请求进行持续验证。

### 核心原则

```
传统安全模型（城堡护城河）          零信任模型
┌─────────────────────────┐         ┌─────────────────────────┐
│                         │         │                         │
│  防火墙                 │         │  每个资源都受保护       │
│    ↓                    │         │                         │
│  ┌───────────────┐      │         │  ┌───┐ ┌───┐ ┌───┐     │
│  │ 内网（信任）  │      │         │  │ R │ │ R │ │ R │     │
│  │  - 服务器     │      │         │  └─┬─┘ └─┬─┘ └─┬─┘     │
│  │  - 数据库     │      │         │    │     │     │       │
│  │  - 应用       │      │         │    ▼     ▼     ▼       │
│  └───────────────┘      │         │  ┌─────────────────┐   │
│         ↑               │         │  │ 身份验证        │   │
│         │               │         │  │ 上下文分析      │   │
│  外网（不信任）         │         │  │ 最小权限        │   │
│                         │         │  │ 持续监控        │   │
└─────────────────────────┘         │  └─────────────────┘   │
                                    │         ↑               │
                                    │         │               │
                                    │    所有用户             │
                                    │ （内外网均需验证）      │
                                    └─────────────────────────┘
```

### 数据模型

```typescript
// ==================== 零信任组件 ====================

/**
 * 访问请求上下文（增强版）
 */
interface ZeroTrustContext extends AccessContext {
  // 用户身份
  userId: string;
  sessionId: string;
  authenticationMethod: 'password' | 'mfa' | 'biometric' | 'certificate';
  authenticationStrength: number; // 0-100

  // 设备信息
  deviceId: string;
  deviceFingerprint: string;
  deviceTrustScore: number; // 0-100
  deviceCompliant: boolean;
  osVersion: string;
  lastSecurityScan?: Date;

  // 网络信息
  ipAddress: string;
  geoLocation: {
    country: string;
    region: string;
    city: string;
    coordinates?: { lat: number; lng: number };
  };
  networkType: 'corporate' | 'vpn' | 'public' | 'home';

  // 时间信息
  currentTime: Date;
  isWorkingHours: boolean;
  isUnusualTime: boolean; // 异常时间访问

  // 行为信息
  previousAccessPatterns: AccessPattern[];
  riskScore: number; // 0-100，综合风险评分
  anomalyScore: number; // 0-100，异常检测分数

  // 会话信息
  sessionAge: number; // 会话持续时间（秒）
  idleTime: number; // 空闲时间（秒）
  actionsCount: number; // 本会话中的操作次数
}

/**
 * 访问模式
 */
interface AccessPattern {
  timestamp: Date;
  resourceType: string;
  action: string;
  success: boolean;
}

/**
 * 零信任策略
 */
interface ZeroTrustPolicy {
  id: string;
  name: string;
  description: string;
  priority: number;

  // 适用范围
  applicableResourceTypes: string[];
  applicablePermissions: PermissionBits[];

  // 验证要求
  requirements: {
    // 认证强度要求
    minAuthenticationStrength: number;
    requireMFA: boolean;
    allowedAuthMethods: string[];

    // 设备要求
    minDeviceTrustScore: number;
    requireCompliantDevice: boolean;
    requireKnownDevice: boolean;

    // 网络要求
    allowedNetworkTypes: string[];
    allowedCountries?: string[];
    deniedCountries?: string[];
    requireCorporateNetwork: boolean;

    // 风险阈值
    maxRiskScore: number;
    maxAnomalyScore: number;

    // 会话要求
    maxSessionAge: number; // 秒
    maxIdleTime: number; // 秒
    requireReauthentication: boolean;
  };

  // 持续验证
  continuousVerification: {
    enabled: boolean;
    interval: number; // 重新验证间隔（秒）
    onFailure: 'deny' | 'downgrade' | 'challenge';
  };

  // 失败处理
  onPolicyViolation: {
    action: 'deny' | 'challenge' | 'allow_limited';
    challengeType?: 'mfa' | 'captcha' | 'security_question';
    limitedPermissions?: PermissionBits;
  };

  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 设备信任评估
 */
interface DeviceTrustAssessment {
  deviceId: string;
  trustScore: number; // 0-100
  factors: {
    factor: string;
    score: number;
    weight: number;
  }[];

  // 设备属性
  isRegistered: boolean;
  isCertified: boolean;
  isEncrypted: boolean;
  hasAntiVirus: boolean;
  hasFirewall: boolean;
  osUpToDate: boolean;

  // 行为分析
  firstSeenAt: Date;
  lastSeenAt: Date;
  accessCount: number;
  anomalousActivities: number;

  assessedAt: Date;
}

/**
 * 实时风险评估
 */
interface RiskAssessment {
  requestId: string;
  userId: string;
  resourceId: string;

  overallRiskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';

  riskFactors: {
    category: string;
    factor: string;
    score: number; // 0-100
    weight: number;
    description: string;
  }[];

  recommendations: string[];
  decision: 'allow' | 'deny' | 'challenge' | 'monitor';

  assessedAt: Date;
}

/**
 * 微分段策略
 */
interface MicrosegmentationPolicy {
  id: string;
  name: string;

  // 源
  source: {
    userGroups?: string[];
    users?: string[];
    networks?: string[];
  };

  // 目标
  target: {
    resourceTypes: string[];
    resources?: string[];
    tags?: Record<string, string>;
  };

  // 允许的操作
  allowedPermissions: PermissionBits[];

  // 限制条件
  conditions: {
    timeWindows?: string[];
    requiredAuthLevel?: number;
    maxDataTransfer?: number; // bytes
  };

  enabled: boolean;
}

/**
 * 持续监控事件
 */
interface ContinuousMonitoringEvent {
  id: string;
  sessionId: string;
  userId: string;
  eventType: 'access_granted' | 'access_denied' | 'anomaly_detected' | 'policy_violation' | 'session_terminated';

  context: ZeroTrustContext;
  riskAssessment: RiskAssessment;

  action: string;
  result: string;
  details: Record<string, any>;

  timestamp: Date;
}
```

### 实现：零信任权限引擎

```typescript
/**
 * 零信任权限引擎
 */
export class ZeroTrustPermissionEngine {
  constructor(
    private dataStore: IPermissionDataStore,
    private deviceTrustEvaluator: IDeviceTrustEvaluator,
    private anomalyDetector: IAnomalyDetector,
    private riskScorer: IRiskScorer
  ) {}

  /**
   * 零信任权限检查
   */
  async checkPermission(
    userId: string,
    resourceId: string,
    requiredPermission: PermissionBits,
    context: Partial<ZeroTrustContext>
  ): Promise<PermissionCheckResult> {
    const requestId = this.generateId();

    // 1. 构建完整的零信任上下文
    const ztContext = await this.buildZeroTrustContext(userId, context);

    // 2. 设备信任评估
    const deviceTrust = await this.deviceTrustEvaluator.evaluate(
      ztContext.deviceId,
      ztContext.deviceFingerprint
    );
    ztContext.deviceTrustScore = deviceTrust.trustScore;

    // 3. 异常检测
    const anomalyResult = await this.anomalyDetector.detect(userId, ztContext);
    ztContext.anomalyScore = anomalyResult.score;

    // 4. 综合风险评估
    const riskAssessment = await this.riskScorer.assess(
      requestId,
      userId,
      resourceId,
      ztContext
    );
    ztContext.riskScore = riskAssessment.overallRiskScore;

    // 5. 获取适用的零信任策略
    const policies = await this.getApplicablePolicies(resourceId, requiredPermission);

    // 6. 评估所有策略
    for (const policy of policies) {
      const policyResult = this.evaluatePolicy(policy, ztContext, riskAssessment);

      if (!policyResult.passed) {
        // 策略违规处理
        return await this.handlePolicyViolation(
          policy,
          policyResult.violations,
          ztContext,
          riskAssessment
        );
      }
    }

    // 7. 执行微分段检查
    const microsegmentCheck = await this.checkMicrosegmentation(
      userId,
      resourceId,
      requiredPermission,
      ztContext
    );

    if (!microsegmentCheck.allowed) {
      await this.logSecurityEvent('microsegmentation_denied', userId, resourceId, ztContext);
      return this.createDeniedResult('Microsegmentation policy denied access');
    }

    // 8. 执行基础权限检查
    const basePermissionCheck = await this.checkBasePermissions(
      userId,
      resourceId,
      requiredPermission
    );

    if (!basePermissionCheck.allowed) {
      await this.logSecurityEvent('permission_denied', userId, resourceId, ztContext);
      return basePermissionCheck;
    }

    // 9. 设置持续验证
    if (policies.some(p => p.continuousVerification.enabled)) {
      await this.setupContinuousVerification(userId, resourceId, ztContext, policies);
    }

    // 10. 记录成功访问
    await this.logSecurityEvent('access_granted', userId, resourceId, ztContext);

    // 11. 返回结果（包含风险信息）
    return {
      allowed: true,
      effectivePermissions: basePermissionCheck.effectivePermissions,
      reasons: [
        'Zero trust verification passed',
        `Risk score: ${riskAssessment.overallRiskScore}`,
        `Device trust: ${deviceTrust.trustScore}`,
      ],
      appliedPolicies: policies.map(p => p.name),
      warnings: riskAssessment.riskLevel !== 'low'
        ? [`Elevated risk level: ${riskAssessment.riskLevel}`]
        : undefined,
      metadata: {
        riskScore: riskAssessment.overallRiskScore,
        riskLevel: riskAssessment.riskLevel,
        deviceTrustScore: deviceTrust.trustScore,
        anomalyScore: ztContext.anomalyScore,
      },
    };
  }

  /**
   * 构建零信任上下文
   */
  private async buildZeroTrustContext(
    userId: string,
    partialContext: Partial<ZeroTrustContext>
  ): Promise<ZeroTrustContext> {
    // 获取会话信息
    const session = await this.dataStore.getSession(partialContext.sessionId!);

    // 获取历史访问模式
    const accessPatterns = await this.dataStore.getRecentAccessPatterns(userId, 100);

    // 检查是否异常时间
    const isUnusualTime = await this.detectUnusualAccessTime(userId, new Date());

    return {
      userId,
      sessionId: partialContext.sessionId!,
      authenticationMethod: session.authMethod,
      authenticationStrength: this.calculateAuthStrength(session.authMethod),

      deviceId: partialContext.deviceId!,
      deviceFingerprint: partialContext.deviceFingerprint!,
      deviceTrustScore: 0, // 将在后续步骤计算
      deviceCompliant: partialContext.deviceCompliant ?? false,
      osVersion: partialContext.osVersion ?? 'unknown',

      ipAddress: partialContext.ipAddress!,
      geoLocation: partialContext.geoLocation!,
      networkType: this.detectNetworkType(partialContext.ipAddress!),

      currentTime: new Date(),
      isWorkingHours: this.isWorkingHours(new Date()),
      isUnusualTime,

      previousAccessPatterns: accessPatterns,
      riskScore: 0, // 将在后续步骤计算
      anomalyScore: 0, // 将在后续步骤计算

      sessionAge: (Date.now() - session.createdAt.getTime()) / 1000,
      idleTime: session.lastActivityAt
        ? (Date.now() - session.lastActivityAt.getTime()) / 1000
        : 0,
      actionsCount: session.actionsCount ?? 0,

      // 继承其他上下文
      isTrustedDevice: partialContext.isTrustedDevice ?? false,
      isInOffice: partialContext.isInOffice ?? false,
      deviceType: partialContext.deviceType ?? 'desktop',
    } as ZeroTrustContext;
  }

  /**
   * 评估策略
   */
  private evaluatePolicy(
    policy: ZeroTrustPolicy,
    context: ZeroTrustContext,
    riskAssessment: RiskAssessment
  ): { passed: boolean; violations: string[] } {
    const violations: string[] = [];
    const req = policy.requirements;

    // 认证强度检查
    if (context.authenticationStrength < req.minAuthenticationStrength) {
      violations.push(`Authentication strength ${context.authenticationStrength} below required ${req.minAuthenticationStrength}`);
    }

    // MFA 检查
    if (req.requireMFA && context.authenticationMethod !== 'mfa') {
      violations.push('MFA required but not used');
    }

    // 认证方法检查
    if (req.allowedAuthMethods.length > 0 &&
        !req.allowedAuthMethods.includes(context.authenticationMethod)) {
      violations.push(`Authentication method ${context.authenticationMethod} not allowed`);
    }

    // 设备信任检查
    if (context.deviceTrustScore < req.minDeviceTrustScore) {
      violations.push(`Device trust score ${context.deviceTrustScore} below required ${req.minDeviceTrustScore}`);
    }

    // 设备合规检查
    if (req.requireCompliantDevice && !context.deviceCompliant) {
      violations.push('Device not compliant with security policies');
    }

    // 网络类型检查
    if (req.allowedNetworkTypes.length > 0 &&
        !req.allowedNetworkTypes.includes(context.networkType)) {
      violations.push(`Network type ${context.networkType} not allowed`);
    }

    // 地理位置检查
    if (req.deniedCountries && req.deniedCountries.includes(context.geoLocation.country)) {
      violations.push(`Access from ${context.geoLocation.country} is denied`);
    }

    if (req.allowedCountries && !req.allowedCountries.includes(context.geoLocation.country)) {
      violations.push(`Access only allowed from: ${req.allowedCountries.join(', ')}`);
    }

    // 风险评分检查
    if (riskAssessment.overallRiskScore > req.maxRiskScore) {
      violations.push(`Risk score ${riskAssessment.overallRiskScore} exceeds maximum ${req.maxRiskScore}`);
    }

    // 异常评分检查
    if (context.anomalyScore > req.maxAnomalyScore) {
      violations.push(`Anomaly score ${context.anomalyScore} exceeds maximum ${req.maxAnomalyScore}`);
    }

    // 会话年龄检查
    if (context.sessionAge > req.maxSessionAge) {
      violations.push(`Session age ${context.sessionAge}s exceeds maximum ${req.maxSessionAge}s`);
    }

    // 空闲时间检查
    if (context.idleTime > req.maxIdleTime) {
      violations.push(`Idle time ${context.idleTime}s exceeds maximum ${req.maxIdleTime}s`);
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  /**
   * 处理策略违规
   */
  private async handlePolicyViolation(
    policy: ZeroTrustPolicy,
    violations: string[],
    context: ZeroTrustContext,
    riskAssessment: RiskAssessment
  ): Promise<PermissionCheckResult> {
    const handler = policy.onPolicyViolation;

    switch (handler.action) {
      case 'deny':
        await this.logSecurityEvent('policy_violation_denied', context.userId, '', context);
        return this.createDeniedResult(`Policy violation: ${violations.join('; ')}`);

      case 'challenge':
        // 触发额外验证挑战
        await this.triggerChallenge(context.userId, handler.challengeType!);
        return {
          allowed: false,
          effectivePermissions: PermissionFlags.NONE,
          reasons: ['Additional verification required: ' + handler.challengeType],
          appliedPolicies: [policy.name],
          metadata: {
            challengeRequired: true,
            challengeType: handler.challengeType,
            violations,
          },
        };

      case 'allow_limited':
        await this.logSecurityEvent('policy_violation_limited', context.userId, '', context);
        return {
          allowed: true,
          effectivePermissions: handler.limitedPermissions || PermissionFlags.READ,
          reasons: ['Limited access granted due to policy violations'],
          appliedPolicies: [policy.name],
          warnings: violations,
        };

      default:
        return this.createDeniedResult('Unknown policy violation handler');
    }
  }

  /**
   * 微分段检查
   */
  private async checkMicrosegmentation(
    userId: string,
    resourceId: string,
    requiredPermission: PermissionBits,
    context: ZeroTrustContext
  ): Promise<{ allowed: boolean; reason?: string }> {
    const policies = await this.dataStore.getMicrosegmentationPolicies();
    const resource = await this.dataStore.getResource(resourceId);
    const user = await this.dataStore.getUser(userId);

    for (const policy of policies) {
      if (!policy.enabled) continue;

      // 检查是否匹配目标
      const matchesTarget =
        policy.target.resourceTypes.includes(resource.type) &&
        (!policy.target.resources || policy.target.resources.includes(resourceId));

      if (!matchesTarget) continue;

      // 检查是否匹配源
      const matchesSource =
        (!policy.source.users || policy.source.users.includes(userId)) &&
        (!policy.source.userGroups || user.groupIds.some(g => policy.source.userGroups!.includes(g)));

      if (!matchesSource) {
        return {
          allowed: false,
          reason: `Microsegmentation policy ${policy.name} blocks access`,
        };
      }

      // 检查允许的权限
      if (!policy.allowedPermissions.some(p => (p & requiredPermission) === requiredPermission)) {
        return {
          allowed: false,
          reason: `Permission not allowed by microsegmentation policy ${policy.name}`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * 设置持续验证
   */
  private async setupContinuousVerification(
    userId: string,
    resourceId: string,
    context: ZeroTrustContext,
    policies: ZeroTrustPolicy[]
  ): Promise<void> {
    const intervals = policies
      .filter(p => p.continuousVerification.enabled)
      .map(p => p.continuousVerification.interval);

    const minInterval = Math.min(...intervals);

    // 调度持续验证任务
    await this.dataStore.scheduleVerification({
      userId,
      resourceId,
      sessionId: context.sessionId,
      interval: minInterval,
      nextVerification: new Date(Date.now() + minInterval * 1000),
    });
  }

  /**
   * 计算认证强度
   */
  private calculateAuthStrength(method: string): number {
    const strengths: Record<string, number> = {
      'password': 30,
      'mfa': 80,
      'biometric': 90,
      'certificate': 95,
    };
    return strengths[method] || 0;
  }

  /**
   * 检测网络类型
   */
  private detectNetworkType(ipAddress: string): string {
    // 简化实现，实际应检查 IP 范围
    if (ipAddress.startsWith('10.') || ipAddress.startsWith('192.168.')) {
      return 'corporate';
    }
    return 'public';
  }

  /**
   * 检测异常访问时间
   */
  private async detectUnusualAccessTime(userId: string, time: Date): Promise<boolean> {
    const patterns = await this.dataStore.getRecentAccessPatterns(userId, 100);

    if (patterns.length === 0) return false;

    const hour = time.getHours();
    const usualHours = patterns.map(p => p.timestamp.getHours());
    const avgHour = usualHours.reduce((a, b) => a + b, 0) / usualHours.length;

    // 如果当前时间与平均时间相差超过4小时，视为异常
    return Math.abs(hour - avgHour) > 4;
  }

  private isWorkingHours(date: Date): boolean {
    const hour = date.getHours();
    const day = date.getDay();
    return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
  }

  private async checkBasePermissions(
    userId: string,
    resourceId: string,
    requiredPermission: PermissionBits
  ): Promise<PermissionCheckResult> {
    // 调用基础权限引擎
    // 这里简化实现
    return {
      allowed: true,
      effectivePermissions: requiredPermission,
      reasons: ['Base permission check passed'],
      appliedPolicies: [],
    };
  }

  private async getApplicablePolicies(
    resourceId: string,
    permission: PermissionBits
  ): Promise<ZeroTrustPolicy[]> {
    const resource = await this.dataStore.getResource(resourceId);
    const allPolicies = await this.dataStore.getZeroTrustPolicies();

    return allPolicies.filter(p =>
      p.enabled &&
      p.applicableResourceTypes.includes(resource.type) &&
      p.applicablePermissions.some(ap => (ap & permission) !== 0)
    ).sort((a, b) => b.priority - a.priority);
  }

  private async triggerChallenge(userId: string, challengeType: string): Promise<void> {
    // 实现挑战触发逻辑（发送MFA、显示验证码等）
    await this.dataStore.createChallenge({
      userId,
      type: challengeType,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5分钟
    });
  }

  private async logSecurityEvent(
    eventType: string,
    userId: string,
    resourceId: string,
    context: ZeroTrustContext
  ): Promise<void> {
    await this.dataStore.saveContinuousMonitoringEvent({
      id: this.generateId(),
      sessionId: context.sessionId,
      userId,
      eventType: eventType as any,
      context,
      riskAssessment: {} as any,
      action: eventType,
      result: 'logged',
      details: {},
      timestamp: new Date(),
    });
  }

  private generateId(): string {
    return `zt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private createDeniedResult(reason: string): PermissionCheckResult {
    return {
      allowed: false,
      effectivePermissions: PermissionFlags.NONE,
      reasons: [reason],
      appliedPolicies: [],
    };
  }
}

// 辅助接口
export interface IDeviceTrustEvaluator {
  evaluate(deviceId: string, fingerprint: string): Promise<DeviceTrustAssessment>;
}

export interface IAnomalyDetector {
  detect(userId: string, context: ZeroTrustContext): Promise<{ score: number; anomalies: string[] }>;
}

export interface IRiskScorer {
  assess(requestId: string, userId: string, resourceId: string, context: ZeroTrustContext): Promise<RiskAssessment>;
}
```

### 使用示例

```typescript
// 初始化零信任引擎
const ztEngine = new ZeroTrustPermissionEngine(
  dataStore,
  new DeviceTrustEvaluator(),
  new AnomalyDetector(),
  new RiskScorer()
);

// 场景：用户从新设备访问敏感资源
const result = await ztEngine.checkPermission(
  'user-123',
  'sensitive-resource',
  PermissionFlags.READ,
  {
    sessionId: 'session-abc',
    deviceId: 'device-xyz',
    deviceFingerprint: 'fp-12345',
    ipAddress: '203.0.113.45',
    geoLocation: {
      country: 'US',
      region: 'California',
      city: 'San Francisco',
    },
    deviceCompliant: true,
    osVersion: 'Windows 11',
  }
);

if (result.allowed) {
  console.log('✅ 零信任验证通过');
  console.log('风险等级:', result.metadata?.riskLevel);
  console.log('设备信任度:', result.metadata?.deviceTrustScore);
} else {
  console.log('❌ 零信任验证失败:', result.reasons[0]);

  if (result.metadata?.challengeRequired) {
    console.log('需要额外验证:', result.metadata.challengeType);
  }
}
```

### 数据库 Schema

```sql
-- 零信任策略
CREATE TABLE zero_trust_policies (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    applicable_resource_types TEXT[] NOT NULL,
    applicable_permissions INTEGER[] NOT NULL,
    requirements JSONB NOT NULL,
    continuous_verification JSONB NOT NULL DEFAULT '{"enabled": false}',
    on_policy_violation JSONB NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 设备信任评估
CREATE TABLE device_trust_assessments (
    device_id VARCHAR(255) PRIMARY KEY,
    trust_score INTEGER NOT NULL,
    factors JSONB NOT NULL,
    is_registered BOOLEAN NOT NULL DEFAULT false,
    is_certified BOOLEAN NOT NULL DEFAULT false,
    is_encrypted BOOLEAN NOT NULL DEFAULT false,
    first_seen_at TIMESTAMP NOT NULL,
    last_seen_at TIMESTAMP NOT NULL,
    assessed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 持续监控事件
CREATE TABLE continuous_monitoring_events (
    id UUID PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    context JSONB NOT NULL,
    risk_assessment JSONB NOT NULL,
    action VARCHAR(100) NOT NULL,
    result VARCHAR(50) NOT NULL,
    details JSONB,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_monitoring_events_session ON continuous_monitoring_events(session_id);
CREATE INDEX idx_monitoring_events_user ON continuous_monitoring_events(user_id);
CREATE INDEX idx_monitoring_events_time ON continuous_monitoring_events(timestamp DESC);

-- 微分段策略
CREATE TABLE microsegmentation_policies (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    source JSONB NOT NULL,
    target JSONB NOT NULL,
    allowed_permissions INTEGER[] NOT NULL,
    conditions JSONB,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## 总结

### 联邦权限适用场景

- B2B SaaS 平台（客户使用自己的 IdP）
- 企业并购整合（多个 AD 域）
- 供应链协作（跨组织资源共享）
- 学术机构联盟（学生跨校访问）

### 零信任适用场景

- 远程办公环境
- BYOD（自带设备）策略
- 高安全性要求（金融、医疗）
- 云原生应用
- 微服务架构

### 两者结合

联邦权限和零信任可以结合使用：

```typescript
// 联邦用户 + 零信任验证
const federatedUser = await federatedManager.authenticateFederatedUser(token, idpId);

const result = await ztEngine.checkPermission(
  federatedUser.id,
  resourceId,
  permission,
  zeroTrustContext
);
```

这样可以实现：**跨组织的持续验证访问控制**！
