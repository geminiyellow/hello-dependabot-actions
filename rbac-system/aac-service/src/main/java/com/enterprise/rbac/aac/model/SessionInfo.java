package com.enterprise.rbac.aac.model;

import lombok.Data;

import java.io.Serializable;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Session information stored in Redis
 */
@Data
public class SessionInfo implements Serializable {
    private static final long serialVersionUID = 1L;

    /**
     * Unique session ID
     */
    private String sessionId;

    /**
     * User ID from Keycloak
     */
    private String userId;

    /**
     * Selected tenant ID
     */
    private String tenantId;

    /**
     * Tenant name for display
     */
    private String tenantName;

    /**
     * Active token JTIs (token IDs) in this session
     */
    private List<String> activeTokens = new ArrayList<>();

    /**
     * Session creation time
     */
    private Instant createdAt;

    /**
     * Last activity timestamp
     */
    private Instant lastActivityAt;

    /**
     * User's IP address
     */
    private String ipAddress;

    /**
     * User agent
     */
    private String userAgent;
}
