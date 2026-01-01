package com.enterprise.rbac.aac.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Login request (initiates Keycloak OAuth flow)
 */
@Data
public class LoginRequest {
    /**
     * Optional redirect URI after login
     */
    private String redirectUri;
}
