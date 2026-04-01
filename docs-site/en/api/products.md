# Products API

Base prefix: `/api/products`

GET endpoints are public. POST / PUT / DELETE require admin JWT (`is_admin = true`).

GET responses are cached for 5 minutes (`X-Cache: HIT/MISS` response header).

---

## GET /api/products

Returns the full product catalogue.

**Response `200`:**
```json
{
  "success": true,
  "products": [
    {
      "product_id": 1,
      "product_title": "Title",
      "product_description": "Description",
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

Returns a single product with all related data.

**Response `404`:** product not found.

---

## POST /api/products

**Auth:** Bearer token (admin)  
**Content-Type:** `multipart/form-data`

| Field | Type | Required |
|-------|------|----------|
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

**Response `201`:** `{ "success": true, "product": { ... } }`

---

## PUT /api/products/:id

**Auth:** Bearer token (admin)  
**Content-Type:** `multipart/form-data`

Same fields as POST. Send only the fields you want to update.

**Response `200`:** `{ "success": true, "product": { ... } }`

---

## DELETE /api/products/:id

**Auth:** Bearer token (admin)

**Response `200`:** `{ "success": true }`
