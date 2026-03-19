# Auth API

Base prefix: `/api/auth`

Full interactive documentation: [Swagger UI](https://localhost:5001/api/docs)

## Registration (Two-Step)

### `POST /auth/register` — Initiate registration

Validates email uniqueness and sends an OTP verification code.

**Request body:**
```json
{ "email": "user@example.com", "password": "SecurePass123!", "name": "John Doe" }
```

**Response `200`:**
```json
{ "message": "Verification code sent to user@example.com" }
```

---

### `POST /auth/verify` — Verify email and create account

**Request body:**
```json
{ "email": "user@example.com", "code": "123456" }
```

**Response `201`:**
```json
{ "token": "<jwt>", "user": { "id": 1, "email": "user@example.com", "name": "John Doe" } }
```

---

## Login

### `POST /auth/login`

```json
{ "email": "user@example.com", "password": "SecurePass123!" }
```

**Response `200`:** `{ token, user }`

---

## OAuth

### `POST /auth/google`

```json
{ "credential": "<google_id_token>" }
```

### `POST /auth/facebook`

```json
{ "accessToken": "<fb_access_token>", "userID": "..." }
```

Both return `{ token, user }`.

---

## Resend Code

### `POST /auth/resend-code`

```json
{ "email": "user@example.com" }
```

**Response `200`:** `{ "message": "New code sent" }`
