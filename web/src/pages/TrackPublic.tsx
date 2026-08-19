/**
 * Public shipment tracking — no account required, exactly like every courier.
 *
 * The payload is redacted server-side (cities, not street addresses), because a
 * tracking number is a weak secret and must not unlock personal data.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CalendarClock,
  MapPin,
  PackageSearch,
  RefreshCw,
  Search,
  Truck,
  Weight,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { dateOnly, dateTime, kg, relative } from '@/lib/format';
import { Alert, Button, Card, EmptyState, LoadingBlock } from '@/components/ui';
import { ProgressRail, StatusBadge } from '@/components/StatusBadge';
import { TrackingTimeline } from '@/components/TrackingTimeline';
import { Logo } from '@/components/layout/Logo';

export default function TrackPublic() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [input, setInput] = useState(code ?? '');

  useEffect(() => {
    setInput(code ?? '');
  }, [code]);

  const query = useQuery({
    queryKey: ['tracking', code],
    queryFn: () => api.tracking.byCode(code!),
    enabled: Boolean(code),
    // A shipment in motion should update itself while the tab is open.
    refetchInterval: 30_000,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = input.trim().toUpperCase();
    if (trimmed) navigate(`/track/${encodeURIComponent(trimmed)}`);
  };

  const order = query.data;

  return (
    <div className="min-h-screen bg-mesh">
      <header className="border-b border-ink-100 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <Link to="/login" className="btn-secondary btn-sm">
            Sign in
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
        {/* ---- search ---- */}
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
            Track your <span className="text-gradient">shipment</span>
          </h1>
          <p className="mt-3 text-ink-600">
            Enter the tracking number from your confirmation e-mail.
          </p>

          <form
            onSubmit={submit}
            className="mx-auto mt-7 flex max-w-lg gap-2 rounded-2xl border border-white/70 bg-white/90 p-2 shadow-lift backdrop-blur"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={input}
                onChange={(event) => setInput(event.target.value.toUpperCase())}
                placeholder="SR-7K3M9QX2"
                aria-label="Tracking number"
                className="w-full rounded-xl border-0 bg-transparent py-3 pl-9 pr-3 font-mono text-sm font-semibold uppercase tracking-wide text-ink-900 placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-400 focus:outline-none"
              />
            </div>
            <Button type="submit" className="px-5">
              Track
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </div>

        {/* ---- results ---- */}
        <div className="mt-10">
          {!code && (
            <Card>
              <EmptyState
                icon={<PackageSearch className="h-8 w-8" />}
                title="Nothing to show yet"
                description="Your tracking number looks like SR- followed by eight characters. It is in the e-mail we sent when the order was booked."
              />
            </Card>
          )}

          {code && query.isPending && (
            <Card>
              <LoadingBlock label={`Looking up ${code}…`} />
            </Card>
          )}

          {code && query.isError && (
            <Card className="p-6">
              <Alert tone="danger" title="We could not find that shipment">
                {query.error instanceof ApiError && query.error.status === 404
                  ? `No shipment matches "${code}". Double-check the number — it is case-insensitive but every character counts.`
                  : (query.error as Error).message}
              </Alert>
            </Card>
          )}

          {order && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-5"
            >
              {/* summary */}
              <Card className="overflow-hidden">
                <div className="bg-route px-6 py-6 text-white">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest opacity-80">
                        Tracking number
                      </p>
                      <p className="mt-1 font-mono text-2xl font-extrabold">{order.code}</p>
                      <p className="mt-2 text-sm opacity-85">
                        For {order.customer.fullName} · booked {relative(order.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={order.status} />
                      <p className="mt-2 text-xs opacity-80">
                        Updated {relative(order.trackingEvents.at(-1)?.createdAt ?? order.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-7">
                  <ProgressRail status={order.status} />
                </div>

                <div className="grid gap-px border-t border-ink-100 bg-ink-100 sm:grid-cols-3">
                  <Facet
                    icon={<MapPin className="h-4 w-4" />}
                    label="Route"
                    value={`${order.pickupAddress.city} → ${order.dropAddress.city}`}
                    sub={
                      order.pickupZone && order.dropZone
                        ? `${order.pickupZone.code} → ${order.dropZone.code}`
                        : undefined
                    }
                  />
                  <Facet
                    icon={<Weight className="h-4 w-4" />}
                    label="Billed weight"
                    value={kg(order.chargeableWeightKg)}
                    sub={`${order.orderType} · ${order.paymentType}`}
                  />
                  <Facet
                    icon={<CalendarClock className="h-4 w-4" />}
                    label={order.deliveredAt ? 'Delivered on' : 'Expected by'}
                    value={dateOnly(order.deliveredAt ?? order.scheduledDate)}
                    sub={
                      order.attemptCount > 0
                        ? `${order.attemptCount} previous attempt${order.attemptCount === 1 ? '' : 's'}`
                        : undefined
                    }
                  />
                </div>

                {order.agent && (
                  <div className="flex items-center gap-3 border-t border-ink-100 bg-cyan-50/60 px-6 py-4">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-500 text-white">
                      <Truck className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-ink-900">{order.agent.user.fullName}</p>
                      <p className="text-xs text-ink-500">
                        Your delivery agent · {order.agent.vehicleType.toLowerCase()}
                      </p>
                    </div>
                  </div>
                )}
              </Card>

              {/* failure callout */}
              {order.progress.needsReschedule && (
                <Alert
                  tone="danger"
                  title="The last delivery attempt did not succeed"
                  icon={<RefreshCw className="h-4 w-4" />}
                >
                  <p>
                    {order.failureReason ?? 'The agent could not hand over the parcel.'} Your parcel
                    is safe with us.
                  </p>
                  <p className="mt-2">
                    <Link to="/login" className="link">
                      Sign in to pick a new delivery date
                    </Link>{' '}
                    — we will assign a fresh agent for the next attempt.
                  </p>
                </Alert>
              )}

              {/* timeline */}
              <Card className="p-6">
                <h2 className="section-title mb-5">Journey so far</h2>
                <TrackingTimeline
                  events={order.trackingEvents.map((event) => ({ ...event, actorName: undefined }))}
                />
              </Card>

              <p className="text-center text-xs text-ink-400">
                Last refreshed {dateTime(new Date())} · this page updates itself every 30 seconds
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function Facet({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 truncate text-sm font-bold text-ink-900">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-ink-500">{sub}</p>}
    </div>
  );
}
