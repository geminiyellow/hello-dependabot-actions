package com.enterprise.rbac.aac.dto;

import com.enterprise.rbac.aac.model.TenantInfo;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Authentication response
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AuthResponse {
    /**
     * Status: "success" or "tenant_selection_required"
     */
    private String status;

    /**
     * Access token (if login complete)
     */
    private String accessToken;

    /**
     * Refresh token (if login complete)
     */
    private String refreshToken;

    /**
     * Session ID
     */
    private String sessionId;

    /**
     * Token type (always "Bearer")
     */
    private String tokenType = "Bearer";

    /**
     * Token expiration in seconds
     */
    private Long expiresIn;

    /**
     * Temporary token for tenant selection (if multiple tenants)
     */
    private String tempToken;

    /**
     * Available tenants (if tenant selection required)
     */
    private List<TenantInfo> tenants;

    /**
     * User ID
     */
    private String userId;

    /**
     * Static factory for successful login
     */
    public static AuthResponse success(String accessToken, String refreshToken, String sessionId, long expiresIn) {
        AuthResponse response = new AuthResponse();
        response.setStatus("success");
        response.setAccessToken(accessToken);
        response.setRefreshToken(refreshToken);
        response.setSessionId(sessionId);
        response.setTokenType("Bearer");
        response.setExpiresIn(expiresIn);
        return response;
    }

    /**
     * Static factory for tenant selection required
     */
    public static AuthResponse tenantSelectionRequired(String userId, String tempToken, List<TenantInfo> tenants) {
        AuthResponse response = new AuthResponse();
        response.setStatus("tenant_selection_required");
        response.setUserId(userId);
        response.setTempToken(tempToken);
        response.setTenants(tenants);
        return response;
    }
}
