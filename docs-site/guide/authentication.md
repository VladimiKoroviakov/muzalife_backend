# Автентифікація

## Двокрокова Email-реєстрація

```
POST /api/auth/register/initiate
  → Валідація → Перевірка дублікатів → Генерація OTP → Email
POST /api/auth/register/verify
  → Перевірка OTP → Хешування пароля → Створення користувача → JWT
```

### Крок 1 — ініціювання

```http
POST /api/auth/register/initiate
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "Ivan Petrenko"
}
```

**Відповідь:**
```json
{
  "success": true,
  "message": "Код підтвердження відправлено на вашу електронну пошту",
  "email": "user@example.com"
}
```

### Крок 2 — підтвердження OTP

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

**Відповідь:**
```json
{
  "token": "eyJhbGci...",
  "user": { "user_id": 1, "email": "user@example.com", ... }
}
```

## JWT Авторизація

Для захищених ендпоінтів передавайте токен у заголовку:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

Токени підписані HS256, містять `userId` і закінчуються через `JWT_EXPIRES_IN` (за замовчуванням 7 днів).

## OAuth (Google / Facebook)

```http
POST /api/auth/google
Content-Type: application/json

{ "accessToken": "<google_access_token>" }
```

Повертає той самий формат `{ token, user }`.
