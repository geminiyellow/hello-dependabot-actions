package com.enterprise.rbac.aac.service;

import com.enterprise.rbac.aac.config.KeycloakProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Map;

/**
 * Keycloak integration service
 *
 * Handles OAuth2 authorization code flow with Keycloak
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class KeycloakService {

    private final KeycloakProperties keycloakProperties;
    private final WebClient.Builder webClientBuilder;

    /**
     * Generate Keycloak login URL
     */
    public String generateLoginUrl(String state) {
        return String.format("%s?client_id=%s&redirect_uri=%s&response_type=code&scope=openid profile email&state=%s",
                keycloakProperties.getAuthorizationUrl(),
                keycloakProperties.getClientId(),
                keycloakProperties.getRedirectUri(),
                state);
    }

    /**
     * Exchange authorization code for access token
     */
    public Map<String, Object> exchangeCodeForToken(String code) {
        log.info("Exchanging authorization code for token");

        MultiValueMap<String, String> formData = new LinkedMultiValueMap<>();
        formData.add("grant_type", "authorization_code");
        formData.add("client_id", keycloakProperties.getClientId());
        formData.add("client_secret", keycloakProperties.getClientSecret());
        formData.add("code", code);
        formData.add("redirect_uri", keycloakProperties.getRedirectUri());

        WebClient webClient = webClientBuilder.build();

        Map<String, Object> response = webClient.post()
                .uri(keycloakProperties.getTokenUrl())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(BodyInserters.fromFormData(formData))
                .retrieve()
                .bodyToMono(Map.class)
                .block();

        log.info("Token exchange successful");
        return response;
    }

    /**
     * Get user info from Keycloak using access token
     */
    public Map<String, Object> getUserInfo(String accessToken) {
        log.info("Fetching user info from Keycloak");

        WebClient webClient = webClientBuilder.build();

        Map<String, Object> userInfo = webClient.get()
                .uri(keycloakProperties.getUserInfoUrl())
                .header("Authorization", "Bearer " + accessToken)
                .retrieve()
                .bodyToMono(Map.class)
                .block();

        log.info("User info retrieved: {}", userInfo.get("sub"));
        return userInfo;
    }

    /**
     * Validate Keycloak token
     */
    public boolean validateKeycloakToken(String token) {
        try {
            getUserInfo(token);
            return true;
        } catch (Exception e) {
            log.error("Keycloak token validation failed", e);
            return false;
        }
    }
}
