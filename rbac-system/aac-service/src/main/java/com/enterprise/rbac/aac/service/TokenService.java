package com.enterprise.rbac.aac.service;

import com.enterprise.rbac.aac.config.JwtProperties;
import com.enterprise.rbac.aac.model.SessionInfo;
import com.enterprise.rbac.aac.model.TenantInfo;
import com.enterprise.rbac.aac.model.TokenPair;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;

/**
 * Token Service - Manages full token lifecycle
 *
 * Features:
 * - Issue access and refresh tokens
 * - Validate token integrity and validity
 * - Refresh expired tokens
 * - Revoke tokens (logout, permission changes)
 * - Session management with Redis
 * - Token blacklisting
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TokenService {

    private final RedisTemplate<String, Object> redisTemplate;
    private final JwtProperties jwtProperties;

    /**
     * Issue temporary token for tenant selection (before final JWT)
     */
    public String issueTempToken(String userId) {
        log.info("Issuing temporary token for user: {}", userId);

        String jti = UUID.randomUUID().toString();

        SecretKey key = Keys.hmacShaKeyFor(jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8));

        String tempToken = Jwts.builder()
                .id(jti)
                .subject(userId)
                .claim("type", "TEMP")
                .issuer(jwtProperties.getIssuer())
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(Instant.now().plusMillis(jwtProperties.getTempTokenExpiration())))
                .signWith(key)
                .compact();

        // Store temp token in Redis with short TTL
        redisTemplate.opsForValue().set(
                "temp_token:" + jti,
                userId,
                jwtProperties.getTempTokenExpiration(),
                TimeUnit.MILLISECONDS
        );

        return tempToken;
    }

    /**
     * Issue final access and refresh tokens after tenant selection
     */
    public TokenPair issueToken(String userId, String tenantId, TenantInfo tenantInfo,
                                String ipAddress, String userAgent) {
        log.info("Issuing token pair for user: {}, tenant: {}", userId, tenantId);

        String sessionId = UUID.randomUUID().toString();
        Instant now = Instant.now();

        // Generate access token
        String accessJti = UUID.randomUUID().toString();
        String accessToken = buildAccessToken(userId, tenantId, tenantInfo, sessionId, accessJti, now);

        // Generate refresh token
        String refreshJti = UUID.randomUUID().toString();
        String refreshToken = buildRefreshToken(userId, tenantId, sessionId, refreshJti, now);

        // Create session
        SessionInfo session = new SessionInfo();
        session.setSessionId(sessionId);
        session.setUserId(userId);
        session.setTenantId(tenantId);
        session.setTenantName(tenantInfo.getName());
        session.setActiveTokens(Arrays.asList(accessJti, refreshJti));
        session.setCreatedAt(now);
        session.setLastActivityAt(now);
        session.setIpAddress(ipAddress);
        session.setUserAgent(userAgent);

        // Store session in Redis
        redisTemplate.opsForValue().set(
                "session:" + sessionId,
                session,
                jwtProperties.getRefreshTokenExpiration(),
                TimeUnit.MILLISECONDS
        );

        log.info("Session created: {}", sessionId);

        return new TokenPair(accessToken, refreshToken, sessionId);
    }

    /**
     * Build access token JWT
     */
    private String buildAccessToken(String userId, String tenantId, TenantInfo tenantInfo,
                                     String sessionId, String jti, Instant now) {
        SecretKey key = Keys.hmacShaKeyFor(jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8));

        return Jwts.builder()
                .id(jti)
                .subject(userId)
                .claim("tenant_id", tenantId)
                .claim("tenant_name", tenantInfo.getName())
                .claim("tenant_code", tenantInfo.getCode())
                .claim("session_id", sessionId)
                .claim("type", "ACCESS")
                .issuer(jwtProperties.getIssuer())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(jwtProperties.getAccessTokenExpiration())))
                .signWith(key)
                .compact();
    }

    /**
     * Build refresh token JWT
     */
    private String buildRefreshToken(String userId, String tenantId, String sessionId,
                                      String jti, Instant now) {
        SecretKey key = Keys.hmacShaKeyFor(jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8));

        return Jwts.builder()
                .id(jti)
                .subject(userId)
                .claim("tenant_id", tenantId)
                .claim("session_id", sessionId)
                .claim("type", "REFRESH")
                .issuer(jwtProperties.getIssuer())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(jwtProperties.getRefreshTokenExpiration())))
                .signWith(key)
                .compact();
    }

    /**
     * Validate token (called by security filter)
     */
    public boolean validateToken(String token) {
        try {
            Claims claims = parseToken(token);

            String jti = claims.getId();
            String type = claims.get("type", String.class);

            // Check if token is blacklisted
            if (Boolean.TRUE.equals(redisTemplate.hasKey("token_blacklist:" + jti))) {
                log.warn("Token is blacklisted: {}", jti);
                return false;
            }

            // For temp tokens, just check Redis existence
            if ("TEMP".equals(type)) {
                return Boolean.TRUE.equals(redisTemplate.hasKey("temp_token:" + jti));
            }

            // For access/refresh tokens, verify session exists
            String sessionId = claims.get("session_id", String.class);
            if (sessionId == null || Boolean.FALSE.equals(redisTemplate.hasKey("session:" + sessionId))) {
                log.warn("Session not found for token: {}", jti);
                return false;
            }

            // Update last activity timestamp
            updateSessionActivity(sessionId);

            return true;

        } catch (Exception e) {
            log.error("Token validation failed", e);
            return false;
        }
    }

    /**
     * Parse and verify JWT token
     */
    public Claims parseToken(String token) {
        SecretKey key = Keys.hmacShaKeyFor(jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8));

        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /**
     * Refresh access token using refresh token
     */
    public TokenPair refreshToken(String refreshToken) {
        Claims claims = parseToken(refreshToken);

        String type = claims.get("type", String.class);
        if (!"REFRESH".equals(type)) {
            throw new IllegalArgumentException("Not a refresh token");
        }

        String userId = claims.getSubject();
        String tenantId = claims.get("tenant_id", String.class);
        String sessionId = claims.get("session_id", String.class);

        // Get session info
        SessionInfo session = (SessionInfo) redisTemplate.opsForValue().get("session:" + sessionId);
        if (session == null) {
            throw new IllegalStateException("Session not found");
        }

        // Issue new access token
        String newAccessJti = UUID.randomUUID().toString();
        TenantInfo tenantInfo = new TenantInfo(tenantId, session.getTenantName(), null, false);
        String newAccessToken = buildAccessToken(userId, tenantId, tenantInfo, sessionId,
                newAccessJti, Instant.now());

        // Update session with new access token
        session.getActiveTokens().add(newAccessJti);
        session.setLastActivityAt(Instant.now());
        redisTemplate.opsForValue().set(
                "session:" + sessionId,
                session,
                jwtProperties.getRefreshTokenExpiration(),
                TimeUnit.MILLISECONDS
        );

        log.info("Token refreshed for session: {}", sessionId);

        return new TokenPair(newAccessToken, refreshToken, sessionId);
    }

    /**
     * Revoke single token (add to blacklist)
     */
    public void revokeToken(String token) {
        Claims claims = parseToken(token);
        String jti = claims.getId();
        Date expiration = claims.getExpiration();

        long ttl = expiration.getTime() - System.currentTimeMillis();
        if (ttl > 0) {
            redisTemplate.opsForValue().set(
                    "token_blacklist:" + jti,
                    "revoked",
                    ttl,
                    TimeUnit.MILLISECONDS
            );
            log.info("Token revoked: {}", jti);
        }
    }

    /**
     * Revoke entire session (logout)
     */
    public void revokeSession(String sessionId) {
        SessionInfo session = (SessionInfo) redisTemplate.opsForValue().get("session:" + sessionId);
        if (session != null) {
            // Blacklist all active tokens
            for (String jti : session.getActiveTokens()) {
                redisTemplate.opsForValue().set(
                        "token_blacklist:" + jti,
                        "revoked",
                        jwtProperties.getRefreshTokenExpiration(),
                        TimeUnit.MILLISECONDS
                );
            }

            // Delete session
            redisTemplate.delete("session:" + sessionId);
            log.info("Session revoked: {}", sessionId);
        }
    }

    /**
     * Revoke all user sessions (when permissions change)
     */
    public void revokeAllUserTokens(String userId) {
        // Find all sessions for this user
        Set<String> keys = redisTemplate.keys("session:*");
        if (keys != null) {
            for (String key : keys) {
                SessionInfo session = (SessionInfo) redisTemplate.opsForValue().get(key);
                if (session != null && session.getUserId().equals(userId)) {
                    revokeSession(session.getSessionId());
                }
            }
        }
        log.info("All tokens revoked for user: {}", userId);
    }

    /**
     * Switch tenant (issue new token with different tenant)
     */
    public TokenPair switchTenant(String currentToken, String newTenantId, TenantInfo newTenantInfo) {
        Claims claims = parseToken(currentToken);
        String userId = claims.getSubject();
        String sessionId = claims.get("session_id", String.class);

        // Revoke current session
        revokeSession(sessionId);

        // Issue new token with new tenant
        SessionInfo session = (SessionInfo) redisTemplate.opsForValue().get("session:" + sessionId);
        return issueToken(userId, newTenantId, newTenantInfo,
                session != null ? session.getIpAddress() : null,
                session != null ? session.getUserAgent() : null);
    }

    /**
     * Update session last activity timestamp
     */
    private void updateSessionActivity(String sessionId) {
        SessionInfo session = (SessionInfo) redisTemplate.opsForValue().get("session:" + sessionId);
        if (session != null) {
            session.setLastActivityAt(Instant.now());
            redisTemplate.opsForValue().set(
                    "session:" + sessionId,
                    session,
                    jwtProperties.getRefreshTokenExpiration(),
                    TimeUnit.MILLISECONDS
            );
        }
    }

    /**
     * Get session info
     */
    public SessionInfo getSession(String sessionId) {
        return (SessionInfo) redisTemplate.opsForValue().get("session:" + sessionId);
    }

    /**
     * Get all active sessions for a user
     */
    public List<SessionInfo> getUserSessions(String userId) {
        List<SessionInfo> sessions = new ArrayList<>();
        Set<String> keys = redisTemplate.keys("session:*");
        if (keys != null) {
            for (String key : keys) {
                SessionInfo session = (SessionInfo) redisTemplate.opsForValue().get(key);
                if (session != null && session.getUserId().equals(userId)) {
                    sessions.add(session);
                }
            }
        }
        return sessions;
    }
}
