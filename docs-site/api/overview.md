# API Огляд

Базовий URL: `https://localhost:5001/api`

Інтерактивна документація: [Swagger UI](https://localhost:5001/api/docs)

## Групи ендпоінтів

| Група | Префікс | Захист |
|-------|---------|--------|
| Auth | `/auth` | Публічно |
| Users | `/users` | JWT |
| Products | `/products` | GET публічно; мутації — admin JWT |
| Saved Products | `/saved-products` | JWT |
| Bought Products | `/bought-products` | JWT |
| Reviews | `/reviews` | Читання — публічно; запис — JWT |
| FAQs | `/faqs` | Публічно |
| Polls | `/polls` | Голосування — JWT |
| Personal Orders | `/personal-orders` | JWT (власник або admin) |
| Payments | `/payments` | JWT або guest token |
| Analytics | `/analytics` | JWT + Admin |
| Metadata | `/metadata` | Публічно (кешується 1 год) |
| APM | `/apm` | Публічно |
| Client Errors | `/errors/client` | Публічно |
| Facebook Admin | `/admin` | JWT + Admin |
| System | `/health`, `/info`, `/test-db` | Публічно |

## Автентифікація

```http
Authorization: Bearer <jwt_token>
```

## Формат успішної відповіді

```json
{
  "success": true,
  "data": { },
  "message": { "uk": "Успішно", "en": "Success" }
}
```

## Формат помилок

```json
{
  "error": "NOT_FOUND",
  "errorId": "550e8400-e29b-41d4-a716-446655440000",
  "message": { "uk": "Ресурс не знайдено", "en": "Resource not found" }
}
```

## Коди відповідей

| Код | Значення |
|-----|----------|
| 200 | Успіх |
| 201 | Ресурс створено |
| 204 | Успіх без тіла відповіді |
| 400 | Помилка валідації |
| 401 | Не автентифіковано |
| 403 | Немає прав доступу |
| 404 | Ресурс не знайдено |
| 409 | Конфлікт (наприклад, email вже існує) |
| 429 | Забагато запитів |
| 500 | Помилка сервера |
| 502 | Помилка зовнішнього сервісу |
