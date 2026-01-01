package com.enterprise.rbac.aac.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Request to select tenant after authentication
 */
@Data
public class TenantSelectionRequest {
    /**
     * Selected tenant ID
     */
    @NotBlank(message = "Tenant ID is required")
    private String tenantId;
}
