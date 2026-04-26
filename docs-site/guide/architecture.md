# Архітектура

## Стек технологій

| Шар | Технологія |
|-----|-----------|
| Runtime | Node.js 20 LTS |
| Framework | Express.js 4 (ES Modules) |
| База даних | PostgreSQL 15+ (порт 5433 у dev) |
| Автентифікація | JWT + OAuth 2.0 (Google, Facebook) + guest tokens |
| Завантаження файлів | Multer (50 MB) |
| Обробка файлів | sharp (зображення), pdf-lib (PDF), adm-zip (ZIP/RAR) |
| Email | Nodemailer (SMTP) |
| Платежі | LiqPay |
| Логування | Winston |
| Тести | Vitest |

## Порядок middleware

```
CORS → express.json() → requestLogger → performanceMonitor
  → static /uploads/ → Swagger UI → маршрути API
  → 404 handler → globalErrorHandler
```

`globalErrorHandler` повинен бути останнім — він перехоплює всі помилки стеку.

## Маршрути API

| Префікс | Файл | Доступ |
|---------|------|--------|
| `/auth` | `routes/auth.js` | Публічно |
| `/users` | `routes/users.js` | JWT |
| `/products` | `routes/products.js` | GET публічно; мутації — admin |
| `/saved-products` | `routes/savedProducts.js` | JWT |
| `/bought-products` | `routes/boughtProducts.js` | JWT |
| `/reviews` | `routes/reviews.js` | GET публічно; запис — JWT |
| `/faqs` | `routes/faqs.js` | Публічно |
| `/polls` | `routes/polls.js` | Голосування — JWT |
| `/personal-orders` | `routes/personalOrders.js` | JWT (власник або admin) |
| `/payments` | `routes/payments.js` | JWT або guest token |
| `/analytics` | `routes/analytics.js` | JWT + admin |
| `/metadata` | `routes/metadata.js` | Публічно (кеш 1 год) |
| `/apm` | `routes/apm.js` | Публічно |
| `/errors/client` | `routes/clientErrors.js` | Публічно |
| `/admin` | `routes/facebookAdmin.js` | JWT + admin |

## Шари застосунку

```
routes/          — HTTP-маршрути та валідація вхідних даних
controllers/     — бізнес-логіка та запити до БД
services/        — зовнішні інтеграції (Email, OAuth, LiqPay)
middleware/      — auth, логування, обробка помилок, APM
utils/           — JWT, кеш, логер, AppError, watermark, urlHelper
config/          — пул підключень до БД, Multer
```

## Автентифікація

`middleware/auth.js` надає три стратегії:

| Функція | Призначення |
|---------|-------------|
| `authenticateToken` | Звичайний JWT-користувач → `req.userId` |
| `authenticateGuestToken` | Гостьовий JWT → `req.guestEmail` |
| `authenticateAnyToken` | Приймає user або guest JWT (endpoint платежів) |

Токен береться з `Authorization: Bearer <token>`. Повертає 401 (відсутній) або 403 (недійсний / прострочений).

## База даних

Єдиний пул підключень (`config/database.js`) розподіляється між усіма маршрутами. Усі запити параметризовані (`$1`, `$2`…) для захисту від SQL-ін'єкцій.

**Основні таблиці:** `Users`, `Products`, `ProductTypes`, `AgeCategories`, `Events`, `Images`, `Files`, `Reviews`, `FAQs`, `Polls`, `PollVotes`, `PersonalOrders`, `PersonalOrderFiles`, `EmailVerificationCodes`, `ProductViews`.

**Junction-таблиці:** `ProductAgeCategories`, `ProductEvents`, `ProductImages`, `ProductFiles`, `SavedUserProducts`, `BoughtUserProducts`, `GuestPurchases`, `PollUserVotes`, `ProductReviews`.

## Обробка помилок

Завжди кидайте підкласи `AppError` (`NotFoundError`, `ConflictError`, `ForbiddenError` тощо) — ніколи `new Error()`. `globalErrorHandler` автоматично класифікує та перетворює їх на відповідну HTTP-відповідь із двомовним повідомленням (`uk`/`en`).

Доступні класи помилок: `ValidationError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409), `UnprocessableError` (422), `RateLimitError` (429), `InternalError` (500), `ExternalServiceError` (502).

## Кешування

`utils/cache.js` — простий in-memory кеш з TTL. Поточні ключі:

| Ключ | TTL |
|------|-----|
| `"products:all"` | 5 хвилин |
| `"products:<id>"` | 5 хвилин |
| `"faqs:all"` | 10 хвилин |
| `"metadata:types"`, `"metadata:age-categories"`, `"metadata:events"` | 1 година |

Кеш інвалідується після кожної записової операції.

## Платежі (LiqPay)

Три канали оплати:

1. **Одиничний продукт** — `POST /api/payments/product/:productId/initiate` (JWT)
2. **Персональне замовлення** — `POST /api/payments/order/:orderId/initiate` (JWT)
3. **Кошик** — `POST /api/payments/cart/initiate` (user або guest JWT)

Після успішного платежу LiqPay викликає `POST /api/payments/callback` (signature-verified webhook). Сервер автоматично надсилає матеріали покупцеві на email.

## Доставка файлів та водяний знак

При завантаженні файлів через admin (`POST /api/products` або `/personal-orders/:id/files`) `utils/watermark.js` автоматично накладає водяний знак на підтримувані формати: PDF, DOCX, PPTX, JPEG, PNG, ZIP, RAR. Помилка водяного знака не є фатальною — файл зберігається без нього.

Після підтвердження платежу сервер надсилає email із посиланнями на файли покупцю.

## Моніторинг продуктивності (APM)

`middleware/performanceMonitor.js` відстежує затримки per-route у рухомому вікні (500 останніх запитів). Доступні ендпоінти:

- `GET /api/apm/stats` — p50/p95/p99 + статистика кешу + пам'ять
- `GET /api/apm/health` — liveness check з uptime
