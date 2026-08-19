# 📡 API Reference

> Base URL — local: `http://localhost:4000/api` · production: `https://<your-service>/api`
> · Source: [`server/src/routes/`](../server/src/routes/)

---

## Conventions

### Response envelope

Every response, success or failure, uses one shape.

```jsonc
// 2xx
{
  "success": true,
  "data": { /* … */ },
  "pagination": { "page": 1, "pageSize": 20, "total": 137, "totalPages": 7 },  // list endpoints only
  "message": "…"                                                               // occasionally
}

// 4xx / 5xx
{
  "success": false,
  "error": {
    "code": "ZONE_NOT_SERVICEABLE",
    "message": "Pincode 999999 is not mapped to a delivery zone yet. An admin can add it under Zones -> Areas.",
    "details": { "pincode": "999999" }
  }
}
```

### Error codes

| Code | Status | Meaning |
|---|---:|---|
| `VALIDATION_ERROR` | 422 | Request body failed Zod validation. `details.fields[]` carries `{ path, message }` per field. |
| `UNAUTHORIZED` | 401 | Missing, invalid or expired access token. |
| `FORBIDDEN` | 403 | Authenticated, but the role or ownership check failed. |
| `NOT_FOUND` | 404 | Record does not exist. |
| `ROUTE_NOT_FOUND` | 404 | No route matches the method + path. |
| `CONFLICT` | 409 | Business-rule conflict (e.g. no eligible agent). |
| `INVALID_STATUS_TRANSITION` | 409 | Illegal edge in the lifecycle graph. The message lists the legal next steps. |
| `DUPLICATE` | 409 | Unique constraint violated. `details.field` names it. |
| `ZONE_NOT_SERVICEABLE` | 422 | Pincode is not mapped to an active zone. |
| `RATE_NOT_CONFIGURED` | 422 | No active rate card covers this lane. |
| `MALFORMED_JSON` | 400 | Body is not valid JSON. |
| `RATE_LIMITED` | 429 | Too many requests. |
| `INTERNAL_ERROR` | 500 | Unexpected. The message is generic in production. |

### Authentication

```http
Authorization: Bearer <accessToken>
```

Access tokens last 2 hours. Refresh tokens last 30 days, are stored as SHA-256
digests and **rotate on every use** — the presented token is revoked and a new
one issued, so a stolen copy dies at the legitimate client's next refresh.

The web client refreshes transparently on a `401` and retries once. Concurrent
`401`s share a single in-flight refresh, so rotation cannot invalidate its own
siblings.

### Rate limits

| Scope | Window | Max |
|---|---|---:|
| `/api/*` (except `/health`) | 15 min | 600 |
| `/api/auth/register`, `/login`, `/refresh` | 15 min | 40 |

### Roles

`CUSTOMER` · `AGENT` · `ADMIN`. Self-service registration always produces a
`CUSTOMER`; elevated roles are created only by an admin via `POST /api/users`.

---

## Contents

| | |
|---|---|
| [Meta](#meta) | health, enums |
| [Auth](#auth) | sessions |
| [Pricing](#pricing) | quote + rate configuration |
| [Zones](#zones) | zones, areas, serviceability |
| [Orders](#orders) | the lifecycle |
| [Dispatch](#dispatch) | assignment |
| [Agents](#agents) | duty state, roster |
| [Users](#users) | account management |
| [Notifications](#notifications) | the outbox |
| [Analytics](#analytics) | dashboards |
| [Public tracking](#public-tracking) | no auth |

---

## Meta

### `GET /api/health` 🌐

Liveness plus a wiring report. Returns `503` if the database is unreachable.

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "service": "swiftroute-api",
    "version": "1.0.0",
    "environment": "production",
    "database": "up",
    "latencyMs": 1,
    "notifications": {
      "email": { "provider": "console", "live": false, "from": "no-reply@swiftroute.dev" },
      "sms":   { "provider": "console", "live": false, "from": null }
    },
    "uptimeSeconds": 1878,
    "timestamp": "2026-08-19T19:47:53.352Z"
  }
}
```

### `GET /api/meta` 🌐

Every enum, every status label and colour tone, and the **legal transition
graph**. The client never hardcodes a status string.

```jsonc
{
  "data": {
    "roles": ["CUSTOMER", "AGENT", "ADMIN"],
    "orderTypes": ["B2B", "B2C"],
    "paymentTypes": ["PREPAID", "COD"],
    "orderStatuses": ["PENDING", "CONFIRMED", "…"],
    "statusMeta": { "PENDING": { "label": "Pending", "description": "…", "tone": "slate", "icon": "clock", "step": 0 } },
    "happyPath": ["PENDING", "CONFIRMED", "…", "DELIVERED"],
    "transitions": { "CONFIRMED": ["ASSIGNED", "CANCELLED"] },
    "rolePermittedTargets": { "AGENT": ["PICKED_UP", "…"] },
    "agentAvailability": ["AVAILABLE", "BUSY", "ON_BREAK", "OFFLINE"],
    "vehicleTypes": ["BIKE", "SCOOTER", "VAN", "TRUCK"],
    "vehicleCapacityKg": { "BIKE": 15, "SCOOTER": 25, "VAN": 500, "TRUCK": 5000 },
    "rateScopes": ["INTRA_ZONE", "INTER_ZONE"],
    "failureReasons": ["Customer not available", "…"]
  }
}
```

---

## Auth

### `POST /api/auth/register` 🌐

Always creates a `CUSTOMER`.

```jsonc
// request
{ "email": "you@company.com", "password": "Secret123", "fullName": "Ananya Rao",
  "phone": "+919845012345", "companyName": "Acme Ltd" }   // phone + company optional

// 201
{ "data": { "user": { … }, "accessToken": "eyJ…", "refreshToken": "…", "expiresIn": "2h" } }
```

Password rules: 8–72 characters, at least one letter and one digit.

### `POST /api/auth/login` 🌐

```jsonc
{ "email": "admin@swiftroute.dev", "password": "Admin@123" }
```

Returns the same shape as register. **Deliberately does not reveal whether an
e-mail is registered** — an unknown address and a wrong password return
identical copy, and the comparison runs against a dummy hash so the timing
matches too.

### `POST /api/auth/refresh` 🌐

```jsonc
{ "refreshToken": "…" }
```

Rotates: the presented token is revoked, a fresh pair is issued.

### `POST /api/auth/logout` 🌐 · `GET /api/auth/me` 🔒 · `POST /api/auth/change-password` 🔒

`change-password` requires `{ currentPassword, newPassword }` and revokes every
other session.

---

## Pricing

### `POST /api/pricing/quote` 🌐

**Open to anonymous callers on purpose** — a shipper wants to price a parcel
before creating an account. A pure read; nothing is persisted.

```jsonc
// request
{
  "pickupPincode": "560034",
  "dropPincode":   "560011",
  "lengthCm": 30, "breadthCm": 20, "heightCm": 15,
  "actualWeightKg": 1.2,
  "orderType": "B2C",          // B2B | B2C
  "paymentType": "COD",        // PREPAID | COD
  "declaredValue": 4500        // required for a meaningful COD surcharge
}
```

```jsonc
// 200
{
  "data": {
    "currency": "INR",
    "zones": {
      "pickup": { "id": "…", "code": "BLR-S", "name": "South Bengaluru", "city": "Bengaluru" },
      "drop":   { "id": "…", "code": "BLR-S", "name": "South Bengaluru", "city": "Bengaluru" },
      "scope": "INTRA_ZONE",
      "sameZone": true
    },
    "weights": {
      "actualKg": 1.2, "volumetricKg": 1.8,
      "billedOn": "VOLUMETRIC",
      "chargeableKg": 2,
      "volumetricDivisor": 5000, "slabKg": 0.5, "extraSlabs": 3
    },
    "rateCard": {
      "id": "…", "name": "B2C Local — standard",
      "orderType": "B2C", "scope": "INTRA_ZONE",
      "baseWeightKg": 0.5, "basePrice": 49,
      "incrementalWeightKg": 0.5, "incrementalPrice": 22,
      "laneSpecific": false
    },
    "charges": {
      "baseCharge": 49, "weightCharge": 66, "handlingFee": 0,
      "fuelSurcharge": 6.9, "codSurcharge": 67.5,
      "taxableAmount": 189.4, "taxAmount": 34.09, "gstPct": 18,
      "total": 223.49
    },
    "lines": [
      { "key": "base",   "label": "Base freight (up to 0.5 kg)",
        "formula": "B2C Local — standard — B2C intra-zone", "amount": 49, "kind": "charge" },
      { "key": "weight", "label": "Additional weight (3 x 0.5 kg slab)",
        "formula": "ceil((2 kg − 0.5 kg) ÷ 0.5 kg) × ₹22", "amount": 66, "kind": "charge" },
      { "key": "fuel",   "label": "Fuel surcharge (6%)",
        "formula": "6% × ₹115 freight", "amount": 6.9, "kind": "charge" },
      { "key": "cod",    "label": "COD surcharge",
        "formula": "max(₹40 flat, 1.5% × ₹4500 declared), clamped to ₹40–500", "amount": 67.5, "kind": "charge" },
      { "key": "gst",    "label": "GST (18%)",
        "formula": "18% × ₹189.4 taxable value", "amount": 34.09, "kind": "tax" }
    ],
    "meta": { "calculatedAt": "…", "engineVersion": "1.0.0", "codRuleId": "…" }
  }
}
```

Errors: `ZONE_NOT_SERVICEABLE` (422), `RATE_NOT_CONFIGURED` (422),
`VALIDATION_ERROR` (422).

### Configuration

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/pricing/settings` | 🔒 any | Volumetric divisor, slab, minimum weight |
| `PUT` | `/pricing/settings` | 🛡️ admin | Update them |
| `GET` | `/pricing/rate-cards` | 🔒 any | All cards with zone relations and usage counts |
| `POST` | `/pricing/rate-cards` | 🛡️ admin | Create |
| `PUT` | `/pricing/rate-cards/:id` | 🛡️ admin | Update |
| `DELETE` | `/pricing/rate-cards/:id` | 🛡️ admin | Delete — **or archive** if it has priced orders |
| `GET` | `/pricing/cod-rules` | 🔒 any | |
| `POST`/`PUT`/`DELETE` | `/pricing/cod-rules[/:id]` | 🛡️ admin | |
| `GET` | `/pricing/resolve` | 🛡️ admin | "Which card would price this lane, and why?" |

<details>
<summary><b>Rate card body</b></summary>

```jsonc
{
  "name": "B2C Local — standard",
  "orderType": "B2C",              // B2B | B2C
  "scope": "INTRA_ZONE",           // INTRA_ZONE | INTER_ZONE
  "fromZoneId": null,              // both set = a lane override for that pair
  "toZoneId": null,
  "baseWeightKg": 0.5,
  "basePrice": 49,
  "incrementalWeightKg": 0.5,
  "incrementalPrice": 22,
  "handlingFee": 0,
  "fuelSurchargePct": 6,
  "gstPct": 18,
  "priority": 50,                  // higher wins on a tie
  "effectiveFrom": "2026-01-01",   // optional
  "effectiveTo": null,
  "isActive": true
}
```

Validation refuses a half-specified lane (one zone set, not the other) and an
intra-zone lane card whose two zones differ.
</details>

<details>
<summary><b>COD rule body</b></summary>

```jsonc
{
  "orderType": "B2C",
  "flatFee": 40,
  "percentOfValue": 1.5,
  "minFee": 40,
  "maxFee": 500,        // null = no ceiling
  "isActive": true
}
```

Validation refuses `maxFee < minFee`.
</details>

---

## Zones

### `GET /api/zones/serviceability/:pincode` 🌐

Called as the customer types on the booking form.

```jsonc
{
  "data": {
    "pincode": "560034",
    "serviceable": true,
    "zone": { "id": "…", "code": "BLR-S", "name": "South Bengaluru", "city": "Bengaluru" },
    "area": { "name": "Koramangala", "city": "Bengaluru" }
  }
}
```

An unmapped pincode returns `200` with `serviceable: false` — it is a question,
not an error.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/zones` | 🔒 any | Zones with areas and counts |
| `GET` | `/zones/:id` | 🔒 any | One zone with its areas and agents |
| `POST`/`PUT` | `/zones[/:id]` | 🛡️ admin | Create / update |
| `DELETE` | `/zones/:id` | 🛡️ admin | Delete — **or deactivate** if orders reference it |
| `GET` | `/zones/areas/all` | 🔒 any | Every serviceable pincode |
| `POST` | `/zones/areas` | 🛡️ admin | Add a pincode. `409` if it is already mapped. |
| `PUT` | `/zones/areas/:id` | 🛡️ admin | **This is how a pincode moves between zones** |
| `DELETE` | `/zones/areas/:id` | 🛡️ admin | Remove |

---

## Orders

### `POST /api/orders` 🔒 customer · admin

```jsonc
{
  "customerId": "…",              // ADMIN ONLY — book on behalf of a customer
  "orderType": "B2C",
  "paymentType": "COD",
  "declaredValue": 3200,
  "pickup": {
    "contactName": "Ananya Rao", "contactPhone": "+919845012345",
    "line1": "12 Koramangala 5th Block", "line2": null, "landmark": null,
    "city": "Bengaluru", "state": "Karnataka", "pincode": "560034",
    "lat": null, "lng": null      // optional; falls back to the area centroid
  },
  "drop": { /* same shape */ },
  "lengthCm": 25, "breadthCm": 18, "heightCm": 12, "actualWeightKg": 2.4,
  "scheduledDate": "2026-08-22",
  "notes": "Leave with the security desk",
  "confirmImmediately": true,     // skip PENDING, go straight to CONFIRMED
  "autoAssign": true              // run the dispatcher on confirm
}
```

Returns `201` with the full order, including `pricingBreakdown` (the decoded
`Quote`) and the assigned `agent` if `autoAssign` found one.

> The price is **recomputed server-side** and then frozen onto the order. A
> failed auto-assignment does **not** fail the booking — the order simply waits
> in `CONFIRMED`.

A non-admin passing `customerId` gets `403`.

### `GET /api/orders` 🔒 all roles — scoped

Scoping is automatic and not overridable: admins see everything, agents see only
orders assigned to them, customers see only their own.

| Query | Values |
|---|---|
| `status` | any `OrderStatus` |
| `zoneId` | matches pickup **or** drop zone |
| `agentId` | `AgentProfile.id` |
| `customerId` | admin only, in practice |
| `orderType` · `paymentType` | `B2B`/`B2C` · `PREPAID`/`COD` |
| `search` | code, customer name/e-mail, city, drop pincode |
| `from` · `to` | ISO dates on `createdAt` |
| `sort` | `newest` (default) · `oldest` · `value` |
| `page` · `pageSize` | default `1` · `20`, max `100` |

### `GET /api/orders/:id` 🔒

Returns the order plus `trackingEvents` (chronological) and
`allowedNextStatuses` derived from the state machine.

### `PATCH /api/orders/:id/status` 🔒 all roles — guarded

```jsonc
{
  "status": "OUT_FOR_DELIVERY",
  "notes": "…",
  "failureReason": "Customer not available",  // REQUIRED when status = FAILED
  "lat": 12.9352, "lng": 77.6245,             // optional GPS at the moment of the update
  "override": false                           // ADMIN ONLY — bypass the transition graph
}
```

Three layers of checking:

1. the role may request that target at all (`rolePermittedTargets`);
2. an agent may only update **their own** orders;
3. the edge exists in the transition graph — unless an admin sets `override`,
   which is recorded on the tracking event.

Errors: `INVALID_STATUS_TRANSITION` (409), `FORBIDDEN` (403),
`BAD_REQUEST` (400, missing failure reason).

### `POST /api/orders/:id/reschedule` 🔒 customer · admin

```jsonc
{ "newDate": "2026-08-24", "reason": "Please try after 6pm" }
```

Only valid on a `FAILED` order. Captures a `RescheduleRequest`, moves to
`RESCHEDULED`, then re-dispatches **excluding the agent who just failed**. If
nobody is free the order stays `RESCHEDULED` rather than erroring.

### `POST /api/orders/:id/cancel` 🔒 customer · admin

Customers may cancel only while `PENDING` or `CONFIRMED`; admins any time before
a terminal state.

### `GET /api/orders/:id/tracking` · `/reschedules` 🔒

The immutable history, and the reschedule attempts.

---

## Dispatch

### `POST /api/orders/:id/assign` 🛡️ admin

```jsonc
{ "agentId": "…", "reason": "Customer requested this rider" }
```

### `POST /api/orders/:id/auto-assign` 🛡️ admin

Runs the engine and acts on its top candidate. `409` with the rejection list if
nobody is eligible.

### `GET /api/orders/:id/assignment-preview` 🛡️ admin

**Dry run — changes nothing.**

```jsonc
{
  "data": {
    "chosen": { "agentId": "…", "agentName": "Kiran Kumar", "score": 0.966, "distanceKm": 0, "…": "…" },
    "ranked": [
      {
        "agentId": "…", "agentName": "Kiran Kumar",
        "vehicleType": "BIKE", "zoneCode": "BLR-S", "availability": "AVAILABLE",
        "activeOrders": 1, "maxConcurrentOrders": 5,
        "distanceKm": 0, "etaMinutes": 8,
        "signals": { "proximity": 1, "zoneMatch": 1, "workload": 0.8, "performance": 0.9395 },
        "score": 0.966,
        "rejectedBecause": null
      }
    ],
    "rejected": [
      { "agentName": "Sameer Khan", "rejectedBecause": "At capacity (8/8 active orders)", "…": "…" }
    ],
    "widenedSearch": false,
    "reason": "Kiran Kumar scored 0.966 out of 4 eligible agents · 0 km from pickup · operates in the pickup zone · 1/5 active orders."
  }
}
```

### `GET /api/orders/:id/assignments` 🛡️ admin

The audit trail: mode (`AUTO`/`MANUAL`/`REASSIGN`), distance, score, reason and
the ranked `candidateSnapshot` from decision time.

---

## Agents

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/agents` | 🛡️ admin | Roster. Filters: `availability`, `zoneId` |
| `GET` | `/agents/me` | 🚚 agent | Own profile + today's delivered/failed counts |
| `PATCH` | `/agents/me/availability` | 🚚 agent | `{ "availability": "AVAILABLE" }`. Going `OFFLINE` with orders in hand is refused. |
| `POST` | `/agents/me/location` | 🚚 agent | `{ "lat": 12.9352, "lng": 77.6245 }` — the GPS ping that makes "nearest" mean something |
| `GET` | `/agents/:id` | 🔒 staff | |
| `PUT` | `/agents/:id` | 🛡️ admin | Vehicle, zone, availability, capacity, position |
| `GET` | `/agents/:id/workload` | 🛡️ admin | What this agent is carrying right now |

---

## Users

🛡️ **Admin only, all of them.**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/users` | Filters: `role`, `search`, `isActive`, `page`, `pageSize` |
| `POST` | `/users` | Create. `role: "AGENT"` provisions the `AgentProfile` in the same transaction. |
| `GET` | `/users/:id` | |
| `PUT` | `/users/:id` | An admin cannot deactivate or demote **themselves** |
| `GET` | `/users/customers/lookup?q=` | Type-ahead for "create an order on behalf of" |

<details>
<summary><b>Creating an agent</b></summary>

```jsonc
{
  "email": "rider@swiftroute.dev",
  "password": "Rider@123",
  "fullName": "Kiran Kumar",
  "phone": "+919900112233",
  "role": "AGENT",
  "agent": {
    "vehicleType": "BIKE",
    "vehicleNumber": "KA-01-HH-4521",
    "zoneId": "…",
    "maxConcurrentOrders": 5,
    "availability": "AVAILABLE"
  }
}
```
</details>

---

## Notifications

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/notifications` | 🔒 scoped | Customers see their own; admins see everything. Filters: `orderId`, `channel`, `status` |
| `GET` | `/notifications/:id` | 🔒 scoped | The full message including rendered HTML |
| `GET` | `/notifications/transports` | 🛡️ admin | What is wired up, plus a live SMTP verification |
| `POST` | `/notifications/retry` | 🛡️ admin | Re-dispatch every `FAILED` message |

---

## Analytics

### `GET /api/analytics/dashboard` 🔒 all roles

Role-shaped: admins get network-wide figures plus a `network` block (zone
counts, agent leaderboard, dispatch queue depth); agents get their own
workload; customers get their spend and mix.

```jsonc
{
  "data": {
    "role": "ADMIN",
    "totals": { "orders": 31, "delivered": 11, "failed": 2, "active": 12,
                "revenue": 20234.71, "averageOrderValue": 652.73, "successRate": 85 },
    "statusCounts": { "PENDING": 1, "CONFIRMED": 3, "…": 0 },
    "series": [{ "date": "2026-08-07", "orders": 2, "delivered": 1, "revenue": 1204.5 }],
    "mix": {
      "byOrderType":   [{ "name": "B2C", "value": 22 }],
      "byPaymentType": [{ "name": "COD", "value": 14 }],
      "byZone":        [{ "code": "BLR-S", "name": "South Bengaluru", "orders": 8, "revenue": 5120.4 }]
    },
    "recentActivity": [ /* newest tracking events, admin only */ ],
    "network": { "zones": 6, "areas": 25, "customers": 6, "awaitingAssignment": 3,
                 "agents": { "total": 6, "available": 5, "leaderboard": [ /* … */ ] } }
  }
}
```

---

## Public tracking

### `GET /api/tracking/:code` 🌐

No account required, exactly like every courier. The payload is **redacted
server-side** because a tracking number is a weak secret.

| Included ✅ | Excluded ❌ |
|---|---|
| Status, progress step, full timeline | Street addresses |
| Cities, states, pincodes, zone codes | Contact names and phone numbers |
| Chargeable weight, order/payment type | Declared value, price breakdown, totals |
| Agent's name and vehicle class | Agent's phone or live coordinates |
| Customer's **first name only** | Customer's full name or e-mail |

```jsonc
{
  "data": {
    "code": "SR-7K3M9QX2",
    "status": "OUT_FOR_DELIVERY",
    "customer": { "fullName": "Ananya" },
    "pickupAddress": { "city": "Bengaluru", "state": "Karnataka", "pincode": "560034" },
    "dropAddress":   { "city": "Hyderabad", "state": "Telangana", "pincode": "500034" },
    "pickupZone": { "code": "BLR-S", "name": "South Bengaluru" },
    "agent": { "vehicleType": "BIKE", "user": { "fullName": "Kiran Kumar" } },
    "trackingEvents": [
      { "id": "…", "fromStatus": null, "toStatus": "CONFIRMED",
        "title": "Order placed", "notes": "South Bengaluru → Central Hyderabad",
        "actorRole": "CUSTOMER", "createdAt": "…" }
    ],
    "progress": {
      "current": "OUT_FOR_DELIVERY",
      "meta": { "label": "Out for delivery", "tone": "amber", "…": "…" },
      "step": 5, "totalSteps": 6,
      "isTerminal": false, "needsReschedule": false
    }
  }
}
```

---

## Related

- 📄 [RATE_ENGINE.md](RATE_ENGINE.md) — what `/pricing/quote` actually does
- 📄 [AUTO_ASSIGNMENT.md](AUTO_ASSIGNMENT.md) — what `/auto-assign` actually does
- 📄 [DATABASE.md](DATABASE.md) — the models behind these payloads
- 📄 [TESTING.md](TESTING.md) — a curl walkthrough of the whole lifecycle
