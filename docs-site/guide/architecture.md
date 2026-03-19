# Архітектура

## Загальна структура

MuzaLife Backend — REST API на основі **Node.js + Express**, що обслуговує React SPA (MuzaLife Frontend). Сервер використовує PostgreSQL як основне сховище даних і реалізує автентифікацію через JWT та OAuth 2.0.

```
muzalife-backend/
├── config/
│   └── database.js        # Singleton пул підключень до PostgreSQL
├── controllers/
│   ├── authController.js  # Реєстрація, вхід, OAuth
│   ├── productController.js
│   ├── reviewController.js
│   └── ...
├── services/
│   └── verificationService.js  # OTP генерація та валідація
├── middleware/
│   └── authMiddleware.js  # JWT перевірка
├── utils/
│   ├── jwt.js             # generateToken / verifyToken
│   └── urlHelper.js       # constructFullUrl
├── routes/
│   └── ...
├── docs/
│   ├── api/openapi.yaml   # OpenAPI 3.0 специфікація
│   └── jsdoc/             # Згенерована JSDoc документація
└── tests/docs/            # Живі тести-документація
```

## Ключові архітектурні рішення

### Singleton пул підключень до БД

`config/database.js` експортує одне спільне підключення через `pg.Pool`. Це запобігає вичерпанню ліміту з'єднань PostgreSQL при великому трафіку.

```js
// Один пул на весь процес — НЕ створюйте новий Pool у кожному запиті
import { query } from '../config/database.js';
const result = await query('SELECT * FROM products WHERE id = $1', [id]);
```

### Двокроковий процес реєстрації

1. `POST /auth/register` — перевіряє email, генерує OTP, відправляє лист
2. `POST /auth/verify` — перевіряє OTP, лише тоді створює обліковий запис у БД

Це захищає від реєстрації фейкових email-адрес і дозволяє повторне надсилання коду без дублювання користувачів.

### Мінімальний JWT payload

Токени містять лише `userId`, без ролей чи email. Це запобігає проблемі застарілих даних — якщо користувач змінює email, старий токен залишається валідним, але при наступному запиті до БД повертаються актуальні дані.

### Стратегія обробки помилок

Усі контролери обгортають логіку в `try/catch` і повертають структуровані відповіді:

```json
{ "error": "ValidationError", "message": "...", "code": "..." }
```

## Технологічний стек

| Шар | Технологія |
|-----|-----------|
| Runtime | Node.js 20 |
| Фреймворк | Express 4 |
| БД | PostgreSQL 14+ via `pg` |
| Автентифікація | JWT (`jsonwebtoken`), Google OAuth, Facebook OAuth |
| Email | Nodemailer |
| API документація | OpenAPI 3.0 + Swagger UI |
| Тестування | Vitest 2 |
| Документування | JSDoc 3 |
