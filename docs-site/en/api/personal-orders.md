# Personal Orders API

Base prefix: `/api/personal-orders`

All endpoints require JWT. The order owner has access to their own orders; an administrator has access to all.

## Get Current User's Orders

```http
GET /api/personal-orders
Authorization: Bearer <jwt_token>
```

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "order_id": 1,
      "title": "Birthday scenario",
      "orderStatus": "pending",
      "created_at": "2025-01-15T10:00:00.000Z"
    }
  ]
}
```

---

## Get All Orders (admin only)

```http
GET /api/personal-orders/all
Authorization: Bearer <admin_jwt_token>
```

---

## Create Order

```http
POST /api/personal-orders
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "title": "Wedding scenario",
  "description": "Order details...",
  "eventDate": "2025-06-20"
}
```

**Response `201`:**
```json
{
  "success": true,
  "data": { "order_id": 5, "orderStatus": "pending" }
}
```

---

## Get Single Order

```http
GET /api/personal-orders/:orderId
Authorization: Bearer <jwt_token>
```

Accessible to the owner or an administrator.

---

## Update Order

```http
PUT /api/personal-orders/:orderId
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "orderStatus": "declined",
  "orderDeclineReason": "Reason for decline"
}
```

> `orderDeclineReason` is required when `orderStatus = "declined"`.

---

## Delete Order

```http
DELETE /api/personal-orders/:orderId
Authorization: Bearer <jwt_token>
```

Accessible to the owner or an administrator. **Response `204`** (no body).

---

## Order Files (admin only)

### List Files

```http
GET /api/personal-orders/:orderId/files
Authorization: Bearer <admin_jwt_token>
```

### Upload Files

```http
POST /api/personal-orders/:orderId/files
Authorization: Bearer <admin_jwt_token>
Content-Type: multipart/form-data

files[]: <file1>
files[]: <file2>
```

50 MB limit per file. Watermark is applied automatically.

### Delete File

```http
DELETE /api/personal-orders/:orderId/files/:fileId
Authorization: Bearer <admin_jwt_token>
```

### Send Materials to Owner

```http
POST /api/personal-orders/:orderId/send-materials
Authorization: Bearer <admin_jwt_token>
```

Emails the order owner with links to all uploaded files.

---

## Error Codes

| Code | Reason |
|------|--------|
| 400 | Invalid request (e.g. `declined` without a reason) |
| 403 | Forbidden (not owner and not admin) |
| 404 | Order not found |
