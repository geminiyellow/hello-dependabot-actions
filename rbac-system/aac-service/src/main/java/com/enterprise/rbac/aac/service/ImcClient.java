package com.enterprise.rbac.aac.service;

import com.enterprise.rbac.aac.config.ImcProperties;
import com.enterprise.rbac.aac.model.TenantInfo;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;

/**
 * IMC (Identity Management Center) client
 *
 * Communicates with IMC service to get user's tenant information
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ImcClient {

    private final ImcProperties imcProperties;
    private final WebClient.Builder webClientBuilder;

    /**
     * Get all tenants for a user
     */
    public List<TenantInfo> getUserTenants(String userId) {
        log.info("Fetching tenants for user: {}", userId);

        WebClient webClient = webClientBuilder.baseUrl(imcProperties.getBaseUrl()).build();

        List<TenantInfo> tenants = webClient.get()
                .uri("/api/users/{userId}/tenants", userId)
                .header("X-API-Key", imcProperties.getApiKey())
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<List<TenantInfo>>() {})
                .block();

        log.info("Found {} tenants for user: {}", tenants != null ? tenants.size() : 0, userId);
        return tenants;
    }

    /**
     * Get specific tenant information
     */
    public TenantInfo getTenantInfo(String tenantId) {
        log.info("Fetching tenant info: {}", tenantId);

        WebClient webClient = webClientBuilder.baseUrl(imcProperties.getBaseUrl()).build();

        TenantInfo tenant = webClient.get()
                .uri("/api/tenants/{tenantId}", tenantId)
                .header("X-API-Key", imcProperties.getApiKey())
                .retrieve()
                .bodyToMono(TenantInfo.class)
                .block();

        log.info("Tenant info retrieved: {}", tenant != null ? tenant.getName() : null);
        return tenant;
    }

    /**
     * Verify user has access to tenant
     */
    public boolean hasAccessToTenant(String userId, String tenantId) {
        log.info("Verifying user {} access to tenant {}", userId, tenantId);

        List<TenantInfo> tenants = getUserTenants(userId);
        return tenants != null && tenants.stream()
                .anyMatch(t -> t.getId().equals(tenantId));
    }
}
