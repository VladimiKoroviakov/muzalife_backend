# Персональні замовлення API

Базовий префікс: `/api/personal-orders`

Усі ендпоінти вимагають JWT. Власник замовлення має доступ до своїх замовлень; адміністратор має доступ до всіх.

## Отримати замовлення поточного користувача

```http
GET /api/personal-orders
Authorization: Bearer <jwt_token>
```

**Відповідь `200`:**
```json
{
  "success": true,
  "data": [
    {
      "order_id": 1,
      "title": "Сценарій для дня народження",
      "orderStatus": "pending",
      "created_at": "2025-01-15T10:00:00.000Z"
    }
  ]
}
```

---

## Отримати всі замовлення (тільки admin)

```http
GET /api/personal-orders/all
Authorization: Bearer <admin_jwt_token>
```

---

## Створити замовлення

```http
POST /api/personal-orders
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "title": "Сценарій для весілля",
  "description": "Деталі замовлення...",
  "eventDate": "2025-06-20"
}
```

**Відповідь `201`:**
```json
{
  "success": true,
  "data": { "order_id": 5, "orderStatus": "pending" }
}
```

---

## Отримати одне замовлення

```http
GET /api/personal-orders/:orderId
Authorization: Bearer <jwt_token>
```

Доступно власнику або адміністратору.

---

## Оновити замовлення

```http
PUT /api/personal-orders/:orderId
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "orderStatus": "declined",
  "orderDeclineReason": "Причина відмови"
}
```

> `orderDeclineReason` є обов'язковим при `orderStatus = "declined"`.

---

## Видалити замовлення

```http
DELETE /api/personal-orders/:orderId
Authorization: Bearer <jwt_token>
```

Доступно власнику або адміністратору. **Відповідь `204`** (без тіла).

---

## Файли замовлення (тільки admin)

### Список файлів

```http
GET /api/personal-orders/:orderId/files
Authorization: Bearer <admin_jwt_token>
```

### Завантажити файли

```http
POST /api/personal-orders/:orderId/files
Authorization: Bearer <admin_jwt_token>
Content-Type: multipart/form-data

files[]: <file1>
files[]: <file2>
```

Ліміт 50 MB на файл. Водяний знак накладається автоматично.

### Видалити файл

```http
DELETE /api/personal-orders/:orderId/files/:fileId
Authorization: Bearer <admin_jwt_token>
```

### Надіслати матеріали власнику

```http
POST /api/personal-orders/:orderId/send-materials
Authorization: Bearer <admin_jwt_token>
```

Надсилає email власнику замовлення із посиланнями на всі файли.

---

## Коди помилок

| Код | Причина |
|-----|---------|
| 400 | Невалідний запит (наприклад, `declined` без причини) |
| 403 | Немає прав (не власник і не admin) |
| 404 | Замовлення не знайдено |
