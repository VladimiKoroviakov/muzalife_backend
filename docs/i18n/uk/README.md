# MuzaLife Backend — Документація (Українська)

> Ця тека містить документацію українською мовою.
> Англійська версія знаходиться у `docs/i18n/en/`.

## Зміст

- [Стандарти документування](#стандарти-документування)
- [Структура проєкту](#структура-проєкту)
- [Автентифікація](#автентифікація)
- [API Огляд](#api-огляд)
- [Інструменти](#інструменти)
- [Внесок у проєкт](#внесок-у-проєкт)

---

## Стандарти документування

| Рівень | Стандарт | Інструмент |
|--------|----------|------------|
| Модуль / файл | JSDoc 3 `@fileoverview` | JSDoc |
| Функція / клас | JSDoc 3 `@param`, `@returns`, `@throws`, `@example` | JSDoc |
| REST API | OpenAPI 3.0 | swagger-ui-express |
| Якість | eslint-plugin-jsdoc | ESLint |
| Живі приклади | Vitest living docs | Vitest |

---

## Структура проєкту

```
MuzaLife Backend/
├── certs/             — HTTPS сертифікати (не комітяться)
├── config/
│   ├── database.js    — пул з'єднань PostgreSQL (singleton)
│   └── multer.js      — конфігурація завантаження файлів (50 MB)
├── controllers/       — обробники запитів (бізнес-логіка + запити до БД)
├── middleware/
│   ├── auth.js        — перевірка JWT (user, guest, any)
│   ├── errorHandler.js
│   ├── performanceMonitor.js
│   └── requestLogger.js
├── routes/            — 15 модулів маршрутів Express
├── services/          — зовнішні інтеграції (email, OAuth, LiqPay)
├── utils/
│   ├── AppError.js    — власні класи помилок (400–502)
│   ├── cache.js       — in-memory кеш з TTL
│   ├── jwt.js         — генерація та верифікація токенів
│   ├── logger.js      — Winston logger wrapper
│   ├── urlHelper.js   — відносні шляхи → абсолютні URL
│   └── watermark.js   — водяний знак (PDF, DOCX, PPTX, зображення)
├── scripts/
│   └── setupDatabase.js
├── tests/docs/        — living documentation тести
└── docs/
    ├── api/openapi.yaml  — OpenAPI 3.0 специфікація
    ├── jsdoc/            — HTML довідник (автогенерація)
    ├── jsdoc.zip         — архів документації
    └── i18n/             — ця тека
```

---

## Автентифікація

### Двокрокова Email-реєстрація

1. `POST /api/auth/register/initiate` — надсилає 6-значний OTP на email (TTL 15 хв)
2. `POST /api/auth/register/verify` — перевіряє OTP, створює користувача, повертає JWT

### JWT

- Алгоритм підпису: **HS256**
- Payload містить: `userId`, `iat`, `exp`
- Термін дії: `JWT_EXPIRES_IN` (за замовчуванням 7 днів)
- Передача: `Authorization: Bearer <token>`

### OAuth

- Google: `POST /api/auth/google` з Google Access Token
- Facebook: `POST /api/auth/facebook` з Facebook Access Token

### Гостьові токени

- `POST /api/auth/guest/verify/initiate` — ініціювати верифікацію гостьового email
- `POST /api/auth/guest/verify/confirm` — підтвердити email, отримати guest JWT
- Guest JWT приймається платіжними ендпоінтами через `authenticateAnyToken`

---

## API Огляд

Базовий URL: `https://localhost:5001/api`

Живий Swagger UI: `https://localhost:5001/api/docs`

Повна специфікація: `docs/api/openapi.yaml`

| Група | Префікс | Захист |
|-------|---------|--------|
| Auth | `/auth` | Публічно |
| Users | `/users` | JWT |
| Products | `/products` | GET публічно; мутації — admin |
| Saved Products | `/saved-products` | JWT |
| Bought Products | `/bought-products` | JWT |
| Reviews | `/reviews` | Читання — публічно; запис — JWT |
| FAQs | `/faqs` | Публічно |
| Polls | `/polls` | Голосування — JWT |
| Personal Orders | `/personal-orders` | JWT (власник або admin) |
| Payments | `/payments` | JWT або guest token |
| Analytics | `/analytics` | JWT + Admin |
| Metadata | `/metadata` | Публічно (кеш 1 год) |
| APM | `/apm` | Публічно |
| Client Errors | `/errors/client` | Публічно |
| Facebook Admin | `/admin` | JWT + Admin |

---

## Інструменти

### Генерація документації

```bash
# Генерувати JSDoc HTML → docs/jsdoc/
npm run docs

# Очистити та повторно згенерувати
npm run docs:clean

# Створити архів docs/jsdoc.zip
npm run docs:archive

# Запустити VitePress docs site локально
npm run docs:site
```

### Перевірка якості документації

```bash
# Перевірити наявність JSDoc коментарів
npm run lint:docs
```

### Живі тести-документація

```bash
# Запустити тести у tests/docs/
npm run test:docs

# Запустити всі тести
npm test
```

---

## Внесок у проєкт

1. Кожна нова публічна функція повинна мати JSDoc коментар із `@param`, `@returns`, `@example`
2. Кожен новий модуль повинен мати `@fileoverview`
3. Нові API ендпоінти додавайте до `docs/api/openapi.yaml`
4. Для нових утилітів додавайте тест-документацію у `tests/docs/`
