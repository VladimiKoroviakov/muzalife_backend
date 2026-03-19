# Початок роботи

## Вимоги

| Залежність | Мінімальна версія |
|-----------|------------------|
| Node.js   | 20.x             |
| PostgreSQL | 14+             |
| npm       | 10+              |

## Встановлення

```bash
git clone https://github.com/your-org/muzalife-backend.git
cd muzalife-backend
npm install
```

## Змінні середовища

Створіть файл `.env` у корені проєкту:

```dotenv
# База даних
DB_HOST=localhost
DB_PORT=5432
DB_NAME=muzalife
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_super_secret_key
JWT_EXPIRES_IN=7d

# Email (Nodemailer)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_app_password

# OAuth
GOOGLE_CLIENT_ID=...
FACEBOOK_APP_ID=...
```

## Запуск

```bash
# Налаштувати базу даних
npm run setup-db

# Запустити у режимі розробки
npm run dev

# Запустити у production
npm start
```

## Документація

```bash
# Згенерувати JSDoc HTML
npm run docs

# Запустити живі тести-документацію
npm run test:docs

# Відкрити Swagger UI (поки сервер запущений)
open https://localhost:5001/api/docs
```
