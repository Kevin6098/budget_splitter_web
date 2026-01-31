# Budget Splitter API Reference

For the **iOS app** (and other clients) calling the **VPS** deployment at **https://splitx.suntzutechnologies.com**.

---

## Base URL & Auth

| Item | Value |
|------|--------|
| **Base URL** | `https://splitx.suntzutechnologies.com` |
| **Auth** | JWT in header: `Authorization: Bearer <token>` |
| **Content-Type** | `application/json` for request bodies |

### How iOS calls the API

1. **Register or login** → get `token` from the response.
2. **Store the token** (e.g. Keychain or UserDefaults).
3. **For every protected request**, add the header:
   ```http
   Authorization: Bearer <your-token>
   ```
4. **If you get 401/403** → token expired or invalid → redirect to login and get a new token.

Example in Swift (URLSession):

```swift
var request = URLRequest(url: URL(string: "https://splitx.suntzutechnologies.com/auth/me")!)
request.httpMethod = "GET"
request.setValue("Bearer \(savedToken)", forHTTPHeaderField: "Authorization")
request.setValue("application/json", forHTTPHeaderField: "Content-Type")
// then use URLSession.shared.dataTask(with: request) ...
```

For POST/PATCH with body:

```swift
request.httpMethod = "POST"
request.setValue("Bearer \(savedToken)", forHTTPHeaderField: "Authorization")
request.setValue("application/json", forHTTPHeaderField: "Content-Type")
request.httpBody = try? JSONEncoder().encode(yourBody)
```

---

## Endpoints

### Auth (no token required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register a new user → returns `user` + `token` |
| POST | `/auth/login` | Login → returns `user` + `token` |

### Auth (token required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/me` | Get current user |
| POST | `/auth/logout` | Invalidate current token |

### Groups & data (all require token)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/groups` | List groups owned by the user |
| GET | `/api/groups/:groupId/members` | List members in a group |
| GET | `/api/groups/:groupId/expenses` | List expenses for a group |
| POST | `/api/expenses` | Add an expense (body: groupId, amount, splits, etc.) |
| DELETE | `/api/expenses/:expenseId` | Soft-delete an expense |
| PATCH | `/api/expense-splits/:splitId/payment` | Mark a split as paid/unpaid |
| GET | `/api/expense-splits/:splitId/history` | Payment history for a split |

### Other

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth); returns `{ "status": "ok", "mode": "vps" }` |

---

## Request / Response Details

### POST `/auth/register`

**Request body:**

```json
{
  "email": "user@example.com",
  "phone": null,
  "password": "at-least-8-chars",
  "displayName": "John"
}
```

- Either `email` or `phone` is required.
- `password` must be at least 8 characters.
- `displayName` required, at least 2 characters.

**Response (201):**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "phone": null,
    "displayName": "John"
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Errors:** 400 (validation), 409 (user already exists), 500.

---

### POST `/auth/login`

**Request body:**

```json
{
  "emailOrPhone": "user@example.com",
  "password": "your-password",
  "deviceId": "optional-device-uuid",
  "deviceName": "iPhone"
}
```

- `emailOrPhone`: user’s email or phone.
- `deviceId` / `deviceName`: optional, for multi-device tracking.

**Response (200):**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "phone": null,
    "displayName": "John"
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Errors:** 400, 401 (invalid credentials), 403 (account deactivated), 500.

---

### GET `/auth/me`  
**Header:** `Authorization: Bearer <token>`

**Response (200):**

```json
{
  "user": {
    "id": "uuid",
    "displayName": "John",
    "email": "user@example.com",
    "phone": null
  }
}
```

**Errors:** 401 (no/invalid token).

---

### POST `/auth/logout`  
**Header:** `Authorization: Bearer <token>`

**Response (200):** `{ "message": "Logged out" }`  
**Errors:** 401, 500.

---

### GET `/api/groups`  
**Header:** `Authorization: Bearer <token>`

**Response (200):**

```json
{
  "groups": [
    {
      "id": "uuid",
      "name": "Tokyo Trip",
      "description": "Optional",
      "owner_id": "uuid",
      "invite_code": "ABC123",
      "is_active": true
    }
  ]
}
```

**Errors:** 401, 500.

---

### GET `/api/groups/:groupId/members`  
**Header:** `Authorization: Bearer <token>`

**Response (200):**

```json
{
  "members": [
    {
      "id": "uuid",
      "groupId": "uuid",
      "userId": "uuid-or-null",
      "name": "Alex",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

**Errors:** 401, 403 (not a member), 500.

---

### GET `/api/groups/:groupId/expenses`  
**Header:** `Authorization: Bearer <token>`

**Response (200):**

```json
{
  "expenses": [
    {
      "id": "uuid",
      "groupId": "uuid",
      "description": "Dinner",
      "amount": 5000,
      "currency": "JPY",
      "category": "Meal",
      "paidByMemberId": "uuid",
      "expenseDate": "2025-01-15",
      "createdAt": "2025-01-15T12:00:00.000Z",
      "splits": [
        { "id": "uuid", "memberId": "uuid", "amount": 2500, "isPaid": false },
        { "id": "uuid", "memberId": "uuid", "amount": 2500, "isPaid": true }
      ]
    }
  ]
}
```

**Errors:** 401, 403 (not a member), 500.

---

### POST `/api/expenses`  
**Header:** `Authorization: Bearer <token>`

**Request body:**

```json
{
  "groupId": "uuid",
  "description": "Lunch",
  "amount": 3000,
  "currency": "JPY",
  "category": "Meal",
  "paidByMemberId": "uuid-of-member-who-paid",
  "expenseDate": "2025-01-20",
  "splits": [
    { "memberId": "uuid", "amount": 1500 },
    { "memberId": "uuid", "amount": 1500 }
  ]
}
```

- **category** must be one of: `Meal`, `Transport`, `Tickets`, `Shopping`, `Hotel`, `Other`.
- **currency** optional; default `JPY`. Allowed: `JPY`, `MYR`, `SGD`, `USD`.
- **expenseDate**: `YYYY-MM-DD`.

**Response (201):**

```json
{
  "success": true,
  "expenseId": "uuid"
}
```

**Errors:** 400, 401, 403 (not a member / cannot add expenses), 500.

---

### DELETE `/api/expenses/:expenseId`  
**Header:** `Authorization: Bearer <token>`

**Response (200):** `{ "success": true }`  
**Errors:** 401, 403 (no permission), 404, 500.

---

### PATCH `/api/expense-splits/:splitId/payment`  
**Header:** `Authorization: Bearer <token>`

**Request body:**

```json
{
  "isPaid": true,
  "reason": "Paid via bank transfer"
}
```

- `isPaid`: `true` = mark as paid, `false` = mark as unpaid.
- `reason`: optional.

**Response (200):**

```json
{
  "success": true,
  "message": "Marked paid"
}
```

**Errors:** 401, 403 (no permission), 404, 500.

---

### GET `/api/expense-splits/:splitId/history`  
**Header:** `Authorization: Bearer <token>`

**Response (200):**

```json
{
  "history": [
    {
      "id": "uuid",
      "expense_split_id": "uuid",
      "action": "marked_paid",
      "performed_by_user_id": "uuid",
      "performed_at": "2025-01-20T10:00:00.000Z",
      "reason": null,
      "performed_by_name": "John"
    }
  ]
}
```

**Errors:** 401, 500.

---

## Quick reference: iOS flow

1. **Base URL:** `https://splitx.suntzutechnologies.com`
2. **Login/Register** → save `token`.
3. **All `/auth/*` (except register/login) and `/api/*`** → send header:  
   `Authorization: Bearer <token>`
4. **JSON:** set `Content-Type: application/json` and send request body as JSON where required.
5. **Errors:** check HTTP status and response body `{ "error": "message" }`; on 401/403, re-login and retry with a new token.
