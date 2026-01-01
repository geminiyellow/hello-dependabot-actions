package com.enterprise.rbac.aac.security;

import com.enterprise.rbac.aac.service.TokenService;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;

/**
 * JWT Authentication Filter
 *
 * Validates JWT tokens on every request and sets authentication context
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final TokenService tokenService;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        // Extract token from Authorization header
        String token = extractTokenFromRequest(request);

        if (token != null) {
            try {
                // Validate token (checks blacklist, session existence, expiration)
                if (tokenService.validateToken(token)) {
                    // Parse claims
                    Claims claims = tokenService.parseToken(token);

                    String userId = claims.getSubject();
                    String type = claims.get("type", String.class);

                    // Only set authentication for ACCESS tokens (not TEMP or REFRESH)
                    if ("ACCESS".equals(type)) {
                        String tenantId = claims.get("tenant_id", String.class);
                        String sessionId = claims.get("session_id", String.class);

                        // Create authentication token
                        JwtAuthenticationToken authentication = new JwtAuthenticationToken(
                                userId,
                                tenantId,
                                sessionId,
                                claims,
                                Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER"))
                        );

                        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

                        // Set authentication in security context
                        SecurityContextHolder.getContext().setAuthentication(authentication);

                        log.debug("Authentication set for user: {}, tenant: {}", userId, tenantId);
                    }
                } else {
                    log.warn("Invalid token from IP: {}", request.getRemoteAddr());
                }
            } catch (Exception e) {
                log.error("Token authentication failed", e);
                SecurityContextHolder.clearContext();
            }
        }

        filterChain.doFilter(request, response);
    }

    /**
     * Extract JWT token from Authorization header
     */
    private String extractTokenFromRequest(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");

        if (bearerToken != null && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }

        return null;
    }

    /**
     * Skip filter for public endpoints
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();

        // Public endpoints that don't require authentication
        return path.startsWith("/auth/login") ||
               path.startsWith("/auth/callback") ||
               path.startsWith("/auth/select-tenant") ||
               path.startsWith("/actuator/health") ||
               path.equals("/");
    }
}
