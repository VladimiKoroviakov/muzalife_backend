# Products API

Базовий префікс: `/api/products`

Повна інтерактивна документація: [Swagger UI](https://localhost:5001/api/docs)

## Ендпоінти

### `GET /products` — Список продуктів

Публічний. Підтримує пагінацію та фільтрацію.

**Параметри запиту:**

| Параметр | Тип | Опис |
|----------|-----|------|
| `page` | number | Номер сторінки (за замовчуванням: 1) |
| `limit` | number | Кількість на сторінці (за замовчуванням: 20) |
| `category` | string | Фільтр за категорією |
| `search` | string | Пошук за назвою |

**Відповідь `200`:**
```json
{
  "products": [ { "id": 1, "name": "...", "price": 199.99, "category": "..." } ],
  "total": 150,
  "page": 1,
  "pages": 8
}
```

---

### `GET /products/:id` — Деталі продукту

Публічний.

**Відповідь `200`:**
```json
{
  "id": 1,
  "name": "Назва продукту",
  "description": "...",
  "price": 199.99,
  "category": "electronics",
  "images": ["url1", "url2"],
  "averageRating": 4.5,
  "reviewCount": 23
}
```

**Відповідь `404`:**
```json
{ "error": "NotFound", "message": "Product not found" }
```

---

### `POST /products` — Додати продукт

Потребує JWT + роль адміна.

```http
Authorization: Bearer <token>
```

**Тіло запиту:**
```json
{
  "name": "Новий продукт",
  "description": "Опис",
  "price": 299.99,
  "category": "music"
}
```

---

### `PUT /products/:id` — Оновити продукт

Потребує JWT + роль адміна.

---

### `DELETE /products/:id` — Видалити продукт

Потребує JWT + роль адміна.

---

## Saved Products (Збережені)

### `GET /saved-products` — Мої збережені продукти

Потребує JWT.

### `POST /saved-products/:productId` — Зберегти продукт

Потребує JWT.

### `DELETE /saved-products/:productId` — Видалити зі збережених

Потребує JWT.
