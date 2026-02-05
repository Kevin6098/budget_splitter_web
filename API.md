# Budget Splitter API Reference

Server deployed at **https://splitx.suntzutechnologies.com** (port 3012).

Two modes: **Local** (SQLite, no auth) and **VPS** (PostgreSQL, JWT auth).

---

## Base URL & Auth

| Item | Value |
|------|-------|
| **Base URL** | `https://splitx.suntzutechnologies.com` |
| **Auth (VPS)** | JWT in header: `Authorization: Bearer <token>` |
| **Auth (Local)** | None |
| **Content-Type** | `application/json` for request bodies |

---

## Server Modes

| Mode | Storage | Auth | Endpoints |
|------|---------|------|-----------|
| **Local** | SQLite | None | `/api/members`, `/api/expenses`, `/api/summary` |
| **VPS** | PostgreSQL | JWT required | Auth + Groups + Expenses |

---

## Common Endpoint

### GET `/health`
**Auth:** None

**Response (200):**
```json
{
  "status": "ok",
  "mode": "vps",
  "port": 3012,
  "timestamp": "2025-01-31T12:00:00.000Z"
}
```

---

# Local Mode (MODE=local)

No authentication. Single group, SQLite storage.

## Members

### GET `/api/members`
List all members.

**Response (200):**
```json
{
  "members": [
    { "id": "uuid", "name": "John", "createdAt": "2025-01-01T00:00:00.000Z" }
  ]
}
```

### POST `/api/members`
Add a member.

**Request:**
```json
{ "name": "John" }
```

**Response (201):**
```json
{
  "member": { "id": "uuid", "name": "John", "createdAt": "2025-01-01T00:00:00.000Z" }
}
```

**Errors:** 400 (name required), 500.

### DELETE `/api/members/:id`
Remove a member.

**Response (200):** `{ "success": true }`  
**Errors:** 404, 500.

### POST `/api/members/reset`
Reset all members and expenses to defaults.

**Response (200):** `{ "success": true, "message": "Reset complete" }`

---

## Expenses (Local)

### GET `/api/expenses`
List all expenses.

**Response (200):**
```json
{
  "expenses": [
    {
      "id": "uuid",
      "description": "Dinner",
      "amount": 5000,
      "currency": "JPY",
      "category": "Meal",
      "paidByMemberId": "uuid",
      "expenseDate": "2025-01-15",
      "createdAt": "2025-01-15T12:00:00.000Z",
      "splits": [
        { "id": "uuid", "memberId": "uuid", "amount": 2500 }
      ]
    }
  ]
}
```

### POST `/api/expenses`
Add an expense.

**Request:**
```json
{
  "description": "Lunch",
  "amount": 3000,
  "currency": "JPY",
  "category": "Meal",
  "paidByMemberId": "uuid",
  "expenseDate": "2025-01-20",
  "splits": [
    { "memberId": "uuid", "amount": 1500 },
    { "memberId": "uuid", "amount": 1500 }
  ]
}
```

**Response (201):** `{ "success": true, "expenseId": "uuid" }`  
**Errors:** 400 (invalid data), 500.

### DELETE `/api/expenses/:id`
Delete an expense.

**Response (200):** `{ "success": true }`  
**Errors:** 404, 500.

---

## Summary (Local)

### GET `/api/summary`
Get totals by member and category.

**Response (200):**
```json
{
  "totalSpent": 287450,
  "memberTotals": [
    { "memberId": "uuid", "name": "John", "amount": 28745 }
  ],
  "categoryTotals": {
    "Meal": 120800,
    "Transport": 80500,
    "Tickets": 52150,
    "Other": 34000
  }
}
```

---

# VPS Mode (MODE=vps)

JWT authentication required for `/auth/me`, `/auth/logout`, and all `/api/*` endpoints.

## Auth (no token)

### POST `/auth/register`
Register a new user.

**Request:**
```json
{
  "email": "user@example.com",
  "phone": null,
  "password": "at-least-8-chars",
  "displayName": "John"
}
```
- Either `email` or `phone` required.
- `password` min 8 chars.
- `displayName` min 2 chars.

**Response (201):**
```json
{
  "user": { "id": "uuid", "email": "user@example.com", "phone": null, "displayName": "John" },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```
**Errors:** 400, 409 (user exists), 500.

### POST `/auth/login`
Login.

**Request:**
```json
{
  "emailOrPhone": "user@example.com",
  "password": "your-password",
  "deviceId": "optional",
  "deviceName": "iPhone"
}
```

**Response (200):**
```json
{
  "user": { "id": "uuid", "email": "user@example.com", "phone": null, "displayName": "John" },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```
**Errors:** 400, 401, 403 (deactivated), 500.

---

## Auth (token required)

### GET `/auth/me`  
**Header:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "user": { "id": "uuid", "displayName": "John", "email": "user@example.com", "phone": null }
}
```

### POST `/auth/logout`  
**Header:** `Authorization: Bearer <token>`

**Response (200):** `{ "message": "Logged out" }`

---

## Groups & Data (token required)

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

### POST `/api/groups`  
**Header:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "name": "Tokyo Trip",
  "description": "Optional"
}
```
- **name:** optional; defaults to `"My Trip"` if omitted.
- **description:** optional.

**Response (201):**
```json
{
  "group": {
    "id": "uuid",
    "name": "Tokyo Trip",
    "description": "Optional",
    "owner_id": "uuid",
    "invite_code": null,
    "is_active": true
  }
}
```
**Errors:** 500.

### POST `/api/groups/:groupId/members`  
**Header:** `Authorization: Bearer <token>`

**Request:**
```json
{ "name": "Alex" }
```
- **name:** required. Display name for the trip member.

**Response (201):**
```json
{
  "member": {
    "id": "uuid",
    "groupId": "uuid",
    "userId": null,
    "name": "Alex",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```
**Errors:** 400 (name required), 403 (not a member of group), 500.

### GET `/api/groups/:groupId/members`  
**Header:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "members": [
    { "id": "uuid", "groupId": "uuid", "userId": null, "name": "Alex", "createdAt": "2025-01-01T00:00:00.000Z" }
  ]
}
```
**Errors:** 403 (not a member), 500.

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
        { "id": "uuid", "memberId": "uuid", "amount": 2500, "isPaid": false }
      ]
    }
  ]
}
```

### POST `/api/expenses`  
**Header:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "groupId": "uuid",
  "description": "Lunch",
  "amount": 3000,
  "currency": "JPY",
  "category": "Meal",
  "paidByMemberId": "uuid",
  "expenseDate": "2025-01-20",
  "splits": [
    { "memberId": "uuid", "amount": 1500 },
    { "memberId": "uuid", "amount": 1500 }
  ]
}
```
- **category:** `Meal`, `Transport`, `Tickets`, `Shopping`, `Hotel`, `Other`
- **currency:** `JPY`, `MYR`, `SGD`, `USD`
- **expenseDate:** `YYYY-MM-DD`

**Response (201):** `{ "success": true, "expenseId": "uuid" }`  
**Errors:** 400, 403 (not member/cannot add), 500.

### DELETE `/api/expenses/:expenseId`  
**Header:** `Authorization: Bearer <token>`

**Response (200):** `{ "success": true }`  
**Errors:** 403, 404, 500.

### PATCH `/api/expense-splits/:splitId/payment`  
**Header:** `Authorization: Bearer <token>`

**Request:**
```json
{ "isPaid": true, "reason": "Paid via bank" }
```

**Response (200):** `{ "success": true, "message": "Marked paid" }`  
**Errors:** 403, 404, 500.

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

---

## Quick Reference

| Mode | Endpoint | Auth |
|------|----------|------|
| Both | `GET /health` | No |
| Local | `GET/POST/DELETE /api/members` | No |
| Local | `POST /api/members/reset` | No |
| Local | `GET/POST/DELETE /api/expenses` | No |
| Local | `GET /api/summary` | No |
| VPS | `POST /auth/register`, `POST /auth/login` | No |
| VPS | `GET /auth/me`, `POST /auth/logout` | Bearer |
| VPS | `GET /api/groups`, `POST /api/groups`, `POST /api/groups/:id/members`, `GET /api/groups/:id/members`, `GET /api/groups/:id/expenses` | Bearer |
| VPS | `POST/DELETE /api/expenses`, `PATCH /api/expense-splits/:id/payment`, `GET /api/expense-splits/:id/history` | Bearer |

---

## iOS Integration

**Base URL:** `https://splitx.suntzutechnologies.com`

1. Register or login → save `token`.
2. All protected requests: `Authorization: Bearer <token>`
3. Set `Content-Type: application/json` for POST/PATCH.
4. On 401/403 → re-login and retry with new token.

```swift
request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
request.setValue("application/json", forHTTPHeaderField: "Content-Type")
```
