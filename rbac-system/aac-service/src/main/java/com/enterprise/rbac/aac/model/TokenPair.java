package com.enterprise.rbac.aac.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Token pair containing access and refresh tokens
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TokenPair {
    /**
     * Short-lived access token (15 minutes)
     */
    private String accessToken;

    /**
     * Long-lived refresh token (7 days)
     */
    private String refreshToken;

    /**
     * Session ID for tracking
     */
    private String sessionId;

    /**
     * Token type (always "Bearer")
     */
    private String tokenType = "Bearer";

    /**
     * Access token expiration in seconds
     */
    private long expiresIn;

    public TokenPair(String accessToken, String refreshToken, String sessionId) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.sessionId = sessionId;
        this.tokenType = "Bearer";
        this.expiresIn = 900; // 15 minutes in seconds
    }
}
