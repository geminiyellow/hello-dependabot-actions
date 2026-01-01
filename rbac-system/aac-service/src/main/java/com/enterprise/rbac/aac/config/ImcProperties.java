package com.enterprise.rbac.aac.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * IMC (Identity Management Center) configuration properties
 */
@Data
@Component
@ConfigurationProperties(prefix = "imc")
public class ImcProperties {
    /**
     * IMC service base URL
     */
    private String baseUrl = "http://localhost:8081";

    /**
     * API key for IMC authentication (if required)
     */
    private String apiKey;
}
