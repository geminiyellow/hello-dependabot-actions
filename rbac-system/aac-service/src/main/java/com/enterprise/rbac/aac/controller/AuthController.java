package com.enterprise.rbac.aac.controller;

import com.enterprise.rbac.aac.dto.AuthResponse;
import com.enterprise.rbac.aac.dto.RefreshTokenRequest;
import com.enterprise.rbac.aac.dto.TenantSelectionRequest;
import com.enterprise.rbac.aac.model.SessionInfo;
import com.enterprise.rbac.aac.model.TenantInfo;
import com.enterprise.rbac.aac.model.TokenPair;
import com.enterprise.rbac.aac.security.JwtAuthenticationToken;
import com.enterprise.rbac.aac.service.ImcClient;
import com.enterprise.rbac.aac.service.KeycloakService;
import com.enterprise.rbac.aac.service.TokenService;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Authentication Controller
 *
 * Endpoints:
 * - GET /auth/login - Initiate Keycloak login
 * - GET /auth/callback - Handle Keycloak callback
 * - POST /auth/select-tenant - Select tenant and get final JWT
 * - POST /auth/refresh - Refresh access token
 * - POST /auth/logout - Logout and revoke tokens
 * - POST /auth/switch-tenant - Switch to different tenant
 * - GET /auth/sessions - Get all user sessions
 */
@Slf4j
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final KeycloakService keycloakService;
    private final ImcClient imcClient;
    private final TokenService tokenService;

    /**
     * Initiate Keycloak login
     *
     * GET /auth/login
     */
    @GetMapping("/login")
    public ResponseEntity<Map<String, String>> login() {
        String state = UUID.randomUUID().toString();
        String loginUrl = keycloakService.generateLoginUrl(state);

        return ResponseEntity.ok(Map.of(
                "loginUrl", loginUrl,
                "state", state
        ));
    }

    /**
     * Handle Keycloak OAuth callback
     *
     * Flow:
     * 1. Exchange authorization code for Keycloak token
     * 2. Get user info from Keycloak
     * 3. Fetch user's tenants from IMC
     * 4. If single tenant: issue final JWT immediately
     * 5. If multiple tenants: return temp token + tenant list
     *
     * GET /auth/callback?code=xxx&state=xxx
     */
    @GetMapping("/callback")
    public ResponseEntity<AuthResponse> callback(
            @RequestParam String code,
            @RequestParam(required = false) String state,
            HttpServletRequest request) {

        log.info("Processing OAuth callback");

        try {
            // 1. Exchange code for Keycloak token
            Map<String, Object> tokenResponse = keycloakService.exchangeCodeForToken(code);
            String keycloakAccessToken = (String) tokenResponse.get("access_token");

            // 2. Get user info from Keycloak
            Map<String, Object> userInfo = keycloakService.getUserInfo(keycloakAccessToken);
            String userId = (String) userInfo.get("sub");

            log.info("User authenticated: {}", userId);

            // 3. Fetch user's tenants from IMC
            List<TenantInfo> tenants = imcClient.getUserTenants(userId);

            if (tenants == null || tenants.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(new AuthResponse("error", null, null, null, null, null,
                                null, null, userId));
            }

            // 4. Single tenant: issue JWT immediately
            if (tenants.size() == 1) {
                TenantInfo tenant = tenants.get(0);
                TokenPair tokenPair = tokenService.issueToken(
                        userId,
                        tenant.getId(),
                        tenant,
                        getClientIp(request),
                        request.getHeader("User-Agent")
                );

                return ResponseEntity.ok(AuthResponse.success(
                        tokenPair.getAccessToken(),
                        tokenPair.getRefreshToken(),
                        tokenPair.getSessionId(),
                        tokenPair.getExpiresIn()
                ));
            }

            // 5. Multiple tenants: return temp token for tenant selection
            String tempToken = tokenService.issueTempToken(userId);

            return ResponseEntity.ok(AuthResponse.tenantSelectionRequired(
                    userId,
                    tempToken,
                    tenants
            ));

        } catch (Exception e) {
            log.error("OAuth callback failed", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Select tenant and issue final JWT
     *
     * POST /auth/select-tenant
     * Authorization: Bearer <temp_token>
     * Body: { "tenantId": "tenant-123" }
     */
    @PostMapping("/select-tenant")
    public ResponseEntity<AuthResponse> selectTenant(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody TenantSelectionRequest request,
            HttpServletRequest httpRequest) {

        log.info("Processing tenant selection");

        try {
            // Extract and validate temp token
            String tempToken = authHeader.replace("Bearer ", "");
            Claims claims = tokenService.parseToken(tempToken);

            String type = claims.get("type", String.class);
            if (!"TEMP".equals(type)) {
                return ResponseEntity.badRequest().build();
            }

            String userId = claims.getSubject();
            String tenantId = request.getTenantId();

            // Verify user has access to this tenant
            if (!imcClient.hasAccessToTenant(userId, tenantId)) {
                return ResponseEntity.status(403).build();
            }

            // Get tenant info
            TenantInfo tenantInfo = imcClient.getTenantInfo(tenantId);

            // Issue final JWT
            TokenPair tokenPair = tokenService.issueToken(
                    userId,
                    tenantId,
                    tenantInfo,
                    getClientIp(httpRequest),
                    httpRequest.getHeader("User-Agent")
            );

            return ResponseEntity.ok(AuthResponse.success(
                    tokenPair.getAccessToken(),
                    tokenPair.getRefreshToken(),
                    tokenPair.getSessionId(),
                    tokenPair.getExpiresIn()
            ));

        } catch (Exception e) {
            log.error("Tenant selection failed", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Refresh access token
     *
     * POST /auth/refresh
     * Body: { "refreshToken": "xxx" }
     */
    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        log.info("Processing token refresh");

        try {
            TokenPair tokenPair = tokenService.refreshToken(request.getRefreshToken());

            return ResponseEntity.ok(AuthResponse.success(
                    tokenPair.getAccessToken(),
                    tokenPair.getRefreshToken(),
                    tokenPair.getSessionId(),
                    tokenPair.getExpiresIn()
            ));

        } catch (Exception e) {
            log.error("Token refresh failed", e);
            return ResponseEntity.status(401).build();
        }
    }

    /**
     * Logout (revoke session)
     *
     * POST /auth/logout
     * Authorization: Bearer <access_token>
     */
    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(
            @AuthenticationPrincipal JwtAuthenticationToken authentication) {

        log.info("Processing logout for session: {}", authentication.getSessionId());

        try {
            tokenService.revokeSession(authentication.getSessionId());

            return ResponseEntity.ok(Map.of("message", "Logged out successfully"));

        } catch (Exception e) {
            log.error("Logout failed", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Switch tenant (issue new JWT with different tenant)
     *
     * POST /auth/switch-tenant
     * Authorization: Bearer <access_token>
     * Body: { "tenantId": "new-tenant-123" }
     */
    @PostMapping("/switch-tenant")
    public ResponseEntity<AuthResponse> switchTenant(
            @AuthenticationPrincipal JwtAuthenticationToken authentication,
            @Valid @RequestBody TenantSelectionRequest request) {

        log.info("Processing tenant switch for user: {}", authentication.getUserId());

        try {
            String userId = authentication.getUserId();
            String newTenantId = request.getTenantId();

            // Verify user has access to new tenant
            if (!imcClient.hasAccessToTenant(userId, newTenantId)) {
                return ResponseEntity.status(403).build();
            }

            // Get new tenant info
            TenantInfo newTenantInfo = imcClient.getTenantInfo(newTenantId);

            // Switch tenant (revoke old session, issue new token)
            String currentToken = extractTokenFromAuth(authentication);
            TokenPair tokenPair = tokenService.switchTenant(currentToken, newTenantId, newTenantInfo);

            return ResponseEntity.ok(AuthResponse.success(
                    tokenPair.getAccessToken(),
                    tokenPair.getRefreshToken(),
                    tokenPair.getSessionId(),
                    tokenPair.getExpiresIn()
            ));

        } catch (Exception e) {
            log.error("Tenant switch failed", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Get all active sessions for current user
     *
     * GET /auth/sessions
     * Authorization: Bearer <access_token>
     */
    @GetMapping("/sessions")
    public ResponseEntity<List<SessionInfo>> getSessions(
            @AuthenticationPrincipal JwtAuthenticationToken authentication) {

        log.info("Fetching sessions for user: {}", authentication.getUserId());

        try {
            List<SessionInfo> sessions = tokenService.getUserSessions(authentication.getUserId());
            return ResponseEntity.ok(sessions);

        } catch (Exception e) {
            log.error("Failed to fetch sessions", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Revoke specific session
     *
     * DELETE /auth/sessions/{sessionId}
     * Authorization: Bearer <access_token>
     */
    @DeleteMapping("/sessions/{sessionId}")
    public ResponseEntity<Map<String, String>> revokeSession(
            @AuthenticationPrincipal JwtAuthenticationToken authentication,
            @PathVariable String sessionId) {

        log.info("Revoking session: {}", sessionId);

        try {
            // Verify session belongs to user
            SessionInfo session = tokenService.getSession(sessionId);
            if (session == null || !session.getUserId().equals(authentication.getUserId())) {
                return ResponseEntity.status(403).build();
            }

            tokenService.revokeSession(sessionId);

            return ResponseEntity.ok(Map.of("message", "Session revoked successfully"));

        } catch (Exception e) {
            log.error("Session revocation failed", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Extract client IP address
     */
    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    /**
     * Extract token from authentication (placeholder - in real impl, get from request)
     */
    private String extractTokenFromAuth(JwtAuthenticationToken authentication) {
        // In real implementation, this would be extracted from the HttpServletRequest
        // For now, we'll reconstruct it from claims (this is a simplified version)
        return null; // TODO: Implement proper token extraction
    }
}
