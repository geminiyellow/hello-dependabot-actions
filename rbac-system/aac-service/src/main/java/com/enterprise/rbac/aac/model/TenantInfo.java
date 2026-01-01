package com.enterprise.rbac.aac.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Tenant information from IMC
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TenantInfo {
    /**
     * Tenant unique ID
     */
    private String id;

    /**
     * Tenant name for display
     */
    private String name;

    /**
     * Tenant code/slug
     */
    private String code;

    /**
     * Whether this is user's default tenant
     */
    private boolean isDefault;
}
