# Auth API

Базовий префікс: `/api/auth`

Повна інтерактивна документація доступна через [Swagger UI](https://localhost:5001/api/docs).

## Реєстрація (двокроковий процес)

### `POST /auth/register` — Ініціювати реєстрацію

Перевіряє унікальність email і відправляє OTP-код підтвердження.

**Тіло запиту:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "Іван Іванов"
}
```

**Відповідь `200`:**
```json
{ "message": "Verification code sent to user@example.com" }
```

---

### `POST /auth/verify` — Підтвердити email і створити акаунт

**Тіло запиту:**
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Відповідь `201`:**
```json
{
  "token": "<jwt>",
  "user": { "id": 1, "email": "user@example.com", "name": "Іван Іванов" }
}
```

---

## Вхід

### `POST /auth/login`

**Тіло запиту:**
```json
{ "email": "user@example.com", "password": "SecurePass123!" }
```

**Відповідь `200`:**
```json
{ "token": "<jwt>", "user": { "id": 1, "email": "...", "name": "..." } }
```

---

## OAuth

### `POST /auth/google`

**Тіло запиту:**
```json
{ "credential": "<google_id_token>" }
```

### `POST /auth/facebook`

**Тіло запиту:**
```json
{ "accessToken": "<fb_access_token>", "userID": "..." }
```

Обидва OAuth-ендпоінти повертають ту саму структуру, що й `/auth/login`.

---

## Повторне надсилання коду

### `POST /auth/resend-code`

```json
{ "email": "user@example.com" }
```

**Відповідь `200`:**
```json
{ "message": "New code sent" }
```
