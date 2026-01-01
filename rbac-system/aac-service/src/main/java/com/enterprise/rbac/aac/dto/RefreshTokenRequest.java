package com.enterprise.rbac.aac.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Refresh token request
 */
@Data
public class RefreshTokenRequest {
    /**
     * Refresh token
     */
    @NotBlank(message = "Refresh token is required")
    private String refreshToken;
}
