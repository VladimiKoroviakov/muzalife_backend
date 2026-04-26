# Payments API

Base prefix: `/api/payments`

Integration with [LiqPay](https://www.liqpay.ua/documentation). All payment initiation endpoints require a JWT (regular or guest). The webhook and redirect handlers are public but verified using LiqPay's signature.

## Initiate Product Payment

```http
POST /api/payments/product/:productId/initiate
Authorization: Bearer <jwt_token>
```

Returns a LiqPay form / link for redirecting the user to the payment page.

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "data": "<base64_encoded_liqpay_data>",
    "signature": "<liqpay_signature>"
  }
}
```

---

## Initiate Personal Order Payment

```http
POST /api/payments/order/:orderId/initiate
Authorization: Bearer <jwt_token>
```

---

## Initiate Cart Checkout

Accepts a regular user JWT **or** a guest JWT.

```http
POST /api/payments/cart/initiate
Authorization: Bearer <jwt_or_guest_token>
Content-Type: application/json

{
  "productIds": [1, 2, 3]
}
```

---

## LiqPay Webhook (server-to-server)

```http
POST /api/payments/callback
```

Called automatically by LiqPay after a transaction completes. The signature is verified server-side. On successful payment the server:
1. Records the purchase in `BoughtUserProducts` or `GuestPurchases`
2. Sends an email with download links to the buyer

---

## LiqPay Redirect Handlers

```http
POST /api/payments/result
GET  /api/payments/result
```

Handle the LiqPay redirect response after the user returns from the payment page. Signature is verified the same way as the webhook.

---

## Error Codes

| Code | Reason |
|------|--------|
| 400 | Invalid request or LiqPay signature mismatch |
| 401 | Missing or invalid token |
| 404 | Product or order not found |
| 409 | Product already purchased |
