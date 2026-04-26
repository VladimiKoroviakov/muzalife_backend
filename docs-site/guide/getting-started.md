# Початок роботи

## Вимоги

| Залежність | Мінімальна версія |
|-----------|------------------|
| Node.js   | 20.x             |
| PostgreSQL | 15+             |
| npm       | 10+              |
| mkcert    | остання (для HTTPS) |

## Встановлення

```bash
git clone https://github.com/VladimiKoroviakov/muzalife_backend.git
cd muzalife_backend
npm install
```

## HTTPS сертифікати

Сервер **вимагає** HTTPS навіть локально і не запуститься без сертифікатів.

**Варіант A — mkcert (рекомендовано):**

```bash
# Встановити локальний CA (один раз)
mkcert -install

# Згенерувати сертифікати для localhost
mkcert -cert-file certs/localhost-cert.pem -key-file certs/localhost-key.pem localhost 127.0.0.1
```

**Варіант B — OpenSSL:**

```bash
mkdir -p certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/localhost-key.pem \
  -out certs/localhost-cert.pem \
  -subj "/CN=localhost"
```

## Змінні середовища

Створіть файл `.env` у корені проєкту:

```dotenv
# Сервер
PORT=5001

# База даних (порт 5433 у dev-середовищі)
DB_HOST=localhost
DB_PORT=5433
DB_NAME=muzalife
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_64_byte_hex_secret
JWT_EXPIRES_IN=7d

# URL (мають збігатись з локальним налаштуванням)
FRONTEND_URL=https://localhost:3000
BACKEND_URL=https://localhost:5001

# Email (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your_app_password
EMAIL_FROM="Muza Life" <noreply@muzalife.com>

# OAuth
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret

# Платежі (LiqPay)
LIQPAY_PUBLIC_KEY=sandbox_your_public_key
LIQPAY_PRIVATE_KEY=sandbox_your_private_key

# Необов'язково
LOG_LEVEL=info
NODE_ENV=development
```

> Ніколи не комітьте `.env` — він вже є в `.gitignore`.

## Запуск

```bash
# Налаштувати базу даних (один раз)
npm run setup-db

# Запустити у режимі розробки (nodemon, авто-перезапуск)
npm run dev

# Запустити у production
npm start
```

Сервер доступний за адресою **https://localhost:5001**.

Очікуваний вивід після запуску:
```
🚀 Muza Life Backend Server running on port 5001
📖 Swagger UI available at: https://localhost:5001/api/docs
📍 Health check: https://localhost:5001/api/health
```

> Браузер може попередити про самопідписний сертифікат — прийміть виняток.

## Документація

```bash
# Згенерувати JSDoc HTML → docs/jsdoc/
npm run docs

# Запустити живі тести-документацію
npm run test:docs

# Відкрити VitePress docs site локально
npm run docs:site

# Відкрити Swagger UI (поки сервер запущений)
open https://localhost:5001/api/docs
```

## Перевірка інсталяції

| Ендпоінт | Очікувана відповідь |
|----------|---------------------|
| `GET /api/health` | `{"status":"OK"}` |
| `GET /api/test-db` | `{"status":"Database connected successfully",...}` |
| `GET /api/docs` | Swagger UI |
