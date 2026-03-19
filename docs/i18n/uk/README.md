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
├── config/
│   └── database.js       — пул з'єднань PostgreSQL (singleton)
├── controllers/
│   └── authController.js — двокрокова реєстрація, логін, OAuth
├── middleware/
│   └── auth.js           — перевірка JWT Bearer токена
├── routes/               — Express маршрути
├── services/
│   ├── emailService.js   — Nodemailer singleton транспортер
│   └── verificationService.js — OTP lifecycle
├── utils/
│   ├── jwt.js            — генерація та верифікація токенів
│   └── urlHelper.js      — відносні шляхи → абсолютні URL
└── docs/
    ├── api/openapi.yaml  — OpenAPI 3.0 специфікація
    ├── jsdoc/            — HTML довідник (автогенерація)
    ├── jsdoc.zip         — архів документації
    └── i18n/             — ця тека
```

---

## Автентифікація

### Двокрокова Email-реєстрація

1. `POST /api/auth/register/initiate` — надсилає 6-значний OTP на email
2. `POST /api/auth/register/verify` — перевіряє OTP, створює користувача, повертає JWT

### JWT

- Алгоритм підпису: **HS256**
- Payload містить: `userId`, `iat`, `exp`
- Термін дії: `JWT_EXPIRES_IN` (за замовчуванням 7 днів)
- Передача: `Authorization: Bearer <token>`

### OAuth

- Google: `POST /api/auth/google` з Google Access Token
- Facebook: `POST /api/auth/facebook` з Facebook Access Token

---

## API Огляд

Базовий URL: `https://localhost:5001/api`

| Метод | Ендпоінт | Опис |
|-------|---------|------|
| GET | /health | Стан сервера |
| POST | /auth/register/initiate | Крок 1 реєстрації |
| POST | /auth/register/verify | Крок 2 реєстрації |
| POST | /auth/login | Вхід |
| GET | /products | Список продуктів |
| GET | /reviews | Список відгуків |
| GET | /faqs | Часті питання |

Повна специфікація: `docs/api/openapi.yaml`
Живий Swagger UI: `https://localhost:5001/api/docs`

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

1. Кожна нова функція повинна мати JSDoc коментар із `@param`, `@returns`, `@example`
2. Кожен новий модуль повинен мати `@fileoverview`
3. Нові API ендпоінти додавайте до `docs/api/openapi.yaml`
4. Для нових утилітів додавайте тест-документацію у `tests/docs/`
