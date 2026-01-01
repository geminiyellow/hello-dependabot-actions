package com.enterprise.rbac.aac.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * JWT configuration properties
 */
@Data
@Component
@ConfigurationProperties(prefix = "jwt")
public class JwtProperties {
    /**
     * Secret key for signing JWTs (should be stored in environment variable)
     */
    private String secret = "change-this-to-a-secure-random-256-bit-secret-key-in-production";

    /**
     * Token issuer
     */
    private String issuer = "aac-service";

    /**
     * Access token expiration in milliseconds (default: 15 minutes)
     */
    private long accessTokenExpiration = 900000;

    /**
     * Refresh token expiration in milliseconds (default: 7 days)
     */
    private long refreshTokenExpiration = 604800000;

    /**
     * Temporary token expiration for tenant selection (default: 5 minutes)
     */
    private long tempTokenExpiration = 300000;
}
