# Платежі API

Базовий префікс: `/api/payments`

Інтеграція з [LiqPay](https://www.liqpay.ua/documentation). Усі ендпоінти ініціювання платежу вимагають JWT (звичайний або гостьовий). Webhook та redirect-handler є публічними, але перевіряються підписом LiqPay.

## Ініціювати оплату продукту

```http
POST /api/payments/product/:productId/initiate
Authorization: Bearer <jwt_token>
```

Повертає форму / посилання LiqPay для переходу на сторінку оплати.

**Відповідь `200`:**
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

## Ініціювати оплату персонального замовлення

```http
POST /api/payments/order/:orderId/initiate
Authorization: Bearer <jwt_token>
```

---

## Ініціювати оплату кошика

Приймає JWT звичайного користувача **або** гостьовий JWT.

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

Автоматично викликається LiqPay після завершення транзакції. Підпис перевіряється на сервері. При успішній оплаті сервер:
1. Записує покупку у `BoughtUserProducts` або `GuestPurchases`
2. Надсилає email із посиланнями на файли

---

## LiqPay Redirect Handlers

```http
POST /api/payments/result
GET  /api/payments/result
```

Обробляють redirect-відповідь LiqPay після повернення користувача з платіжної сторінки. Підпис перевіряється аналогічно webhook.

---

## Коди помилок

| Код | Причина |
|-----|---------|
| 400 | Невалідний запит або підпис LiqPay |
| 401 | Відсутній або недійсний токен |
| 404 | Продукт або замовлення не знайдено |
| 409 | Продукт вже придбано |
