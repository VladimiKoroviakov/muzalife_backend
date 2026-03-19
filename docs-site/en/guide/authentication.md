# Authentication

MuzaLife Backend supports three authentication methods: email/password with OTP verification, Google OAuth 2.0, and Facebook OAuth.

## Email Registration (Two-Step)

Registration is intentionally two-step to verify email ownership before creating the account.

**Step 1** — `POST /api/auth/register`

```json
{ "email": "user@example.com", "password": "SecurePass123!", "name": "John Doe" }
```

The server generates a 6-digit OTP and sends it to the provided email.

**Step 2** — `POST /api/auth/verify`

```json
{ "email": "user@example.com", "code": "123456" }
```

On success, the account is created and a JWT is returned.

## Login

`POST /api/auth/login`

```json
{ "email": "user@example.com", "password": "SecurePass123!" }
```

Returns `{ token, user }`.

## OAuth

**Google:** `POST /api/auth/google` with `{ credential: "<google_id_token>" }`

**Facebook:** `POST /api/auth/facebook` with `{ accessToken, userID }`

Both providers return the same `{ token, user }` response format.

## JWT Usage

Include the token in the `Authorization` header for protected endpoints:

```http
Authorization: Bearer <your_jwt_token>
```

Tokens are signed with `JWT_SECRET` and expire after the duration set in `JWT_EXPIRES_IN` (default: `7d`).

## Token Payload

The JWT payload contains only `{ userId }` — no roles or email. This keeps tokens minimal and avoids stale data issues.
