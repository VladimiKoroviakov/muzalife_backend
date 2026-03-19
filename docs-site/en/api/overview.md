# API Overview

Base URL: `https://localhost:5001/api`

Interactive docs: [Swagger UI](https://localhost:5001/api/docs)

## Endpoint Groups

| Group | Prefix | Auth Required |
|-------|--------|--------------|
| Auth | `/auth` | Public |
| Products | `/products` | Public |
| Reviews | `/reviews` | Read — public; write — JWT |
| FAQs | `/faqs` | Public |
| Polls | `/polls` | Voting — JWT |
| Saved Products | `/saved-products` | JWT |
| Personal Orders | `/personal-orders` | JWT |
| Analytics | `/analytics` | JWT + Admin |
| System | `/health`, `/info`, `/test-db` | Public |

## Authentication

```http
Authorization: Bearer <jwt_token>
```

## Error Format

```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token",
  "code": "AUTH_FAILED"
}
```
