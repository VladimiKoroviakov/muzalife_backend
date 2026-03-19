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
    details: Двокроковий OTP-реєстрація, вхід через Google та Facebook, захист ендпоінтів JWT Bearer токенами.
  - icon: 📦
    title: Повна REST API
    details: 40+ ендпоінтів для продуктів, відгуків, опитувань, персональних замовлень та аналітики.
  - icon: 📖
    title: JSDoc довідник
    details: Автоматично згенерована HTML документація для всіх модулів backend.
  - icon: 🔬
    title: Живі тести-документація
    details: Кожна публічна функція має відповідний тест у tests/docs/, що служить виконуваною специфікацією.
---

## Швидкий старт

```bash
# Клонувати репозиторій
git clone https://github.com/your-org/muzalife-backend.git
cd muzalife-backend

# Встановити залежності
npm install

# Запустити сервер розробки
npm run dev

# Переглянути документацію
open https://localhost:5001/api/docs
```

## Структура проєкту

```
MuzaLife Backend/
├── config/           — конфігурація бази даних
├── controllers/      — обробники HTTP запитів
├── middleware/       — middleware (автентифікація тощо)
├── routes/           — маршрути Express
├── services/         — бізнес-логіка
├── utils/            — допоміжні функції (JWT, URL)
├── docs/
│   ├── api/          — OpenAPI 3.0 специфікація
│   ├── jsdoc/        — згенерована JSDoc документація
│   ├── jsdoc.zip     — архів документації
│   └── i18n/         — документація двома мовами
├── docs-site/        — цей VitePress сайт
└── tests/docs/       — living documentation тести
```
