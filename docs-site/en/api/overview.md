# API Overview

Base URL: `https://localhost:5001/api`

Interactive docs: [Swagger UI](https://localhost:5001/api/docs)

## Endpoint Groups

| Group | Prefix | Auth Required |
|-------|--------|--------------|
| Auth | `/auth` | Public |
| Users | `/users` | JWT |
| Products | `/products` | GET public; mutations — admin JWT |
| Saved Products | `/saved-products` | JWT |
| Bought Products | `/bought-products` | JWT |
| Reviews | `/reviews` | Read — public; write — JWT |
| FAQs | `/faqs` | Public |
| Polls | `/polls` | Voting — JWT |
| Personal Orders | `/personal-orders` | JWT (owner or admin) |
| Payments | `/payments` | JWT or guest token |
| Analytics | `/analytics` | JWT + Admin |
| Metadata | `/metadata` | Public (cached 1 h) |
| APM | `/apm` | Public |
| Client Errors | `/errors/client` | Public |
| Facebook Admin | `/admin` | JWT + Admin |
| System | `/health`, `/info`, `/test-db` | Public |

## Authentication

```http
Authorization: Bearer <jwt_token>
```

## Success Response Format

```json
{
  "success": true,
  "data": { },
  "message": { "uk": "Успішно", "en": "Success" }
}
```

## Error Format

```json
{
  "error": "NOT_FOUND",
  "errorId": "550e8400-e29b-41d4-a716-446655440000",
  "message": { "uk": "Ресурс не знайдено", "en": "Resource not found" }
}
```

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Resource created |
| 204 | Success with no response body |
| 400 | Validation error |
| 401 | Not authenticated |
| 403 | Forbidden |
| 404 | Resource not found |
| 409 | Conflict (e.g. email already registered) |
| 429 | Too many requests |
| 500 | Server error |
| 502 | External service error |
