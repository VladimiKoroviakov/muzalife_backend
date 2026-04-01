# Auth API

Базовий префікс: `/api/auth`

## Реєстрація (двокрокова)

### Крок 1 — ініціювання

```http
POST /api/auth/register/initiate
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "Іван Петренко"
}
```

Надсилає 6-значний код підтвердження на вказану email-адресу.

**Відповідь `200`:**
```json
{ "success": true, "message": "Код підтвердження відправлено", "email": "user@example.com" }
```

### Крок 2 — підтвердження

```http
POST /api/auth/register/verify
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "Іван Петренко",
  "verificationCode": "123456"
}
```

**Відповідь `201`:**
```json
{ "token": "eyJhbGci...", "user": { "user_id": 1, "email": "user@example.com", "name": "Іван Петренко" } }
```

### Повторна відправка коду

```http
POST /api/auth/register/resend-code
Content-Type: application/json

{ "email": "user@example.com" }
```

---

## Вхід

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "securepassword" }
```

**Відповідь `200`:**
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

Обидва ендпоінти повертають `{ token, user }`.

---

## Коди помилок

| Код | Причина |
|-----|---------|
| 400 | Невалідні дані або невірний/прострочений OTP |
| 409 | Email вже зареєстровано |
| 401 | Невірний пароль або email |
