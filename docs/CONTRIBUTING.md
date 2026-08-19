# 🤝 Contributing

> Conventions, and recipes for the changes people actually make.

---

## Contents

1. [Getting set up](#getting-set-up)
2. [Conventions](#conventions)
3. [Commit style](#commit-style)
4. [Recipe: add an order status](#recipe-add-an-order-status)
5. [Recipe: add a pricing rule](#recipe-add-a-pricing-rule)
6. [Recipe: add a dispatch signal](#recipe-add-a-dispatch-signal)
7. [Recipe: add an API endpoint](#recipe-add-an-api-endpoint)
8. [Before you open a PR](#before-you-open-a-pr)

---

## Getting set up

```bash
git clone <repo> && cd <repo>
cp .env.example .env
npm run setup       # install → generate → push schema → seed
npm run dev         # API :4000 · client :5173
```

Useful during development:

```bash
npm run db:studio   # browse the database
npm run db:reset    # wipe + re-seed
npm run typecheck   # both workspaces
npm test            # 88 cases
```

> **Windows:** stop `npm run dev` before `npm run build`. A running dev server
> holds the Prisma query engine DLL open and the build fails with `EPERM`.

---

## Conventions

### Code

| | |
|---|---|
| **Language** | TypeScript, `strict: true`, in both workspaces |
| **Naming** | `camelCase` values, `PascalCase` types and components, `SCREAMING_SNAKE` for module-level constants |
| **Async** | `async`/`await` everywhere; no `.then()` chains |
| **Errors** | `throw` an `AppError` from `utils/errors.ts`; never write to `res` from a service |
| **Config** | Read from `config/env.ts`. **Nothing** reads `process.env` directly. |
| **Money** | Always through `utils/money.ts`. Never `+` two rupee floats. |
| **Enums** | Always from `domain/constants.ts`. Never a bare string literal. |

### Comments

Comment **why**, not what. The code already says what it does.

```ts
// ✅ explains a decision the reader would otherwise undo
// Work in integer grams: 1.5 / 0.5 evaluates to 2.9999999999999996 in
// IEEE-754, which would silently add a slab on an exact boundary.
const slabs = Math.ceil(grams / slabGrams);

// ❌ restates the line below it
// round up the slabs
const slabs = Math.ceil(grams / slabGrams);
```

Every module has a header block explaining its role and the non-obvious choices
inside it. Keep that up when you add one.

### Layering

Dependencies point **downward only**: routes → services → Prisma.

- a route handler should be short: pull the validated body, call a service,
  serialise;
- a service must never import from `routes/` or touch `req`/`res`;
- `domain/` is pure — no I/O, no imports from anywhere else in the app.

---

## Commit style

Conventional Commits, with a body that explains the *why*.

```
<type>(<scope>): <imperative summary>

Why this change was needed, and any non-obvious decision inside it.
Wrap at 80 characters.
```

| Type | For |
|---|---|
| `feat` | New capability |
| `fix` | Bug fix |
| `refactor` | Behaviour unchanged |
| `test` | Tests only |
| `docs` | Documentation only |
| `build` / `ci` | Toolchain, deployment |
| `chore` | Everything else |

Scopes in use: `db`, `core`, `pricing`, `dispatch`, `auth`, `orders`, `api`,
`seed`, `web`, `test`.

<details>
<summary>An example from this repository's history</summary>

```
fix(seed): keep every generated timestamp in the past

The tracking ladder added a fixed 45-305 minute gap per step from the order's
creation time, which for orders booked earlier the same day pushed the later
events past 'now' — the admin activity feed read 'in 16 hours'.

Events are now spaced naturally but compressed to fit the window between the
order's creation and the present, and offset() refuses to return a future date.
```

The summary says what changed; the body says what was actually wrong and what
the fix does about it.
</details>

**One logical change per commit.** If the summary needs an "and", it is two
commits.

---

## Recipe: add an order status

The state machine is designed so this is a small, compiler-guided change.

**1 · Declare it** in [`domain/constants.ts`](../server/src/domain/constants.ts):

```ts
export const ORDER_STATUSES = [
  'PENDING', 'CONFIRMED', 'ASSIGNED',
  'AWAITING_PICKUP',            // ← new
  'PICKED_UP', /* … */
] as const;
```

**2 · Give it presentation metadata** in the same file:

```ts
AWAITING_PICKUP: {
  label: 'Awaiting pickup',
  description: 'The agent is at the pickup point.',
  tone: 'cyan',
  icon: 'map-pin',
  step: 3,
},
```

**3 · Wire its edges** in
[`orderStateMachine.ts`](../server/src/domain/orderStateMachine.ts):

```ts
ASSIGNED:        ['AWAITING_PICKUP', 'FAILED', 'CANCELLED'],
AWAITING_PICKUP: ['PICKED_UP', 'FAILED'],
```

**4 · Decide who may request it** (`ROLE_PERMITTED_TARGETS`) and **whether it
occupies agent capacity** (`ACTIVE_STATUSES`).

**5 · Add a client colour** in [`web/src/lib/format.ts`](../web/src/lib/format.ts)
and an icon in `StatusBadge.tsx`.

Now run `npm run typecheck`. Every `Record<OrderStatus, …>` in the codebase will
fail until it is handled — that is the design working. The Zod validators and
`/api/meta` pick the new status up automatically.

---

## Recipe: add a pricing rule

Two shapes, depending on what you are adding.

### A new charge component

Say a **remote-area surcharge**.

1. Add the columns to `RateCard` in
   [`schema.prisma`](../server/prisma/schema.prisma) (e.g. `remoteAreaFee`), and
   a flag to `Area` (`isRemote`).
2. `npm run db:push`.
3. Apply it in `calculateQuote`, **and emit a `RateLine`** — a charge without an
   explanation is a bug in this codebase:
   ```ts
   if (drop.area.isRemote && card.remoteAreaFee > 0) {
     lines.push({
       key: 'remote',
       label: 'Remote area surcharge',
       formula: `${drop.area.name} is flagged remote`,
       amount: card.remoteAreaFee,
       kind: 'charge',
     });
   }
   ```
4. Add a column to `Order` so it is part of the frozen snapshot.
5. Extend the Zod schemas and the admin rate-card form.
6. **Write a test.** Pricing changes without tests are not merged.

### A new *dimension* of pricing

Say time-of-day pricing. Prefer extending `RateCard` (a `timeWindow` column plus
resolution precedence) over adding a parallel table — the resolution logic in
`resolveRateCard` is the one place this belongs, and keeping it there is what
makes the precedence rules explicable.

---

## Recipe: add a dispatch signal

Say **agent rating recency** — a fresh 5★ should count more than one from 2023.

1. Write a pure signal function in
   [`assignmentEngine.ts`](../server/src/services/assignmentEngine.ts),
   normalised to `[0, 1]`:
   ```ts
   export function recencySignal(lastDeliveredAt: Date | null): number {
     if (!lastDeliveredAt) return 0.5;
     const days = (Date.now() - lastDeliveredAt.getTime()) / 86_400_000;
     return Math.max(0, 1 - days / 30);
   }
   ```
2. Add its weight to `config/env.ts` (`ASSIGN_WEIGHT_RECENCY`) and into the
   normalisation block — the weights **must** keep summing to 1.
3. Include it in the `signals` object so it reaches `ScoredCandidate`.
4. Add a bar to `SignalBar` in
   [`AssignmentPanel.tsx`](../web/src/components/AssignmentPanel.tsx). **A signal
   the admin cannot see is a signal they cannot trust.**
5. Document it in [AUTO_ASSIGNMENT.md](AUTO_ASSIGNMENT.md) and `.env.example`.
6. Test it in isolation, and add a combined-ranking case showing what it changes.

---

## Recipe: add an API endpoint

1. **Validator** in [`validators/index.ts`](../server/src/validators/index.ts),
   deriving any enum from `domain/constants.ts`.
2. **Service function** — all the logic, no `req`/`res`.
3. **Route** — thin:
   ```ts
   router.post(
     '/:id/hold',
     authorize('ADMIN'),
     validate({ params: idParam, body: holdSchema }),
     asyncHandler(async (req, res) => {
       const order = await orders.hold(req.params.id, req.body.reason, actorOf(req));
       res.json({ success: true, data: order });
     }),
   );
   ```
4. **Document it** in [API.md](API.md).
5. **Test it** in `app.test.ts` (read-only) or as a unit test on the service.

Checklist for any new route:

- [ ] Is it behind `authenticate` / `authorize`?
- [ ] Is the body validated?
- [ ] Is the query **scoped** to the caller (`scopeFor` / `assertCanView`)?
- [ ] Does it use `asyncHandler`, so a rejection reaches the error middleware?
- [ ] Does it return the standard envelope?
- [ ] If it writes, is it inside a transaction with its tracking event?

---

## Before you open a PR

```bash
npm run typecheck   # both workspaces, zero errors
npm test            # all green
npm run build       # both workspaces build
```

CI runs exactly this, then boots the compiled server and asserts `/api/health`
actually answers.

Then ask yourself:

- **Does a reviewer need to read the diff to know why?** If so, the commit body
  is not doing its job.
- **Did anything become configurable?** It belongs in `.env.example` with a
  comment, and in the relevant doc.
- **Did a public behaviour change?** Update `docs/` in the same PR. Documentation
  that lags the code is worse than none.
- **Did you add a number?** If it is a business rule, it belongs in a database
  table, not a constant.

---

## Related

- 📄 [ARCHITECTURE.md](ARCHITECTURE.md) — layering and boundaries
- 📄 [TESTING.md](TESTING.md) — what to test and how
- 📄 [DATABASE.md](DATABASE.md) — schema conventions
