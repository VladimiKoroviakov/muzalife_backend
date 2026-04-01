# Архітектура

## Стек технологій

| Шар | Технологія |
|-----|-----------|
| Runtime | Node.js 20 LTS |
| Framework | Express.js 4 (ES6 modules) |
| База даних | PostgreSQL 15+ |
| Автентифікація | JWT + OAuth 2.0 (Google, Facebook) |
| Завантаження файлів | Multer (50 MB) |
| Email | Nodemailer (SMTP) |
| Логування | Winston + daily-rotate-file |
| Тести | Vitest |

## Порядок middleware

```
CORS → express.json() → requestLogger → performanceMonitor
  → static /uploads/ → Swagger UI → маршрути API
  → 404 handler → globalErrorHandler
```

`globalErrorHandler` повинен бути останнім — він перехоплює всі помилки, що пробулькали вгору по стеку.

## Шари застосунку

```
routes/          — HTTP-маршрути та валідація вхідних даних
controllers/     — бізнес-логіка та запити до БД
services/        — зовнішні інтеграції (Email, OAuth)
middleware/      — auth, логування, обробка помилок
utils/           — JWT, кеш, логер, AppError
config/          — пул підключень до БД, Multer
```

## База даних

Єдиний пул підключень (`config/database.js`) розподіляється між усіма маршрутами. Усі запити параметризовані (захист від SQL-ін'єкцій).

Основні таблиці: `Users`, `Products`, `ProductTypes`, `Reviews`, `Files`, `FAQs`, `Polls`, `PersonalOrders`, `ProductViews`.

## Обробка помилок

Кидайте підкласи `AppError` (`NotFoundError`, `ConflictError`, `ForbiddenError` тощо) — `globalErrorHandler` автоматично класифікує та перетворює їх на відповідну HTTP-відповідь із двомовним повідомленням.

## Кешування

`utils/cache.js` — простий in-memory кеш з TTL. Зараз використовується для каталогу продуктів (ключі `"products:all"` та `"products:<id>"`, TTL 5 хвилин). Кеш інвалідується після кожної записової операції.
