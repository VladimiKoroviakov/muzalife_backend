# API Огляд

Базовий URL: `https://localhost:5001/api`

Інтерактивна документація: [Swagger UI](https://localhost:5001/api/docs)

## Групи ендпоінтів

| Група | Префікс | Захист |
|-------|---------|--------|
| Auth | `/auth` | Публічно |
| Products | `/products` | Публічно |
| Reviews | `/reviews` | Читання — публічно; запис — JWT |
| FAQs | `/faqs` | Публічно |
| Polls | `/polls` | Голосування — JWT |
| Saved Products | `/saved-products` | JWT |
| Personal Orders | `/personal-orders` | JWT |
| Analytics | `/analytics` | JWT + Admin |
| System | `/health`, `/info`, `/test-db` | Публічно |

## Автентифікація

```http
Authorization: Bearer <jwt_token>
```

## Формат помилок

```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token",
  "code": "AUTH_FAILED"
}
```

## Коди відповідей

| Код | Значення |
|-----|----------|
| 200 | Успіх |
| 201 | Ресурс створено |
| 400 | Помилка валідації |
| 401 | Не автентифіковано |
| 403 | Немає прав доступу |
| 404 | Ресурс не знайдено |
| 500 | Помилка сервера |
