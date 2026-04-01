# Products API

Базовий префікс: `/api/products`

GET-ендпоінти — публічні. POST / PUT / DELETE — тільки для адміністраторів (JWT + `is_admin = true`).

Відповіді GET кешуються 5 хвилин (`X-Cache: HIT/MISS` у заголовку).

---

## GET /api/products

Повертає весь каталог продуктів.

**Відповідь `200`:**
```json
{
  "success": true,
  "products": [
    {
      "product_id": 1,
      "product_title": "Назва",
      "product_description": "Опис",
      "product_price": 299.99,
      "product_rating": 4.5,
      "product_hidden": false,
      "mainImage": "/uploads/products/1/img.jpg",
      "additionalImages": [],
      "files": [],
      "reviews": []
    }
  ]
}
```

---

## GET /api/products/:id

Повертає один продукт з усіма пов'язаними даними.

**Відповідь `404`:** продукт не знайдено.

---

## POST /api/products

**Auth:** Bearer token (адмін)  
**Content-Type:** `multipart/form-data`

| Поле | Тип | Обов'язкове |
|------|-----|------------|
| `title` | string | ✓ |
| `description` | string | ✓ |
| `price` | number | ✓ |
| `typeId` | number | ✓ |
| `hidden` | boolean | |
| `ageCategoryIds` | number[] | |
| `eventIds` | number[] | |
| `mainImage` | file (.jpg/.png) | |
| `images` | file[] (.jpg/.png) | |
| `files` | file[] (.pdf/.docx/.pptx/.zip/.rar) | |

**Відповідь `201`:** `{ "success": true, "product": { ... } }`

---

## PUT /api/products/:id

**Auth:** Bearer token (адмін)  
**Content-Type:** `multipart/form-data`

Ті самі поля, що й POST. Передавайте лише ті поля, які змінюються.

**Відповідь `200`:** `{ "success": true, "product": { ... } }`

---

## DELETE /api/products/:id

**Auth:** Bearer token (адмін)

**Відповідь `200`:** `{ "success": true }`
