# 🧪 Testing

> 88 automated cases, plus a manual walkthrough that exercises the whole
> lifecycle through the API.

---

## Contents

1. [Running the suite](#running-the-suite)
2. [What is covered](#what-is-covered)
3. [Why the split](#why-the-split)
4. [Manual walkthrough — curl](#manual-walkthrough--curl)
5. [Manual walkthrough — the UI](#manual-walkthrough--the-ui)
6. [Adding a test](#adding-a-test)

---

## Running the suite

```bash
npm test              # once
npm run test:watch    # watch mode
npm run test:coverage # with coverage
```

```
✓ src/domain/orderStateMachine.test.ts   (17 tests)
✓ src/services/assignmentEngine.test.ts  (25 tests)
✓ src/services/rateEngine.test.ts        (27 tests)
✓ src/app.test.ts                        (19 tests)

 Test Files  4 passed (4)
      Tests  88 passed (88)
```

The integration file skips its data-dependent cases automatically if the
database has not been seeded, and says so:

```
[tests] Database not seeded — skipping data-dependent cases. Run: npm run db:seed
```

---

## What is covered

### `rateEngine.test.ts` — 27 cases

The single most important file in the suite: pricing correctness.

| Group | Notable cases |
|---|---|
| `volumetricWeight` | The standard divisor, a lowered divisor, and a zero divisor **throwing** rather than returning `Infinity` |
| `chargeableWeight` | Volumetric beating actual and vice versa, the minimum-weight floor, rounding **up** never down, and ⭐ **the float trap** |
| `freightFor` | Base allowance only, one gram over, the documented worked example, a high-base B2B card, and no negative charge on an underweight parcel |
| `codSurchargeFor` | Flat beating percentage, percentage beating flat, the ceiling clamp, the floor clamp, `maxFee: null`, and a negative declared value |
| Money arithmetic | `0.1 + 0.2`, GST rounding at the paisa, and the **full end-to-end worked example reproduced exactly** |

> ⭐ **The float trap.** `1.5 / 0.5` evaluates to `2.9999999999999996` in
> IEEE-754. A naive `Math.ceil` on the raw division silently bills a whole extra
> slab on an exact boundary. There is a named test for it, and the implementation
> works in integer grams.

### `assignmentEngine.test.ts` — 25 cases

Each of the four signals in isolation, the vehicle-capacity filter, the geo
helpers, and then the **combined ranking behaviour** that actually matters:

- an idle in-zone agent beats a saturated one that is marginally closer;
- with equal workloads, the nearer agent still wins;
- zone familiarity breaks a near-tie on distance;
- the combined score stays inside `[0, 1]` for any input.

### `orderStateMachine.test.ts` — 17 cases

Every declared status has edges; the happy path walks end to end; the graph
refuses to move backwards; `DELIVERED`/`CANCELLED` are terminal but `FAILED` is
**not**; a rescheduled order routes back to `ASSIGNED`; a no-op transition is
rejected even under admin override; capacity accounting counts exactly the four
statuses where an agent physically holds the parcel; and role permissions keep
each persona in its lane.

### `app.test.ts` — 19 cases

Drives the real Express app in-process with supertest.

| Group | Asserts |
|---|---|
| Health & meta | Database up, transports reported, the transition graph served, `statusMeta` complete |
| Error envelope | `ROUTE_NOT_FOUND`, malformed JSON |
| Authentication | 401 unauthenticated, 401 on a garbage token, 422 on a bad payload, and ⭐ **login not revealing whether an e-mail is registered** |
| Role scoping | Admin sees everything; **a customer's list only ever contains their own orders**; a customer gets 403 on `/users` and `/agents` |
| Rate engine | The full worked example (`₹223.49`), lane-override selection, `ZONE_NOT_SERVICEABLE`, dimension validation |
| Public tracking | 404 on an unknown code, and ⭐ **redaction** — no `line1`, no `contactPhone`, no `totalCharge`, first name only |
| Serviceability | A mapped pincode names its zone; an unmapped one returns `200 serviceable:false`, not an error |

---

## Why the split

**Unit tests are pure.** No database, no HTTP. That is only possible because
`rateEngine` and `assignmentEngine` export their maths separately from their
orchestrators — a deliberate design choice that pays for itself here.

**Integration tests are read-only** (plus login, which only issues a token).

> A suite that mutates the database it shares with a running dev server is a
> suite nobody trusts — it fails intermittently, leaves debris, and eventually
> gets `--skip`ped. Write paths are covered by the pure unit tests plus the
> manual walkthrough below.

The natural next step would be a dedicated test database
(`DATABASE_URL=file:./test.db`) pushed and seeded in `globalSetup`, letting the
integration suite cover the write paths too. That is a worthwhile addition, not
a correction — the current split is honest about what it guarantees.

---

## Manual walkthrough — curl

This exercises every requirement in the brief through the API. Run it against a
seeded dev server (`npm run dev`).

```bash
API=http://localhost:4000/api

# a tiny helper to pull a field out of a JSON response
jqp() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(eval('j.'+process.argv[1]))})" "$1"; }
```

### 1 · Quote before confirming — no account needed

```bash
curl -s -X POST $API/pricing/quote -H "Content-Type: application/json" -d '{
  "pickupPincode":"560034","dropPincode":"560011",
  "lengthCm":30,"breadthCm":20,"heightCm":15,"actualWeightKg":1.2,
  "orderType":"B2C","paymentType":"COD","declaredValue":4500
}' | jqp 'data.charges.total'
```

Expect **`223.49`**, with `weights.billedOn = "VOLUMETRIC"` and
`weights.chargeableKg = 2`.

### 2 · Sign in as all three personas

```bash
CT=$(curl -s -X POST $API/auth/login -H "Content-Type: application/json" \
     -d '{"email":"customer@swiftroute.dev","password":"Demo@123"}' | jqp 'data.accessToken')
AT=$(curl -s -X POST $API/auth/login -H "Content-Type: application/json" \
     -d '{"email":"admin@swiftroute.dev","password":"Admin@123"}' | jqp 'data.accessToken')
GT=$(curl -s -X POST $API/auth/login -H "Content-Type: application/json" \
     -d '{"email":"agent@swiftroute.dev","password":"Demo@123"}' | jqp 'data.accessToken')
```

### 3 · Place an order with auto-dispatch

```bash
ORDER=$(curl -s -X POST $API/orders -H "Content-Type: application/json" -H "Authorization: Bearer $CT" -d '{
  "orderType":"B2C","paymentType":"COD","declaredValue":3200,
  "pickup":{"contactName":"Ananya Rao","contactPhone":"+919845012345",
            "line1":"12 Koramangala 5th Block","city":"Bengaluru","state":"Karnataka","pincode":"560034"},
  "drop":{"contactName":"Rohan Bose","contactPhone":"+919812345678",
          "line1":"44 Banjara Hills Rd 12","city":"Hyderabad","state":"Telangana","pincode":"500034"},
  "lengthCm":25,"breadthCm":18,"heightCm":12,"actualWeightKg":2.4,
  "confirmImmediately":true,"autoAssign":true }')

OID=$(echo "$ORDER" | jqp 'data.id')
echo "$ORDER" | jqp 'data.code'
echo "$ORDER" | jqp 'data.status'                      # ASSIGNED
echo "$ORDER" | jqp 'data.rateCard.name'               # the lane-specific promo card
echo "$ORDER" | jqp 'data.agent.user.fullName'
```

✅ *Auto-calculated charge · zone detection · lane-override selection ·
auto-assignment*

### 4 · Inspect the dispatcher's reasoning

```bash
curl -s $API/orders/$OID/assignment-preview -H "Authorization: Bearer $AT" | jqp 'data.reason'
```

✅ *Explainable auto-assignment*

### 5 · Walk the delivery ladder as the agent

```bash
step() { curl -s -X PATCH $API/orders/$OID/status -H "Content-Type: application/json" \
         -H "Authorization: Bearer $GT" -d "$1" | jqp 'data.status || j.error.message'; }

step '{"status":"PICKED_UP"}'
step '{"status":"OUT_FOR_DELIVERY"}'
step '{"status":"CONFIRMED"}'    # ❌ refused: "An agent cannot set an order to CONFIRMED."
step '{"status":"FAILED"}'       # ❌ refused: a failure reason is required
step '{"status":"FAILED","failureReason":"Customer not available"}'
```

✅ *Agent status updates · role guards · transition guards · mandatory failure
reason*

### 6 · Reschedule → re-dispatch to a **different** agent

```bash
curl -s -X POST $API/orders/$OID/reschedule -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CT" \
  -d '{"newDate":"2026-08-24","reason":"Please try after 6pm"}' \
  | jqp 'data.agent.user.fullName'     # a DIFFERENT name from step 3
```

✅ *Failed-delivery flow · reschedule captured · agent reassigned*

### 7 · Read the immutable history

```bash
curl -s $API/orders/$OID/tracking -H "Authorization: Bearer $CT" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>
  JSON.parse(d).data.forEach(e=>console.log(
    String(e.fromStatus||'—').padEnd(17),'→',String(e.toStatus).padEnd(17),e.actorRole.padEnd(8),e.actorName)))"
```

```
—                 →  CONFIRMED         CUSTOMER  Ananya Rao
CONFIRMED         →  ASSIGNED          SYSTEM    Dispatch engine
ASSIGNED          →  PICKED_UP         AGENT     Kiran Kumar
PICKED_UP         →  OUT_FOR_DELIVERY  AGENT     Kiran Kumar
OUT_FOR_DELIVERY  →  FAILED            AGENT     Kiran Kumar
FAILED            →  RESCHEDULED       CUSTOMER  Ananya Rao
RESCHEDULED       →  ASSIGNED          CUSTOMER  Ananya Rao
```

✅ *Immutable tracking history with timestamp and actor*

### 8 · Notifications were generated at every step

```bash
curl -s "$API/notifications?orderId=$OID" -H "Authorization: Bearer $AT" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>
  JSON.parse(d).data.forEach(n=>console.log(n.channel.padEnd(6), n.status.padEnd(6), n.subject||n.body.slice(0,50))))"
```

✅ *E-mail on every status change · SMS at the moments that matter*

### 9 · Admin filters and override

```bash
curl -s "$API/orders?status=FAILED&zoneId=&sort=newest" -H "Authorization: Bearer $AT" | jqp 'pagination.total'

curl -s -X PATCH $API/orders/$OID/status -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AT" \
  -d '{"status":"DELIVERED","override":true,"notes":"Confirmed with the customer by phone"}' | jqp 'data.status'
```

✅ *Admin filters by status/zone/agent · admin can override any order status*

### 10 · Public tracking is redacted

```bash
CODE=$(curl -s $API/orders/$OID -H "Authorization: Bearer $CT" | jqp 'data.code')
curl -s $API/tracking/$CODE | jqp 'JSON.stringify(Object.keys(j.data))'
```

No `totalCharge`, no `declaredValue`, no street addresses, first name only.

✅ *Customer can view live status and the full tracking timeline, safely*

---

## Manual walkthrough — the UI

Five minutes, all three personas.

| # | As | Do | Look for |
|---|---|---|---|
| 1 | 📦 Customer | **Book a pickup** → pincodes `560034` / `500034`, box `30×20×15`, weight `1.2` | The quote panel prices **live**, names both zones, and shows volumetric beating actual |
| 2 | 📦 Customer | Switch payment to **COD**, enter `4500` | A COD line appears **with its formula** |
| 3 | 📦 Customer | Confirm | Redirected to the order, already `ASSIGNED` |
| 4 | 🛡️ Admin | Open the same order | The **Dispatch engine** panel: four signal bars per candidate, the rejection list with reasons |
| 5 | 🛡️ Admin | **Pricing → Test the engine** | Price a hypothetical shipment against live configuration |
| 6 | 🛡️ Admin | **Pricing → Rate cards** → edit a base price → re-run the tester | The new price applies immediately; the existing order's invoice is **unchanged** |
| 7 | 🚚 Agent | **Today's run** → advance the order → **Report a failed attempt** | Reason picker; the customer is notified |
| 8 | 📦 Customer | The failure banner → **Reschedule** | A **different** agent takes the retry |
| 9 | 🛡️ Admin | **Notification outbox** → click a message | The fully rendered branded HTML e-mail |
| 10 | 🌐 Anyone | `/track/<code>` signed out | Timeline and cities, but no prices or addresses |

---

## Adding a test

Unit tests live beside the code they test (`src/**/*.test.ts`) and are picked up
automatically by Vitest.

```ts
import { describe, expect, it } from 'vitest';
import { chargeableWeight } from './rateEngine';

describe('chargeableWeight', () => {
  it('honours a 1 kg slab on a B2B card', () => {
    const result = chargeableWeight({
      actualKg: 5.2, volumetricKg: 0, minKg: 1, slabKg: 1,
    });
    expect(result.chargeableKg).toBe(6);
  });
});
```

Two conventions worth keeping:

- **name the behaviour, not the function** — `'rounds up to the next slab, never
  down'` beats `'test chargeableWeight 2'`;
- **when a test exists because of a real trap, say so in a comment.** The float
  cases in `rateEngine.test.ts` are the model: someone will eventually "simplify"
  the integer-gram arithmetic, and the comment is what stops them.

For a new API endpoint, add cases to `app.test.ts` — but keep them read-only, or
introduce the dedicated test database described above first.

---

## Related

- 📄 [RATE_ENGINE.md](RATE_ENGINE.md) — the maths under test
- 📄 [AUTO_ASSIGNMENT.md](AUTO_ASSIGNMENT.md) — the signals under test
- 📄 [API.md](API.md) — the contract under test
- 📄 [CONTRIBUTING.md](CONTRIBUTING.md) — conventions
