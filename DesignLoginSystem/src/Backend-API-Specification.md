# Healthcare Authentication System - Backend API Specification

## Overview

This document outlines the complete backend API requirements for a HIPAA-compliant, production-grade authentication system supporting both single-tenant and multi-tenant healthcare applications. The system includes login, multi-factor authentication, password reset, offline session management, and maintenance mode support.

## System Architecture Requirements

### Security & Compliance
- **HIPAA Compliance**: All endpoints must log access appropriately and handle PHI with proper encryption
- **Rate Limiting**: Implement aggressive rate limiting on all authentication endpoints
- **Session Management**: Support both traditional sessions and JWT tokens
- **Encryption**: All sensitive data must be encrypted at rest and in transit
- **Audit Logging**: All authentication events must be logged for compliance

### Multi-Tenancy Support
- **Clinic Codes**: Support optional clinic code validation for multi-tenant deployments
- **Tenant Isolation**: Ensure complete data isolation between tenants
- **Configuration**: Per-tenant authentication settings (MFA requirements, password policies, etc.)

## API Endpoints

### 1. Login Authentication

**Endpoint**: `POST /api/auth/login`

**Request Body**:
```json
{
  "clinicCode": "string", // Optional - only for multi-tenant
  "emailOrUsername": "string", // Required
  "password": "string", // Required
  "rememberMe": "boolean" // Optional - extends session duration
}
```

**Response Success (200)**:
```json
{
  "success": true,
  "requiresMFA": false,
  "user": {
    "id": "string",
    "email": "string",
    "name": "string",
    "role": "string",
    "clinicId": "string" // If multi-tenant
  },
  "tokens": {
    "accessToken": "string",
    "refreshToken": "string",
    "expiresIn": "number"
  },
  "permissions": ["string"]
}
```

**Response MFA Required (200)**:
```json
{
  "success": true,
  "requiresMFA": true,
  "mfaSessionToken": "string", // Temporary token for MFA verification
  "mfaMethod": "totp|sms|email"
}
```

**Error Responses**:
- `400` - Invalid request format
- `401` - Invalid credentials (`INVALID_CREDENTIALS`)
- `423` - Account locked (`ACCOUNT_LOCKED`)
- `429` - Rate limited
- `500` - Server error

**Rate Limiting**: 5 attempts per 15 minutes per IP/email combination

**Security Features**:
- Account lockout after 5 failed attempts (15-minute cooldown)
- Progressive delays between failed attempts
- Audit log all login attempts

### 2. Multi-Factor Authentication Verification

**Endpoint**: `POST /api/auth/verify-mfa`

**Request Body**:
```json
{
  "code": "string", // 6-digit MFA code
  "mfaSessionToken": "string" // From login response
}
```

**Response Success (200)**:
```json
{
  "success": true,
  "user": {
    "id": "string",
    "email": "string",
    "name": "string",
    "role": "string",
    "clinicId": "string"
  },
  "tokens": {
    "accessToken": "string",
    "refreshToken": "string",
    "expiresIn": "number"
  },
  "permissions": ["string"]
}
```

**Error Responses**:
- `400` - Invalid code format
- `401` - Invalid or expired MFA code
- `429` - Rate limited
- `500` - Server error

**Rate Limiting**: 3 attempts per 5 minutes per session token

### 3. Resend MFA Code

**Endpoint**: `POST /api/auth/resend-mfa`

**Request Body**:
```json
{
  "mfaSessionToken": "string"
}
```

**Response Success (200)**:
```json
{
  "success": true,
  "message": "Verification code sent"
}
```

**Rate Limiting**: 1 request per 60 seconds per session token

### 4. Forgot Password Request

**Endpoint**: `POST /api/auth/forgot-password`

**Request Body**:
```json
{
  "clinicCode": "string", // Optional - only for multi-tenant
  "email": "string" // Required
}
```

**Response Success (200)**:
```json
{
  "success": true,
  "message": "If an account exists, reset instructions have been sent"
}
```

**Error Responses**:
- `400` - Invalid email format
- `429` - Rate limited (`RATE_LIMITED`)
- `500` - Server error

**Rate Limiting**: 3 requests per 15 minutes per IP address

**Security Features**:
- Never reveal if email exists in system
- Generate secure reset tokens with 1-hour expiration
- Invalidate previous reset tokens when new one is generated
- Send email with reset link containing token

### 5. Password Reset

**Endpoint**: `POST /api/auth/reset-password`

**Request Body**:
```json
{
  "token": "string", // Reset token from email
  "newPassword": "string", // Must meet password policy
  "confirmPassword": "string"
}
```

**Response Success (200)**:
```json
{
  "success": true,
  "message": "Password successfully reset"
}
```

**Error Responses**:
- `400` - Invalid token or passwords don't match
- `422` - Password doesn't meet requirements
- `500` - Server error

**Security Features**:
- Validate password strength requirements
- Invalidate all existing sessions for the user
- Log password reset event

### 6. Session Validation

**Endpoint**: `GET /api/auth/validate`

**Headers**: `Authorization: Bearer <accessToken>`

**Response Success (200)**:
```json
{
  "valid": true,
  "user": {
    "id": "string",
    "email": "string",
    "name": "string",
    "role": "string",
    "clinicId": "string"
  },
  "permissions": ["string"]
}
```

**Error Responses**:
- `401` - Invalid or expired token
- `500` - Server error

### 7. Token Refresh

**Endpoint**: `POST /api/auth/refresh`

**Request Body**:
```json
{
  "refreshToken": "string"
}
```

**Response Success (200)**:
```json
{
  "success": true,
  "tokens": {
    "accessToken": "string",
    "refreshToken": "string",
    "expiresIn": "number"
  }
}
```

### 8. Logout

**Endpoint**: `POST /api/auth/logout`

**Headers**: `Authorization: Bearer <accessToken>`

**Request Body**:
```json
{
  "refreshToken": "string" // Optional - for complete logout
}
```

**Response Success (200)**:
```json
{
  "success": true,
  "message": "Successfully logged out"
}
```

## System Status Endpoints

### 9. System Status

**Endpoint**: `GET /api/system/status`

**Response Success (200)**:
```json
{
  "status": "operational|maintenance|degraded",
  "maintenanceMode": false,
  "message": "string" // Optional maintenance message
}
```

## Offline Session Support

### Requirements
- Generate offline session tokens for desktop applications
- Offline tokens should have extended expiration (7-30 days)
- Include necessary user data and permissions in offline token
- Validate offline tokens when online connectivity is restored

### 10. Create Offline Session

**Endpoint**: `POST /api/auth/offline-session`

**Headers**: `Authorization: Bearer <accessToken>`

**Response Success (200)**:
```json
{
  "success": true,
  "offlineToken": "string", // Encrypted token with user data
  "expiresAt": "ISO 8601 datetime",
  "userData": {
    "id": "string",
    "email": "string",
    "name": "string",
    "role": "string",
    "permissions": ["string"]
  }
}
```

## Database Schema Requirements

### Users Table
```sql
users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100) NOT NULL,
  clinic_id UUID, -- For multi-tenant
  mfa_enabled BOOLEAN DEFAULT false,
  mfa_secret VARCHAR(255),
  account_locked_until TIMESTAMP,
  failed_login_attempts INTEGER DEFAULT 0,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Clinics Table (Multi-tenant)
```sql
clinics (
  id UUID PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  settings JSONB, -- Auth settings, password policies, etc.
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Sessions Table
```sql
sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  token_hash VARCHAR(255) NOT NULL,
  refresh_token_hash VARCHAR(255),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_accessed TIMESTAMP DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  offline_session BOOLEAN DEFAULT false
);
```

### Password Reset Tokens
```sql
password_reset_tokens (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Audit Logs
```sql
audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL, -- LOGIN, LOGOUT, PASSWORD_RESET, etc.
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Configuration Requirements

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://...

# JWT Configuration
JWT_SECRET=<strong-secret>
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d
JWT_OFFLINE_TOKEN_EXPIRY=30d

# Rate Limiting
REDIS_URL=redis://...
LOGIN_RATE_LIMIT=5
MFA_RATE_LIMIT=3
FORGOT_PASSWORD_RATE_LIMIT=3

# Email Configuration
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=

# Multi-tenant
MULTI_TENANT_ENABLED=false

# Security
BCRYPT_ROUNDS=12
ACCOUNT_LOCKOUT_DURATION=15m
FAILED_LOGIN_THRESHOLD=5

# Application
APP_URL=https://your-app.com
MAINTENANCE_MODE=false
```

## Security Best Practices

### Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character
- No common passwords or dictionary words

### Token Security
- Use secure random token generation
- Implement token rotation
- Set appropriate expiration times
- Use secure HTTP-only cookies when possible

### Rate Limiting Implementation
- Use Redis or similar for distributed rate limiting
- Implement progressive delays for failed attempts
- Block suspicious IP addresses temporarily

### Audit Requirements
- Log all authentication events
- Include IP address, user agent, timestamp
- Store success/failure status
- Implement log retention policies
- Enable real-time alerting for suspicious activity

## Error Handling Standards

### Error Response Format
```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {} // Optional additional context
}
```

### Error Codes
- `INVALID_CREDENTIALS` - Wrong email/password
- `ACCOUNT_LOCKED` - Account temporarily locked
- `MFA_REQUIRED` - Multi-factor authentication needed
- `INVALID_MFA_CODE` - Wrong MFA code
- `USER_NOT_FOUND` - User doesn't exist (for password reset)
- `RATE_LIMITED` - Too many requests
- `MAINTENANCE_MODE` - System in maintenance
- `INVALID_TOKEN` - Token expired or invalid
- `PASSWORD_POLICY_VIOLATION` - Password doesn't meet requirements

## Testing Requirements

### Unit Tests
- Test all authentication flows
- Test rate limiting mechanisms
- Test error conditions
- Test security edge cases

### Integration Tests
- Test database interactions
- Test email sending
- Test session management
- Test multi-tenant isolation

### Security Tests
- Penetration testing
- Rate limiting validation
- Token security validation
- SQL injection prevention
- XSS prevention

## Monitoring & Alerts

### Metrics to Track
- Login success/failure rates
- MFA usage rates
- Password reset frequency
- Account lockout frequency
- API response times
- Rate limiting triggers

### Alerts
- Unusual login patterns
- High failure rates
- System errors
- Rate limiting threshold breaches
- Maintenance mode activation

## Deployment Considerations

### Infrastructure
- Use HTTPS everywhere
- Implement proper CORS policies
- Use secure headers (HSTS, CSP, etc.)
- Regular security updates
- Backup and disaster recovery plans

### Scaling
- Horizontal scaling support
- Database connection pooling
- Redis clustering for rate limiting
- Load balancer session affinity

This specification provides a complete foundation for building a secure, HIPAA-compliant authentication system that supports all the frontend functionality implemented in the React application.