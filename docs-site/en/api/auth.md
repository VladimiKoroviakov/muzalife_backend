# Auth API

Base prefix: `/api/auth`

## Registration (two-step)

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

Sends a 6-digit verification code to the provided email address.

**Response `200`:**
```json
{ "success": true, "message": "Verification code sent", "email": "user@example.com" }
```

### Step 2 — Verify

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
{ "token": "eyJhbGci...", "user": { "user_id": 1, "email": "user@example.com", "name": "Ivan Petrenko" } }
```

### Resend code

```http
POST /api/auth/register/resend-code
Content-Type: application/json

{ "email": "user@example.com" }
```

---

## Login

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "securepassword" }
```

**Response `200`:**
```json
{ "token": "eyJhbGci...", "user": { "user_id": 1, "email": "user@example.com" } }
```

---

## OAuth

### Google

```http
POST /api/auth/google
Content-Type: application/json

{ "accessToken": "<google_access_token>" }
```

### Facebook

```http
POST /api/auth/facebook
Content-Type: application/json

{ "accessToken": "<facebook_access_token>" }
```

Both return `{ token, user }`.

---

## Error codes

| Code | Reason |
|------|--------|
| 400 | Invalid input or wrong/expired OTP |
| 409 | Email already registered |
| 401 | Wrong password or email |
