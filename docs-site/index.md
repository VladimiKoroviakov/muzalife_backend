---
layout: home
title: MuzaLife Backend
hero:
  name: MuzaLife Backend
  text: REST API Documentation
  tagline: Документація REST API платформи для творчих сценаріїв та матеріалів
  actions:
    - theme: brand
      text: Почати роботу
      link: /guide/getting-started
    - theme: alt
      text: API довідник
      link: /api/overview
    - theme: alt
      text: Swagger UI
      link: https://localhost:5001/api/docs

features:
  - icon: 🔐
    title: JWT + OAuth автентифікація
    details: Двокроковий OTP-реєстрація, вхід через Google та Facebook, JWT Bearer токени, підтримка гостьового checkout.
  - icon: 📦
    title: Повна REST API
    details: 50+ ендпоінтів для продуктів, відгуків, опитувань, персональних замовлень, платежів та аналітики.
  - icon: 💳
    title: Інтеграція LiqPay
    details: Оплата окремих продуктів, кошика та персональних замовлень. Підтримка server-to-server webhook з перевіркою підпису.
  - icon: 🖋️
    title: Водяний знак файлів
    details: Автоматичне нанесення водяного знака на PDF, DOCX, PPTX, зображення та ZIP/RAR при завантаженні через адмін-панель.
  - icon: 📖
    title: JSDoc довідник
    details: Автоматично згенерована HTML документація для всіх модулів backend.
  - icon: 🔬
    title: Комплексне тестування
    details: 200+ тестів у трьох рівнях — living-documentation (tests/docs/), unit-тести middleware та утиліт (tests/unit/), HTTP-інтеграційні тести маршрутів із мок-базою даних (tests/routes/).
---

## Швидкий старт

```bash
# Клонувати репозиторій
git clone https://github.com/VladimiKoroviakov/muzalife_backend.git
cd muzalife_backend

# Встановити залежності
npm install

# Згенерувати HTTPS-сертифікати (обов'язково — сервер не стартує без них)
mkcert -cert-file certs/localhost-cert.pem -key-file certs/localhost-key.pem localhost 127.0.0.1

# Налаштувати базу даних
npm run setup-db

# Запустити сервер розробки
npm run dev

# Переглянути документацію
open https://localhost:5001/api/docs
```

## Структура проєкту

```
MuzaLife Backend/
├── certs/            — HTTPS сертифікати (не комітяться)
├── config/           — конфігурація БД та Multer
├── controllers/      — обробники HTTP запитів
├── middleware/       — auth, APM, логування, обробка помилок
├── routes/           — 15 модулів маршрутів Express
├── services/         — зовнішні інтеграції (email, OAuth, LiqPay)
├── utils/            — JWT, кеш, логер, AppError, watermark
├── scripts/          — setupDatabase.js
├── logs/             — файли логів Winston (не комітяться)
├── uploads/          — завантажені файли (не комітяться)
├── docs/
│   ├── api/          — OpenAPI 3.0 специфікація
│   ├── jsdoc/        — згенерована JSDoc документація
│   ├── scripts/      — shell-скрипти (backup, start-dev)
│   └── i18n/         — документація двома мовами
├── docs-site/        — цей VitePress сайт
└── tests/
    ├── docs/         — living documentation тести
    ├── unit/         — unit-тести middleware та утиліт
    ├── routes/       — HTTP-інтеграційні тести маршрутів
    └── helpers/      — спільні фабрики токенів та застосунку
```
