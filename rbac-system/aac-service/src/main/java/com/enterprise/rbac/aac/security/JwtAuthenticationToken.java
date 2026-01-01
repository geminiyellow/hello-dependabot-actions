package com.enterprise.rbac.aac.security;

import io.jsonwebtoken.Claims;
import lombok.Getter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;

import java.util.Collection;

/**
 * Custom authentication token that includes tenant context
 */
@Getter
public class JwtAuthenticationToken extends UsernamePasswordAuthenticationToken {

    private final String userId;
    private final String tenantId;
    private final String sessionId;
    private final Claims claims;

    public JwtAuthenticationToken(String userId,
                                   String tenantId,
                                   String sessionId,
                                   Claims claims,
                                   Collection<? extends GrantedAuthority> authorities) {
        super(userId, null, authorities);
        this.userId = userId;
        this.tenantId = tenantId;
        this.sessionId = sessionId;
        this.claims = claims;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return null;
    }

    @Override
    public Object getPrincipal() {
        return userId;
    }
}
