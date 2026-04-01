# Authentication

## Two-Step Email Registration

```
POST /api/auth/register/initiate
  → Validate → Check duplicates → Generate OTP → Send email
POST /api/auth/register/verify
  → Verify OTP → Hash password → Create user → JWT
```

### Step 1 — Initiate

```http
POST /api/auth/register/initiate
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "Ivan Petrenko"
}
```

**Response `200`:**
```json
{ "success": true, "message": "Verification code sent to your email", "email": "user@example.com" }
```

### Step 2 — Verify OTP

```http
POST /api/auth/register/verify
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "Ivan Petrenko",
  "verificationCode": "123456"
}
```

**Response `201`:**
```json
{ "token": "eyJhbGci...", "user": { "user_id": 1, "email": "user@example.com" } }
```

---

## JWT Authorization

Pass the token in the `Authorization` header for all protected endpoints:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

Tokens are signed with HS256, contain `userId`, and expire after `JWT_EXPIRES_IN` (default 7 days).

---

## OAuth (Google / Facebook)

```http
POST /api/auth/google
Content-Type: application/json

{ "accessToken": "<google_access_token>" }
```

```http
POST /api/auth/facebook
Content-Type: application/json

{ "accessToken": "<facebook_access_token>" }
```

Both return `{ token, user }`.
