package com.enterprise.rbac.aac.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Keycloak configuration properties
 */
@Data
@Component
@ConfigurationProperties(prefix = "keycloak")
public class KeycloakProperties {
    /**
     * Keycloak server URL (e.g., http://localhost:8080)
     */
    private String serverUrl;

    /**
     * Realm name
     */
    private String realm;

    /**
     * Client ID for AAC service
     */
    private String clientId;

    /**
     * Client secret
     */
    private String clientSecret;

    /**
     * Redirect URI after authentication
     */
    private String redirectUri;

    /**
     * Authorization endpoint
     */
    public String getAuthorizationUrl() {
        return String.format("%s/realms/%s/protocol/openid-connect/auth", serverUrl, realm);
    }

    /**
     * Token endpoint
     */
    public String getTokenUrl() {
        return String.format("%s/realms/%s/protocol/openid-connect/token", serverUrl, realm);
    }

    /**
     * User info endpoint
     */
    public String getUserInfoUrl() {
        return String.format("%s/realms/%s/protocol/openid-connect/userinfo", serverUrl, realm);
    }
}
