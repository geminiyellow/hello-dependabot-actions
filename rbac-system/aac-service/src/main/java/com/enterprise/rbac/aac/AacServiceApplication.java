package com.enterprise.rbac.aac;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * AAC Service - Account Authentication Center
 *
 * Responsibilities:
 * - User authentication via Keycloak
 * - Tenant selection and JWT issuance
 * - Token lifecycle management (issue, validate, refresh, revoke)
 * - Session management with Redis
 */
@SpringBootApplication
public class AacServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(AacServiceApplication.class, args);
    }
}
