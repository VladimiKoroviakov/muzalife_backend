# Products API

Base prefix: `/api/products`

Full interactive documentation: [Swagger UI](https://localhost:5001/api/docs)

## Endpoints

### `GET /products` — List products

Public. Supports pagination and filtering.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20) |
| `category` | string | Filter by category |
| `search` | string | Search by name |

**Response `200`:**
```json
{
  "products": [ { "id": 1, "name": "...", "price": 199.99, "category": "..." } ],
  "total": 150,
  "page": 1,
  "pages": 8
}
```

---

### `GET /products/:id` — Product details

Public.

**Response `200`:**
```json
{
  "id": 1,
  "name": "Product Name",
  "description": "...",
  "price": 199.99,
  "category": "electronics",
  "images": ["url1", "url2"],
  "averageRating": 4.5,
  "reviewCount": 23
}
```

---

### `POST /products` — Create product

Requires JWT + admin role.

```http
Authorization: Bearer <token>
```

---

### `PUT /products/:id` — Update product

Requires JWT + admin role.

---

### `DELETE /products/:id` — Delete product

Requires JWT + admin role.

---

## Saved Products

### `GET /saved-products` — My saved products

Requires JWT.

### `POST /saved-products/:productId` — Save product

Requires JWT.

### `DELETE /saved-products/:productId` — Remove from saved

Requires JWT.
