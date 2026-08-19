/**
 * Agent home.
 *
 * Built for someone holding a phone with one hand: duty toggle at the top,
 * today's numbers, then the queue with the single most likely next action on
 * each card. The GPS ping is what makes "nearest available agent" real, so it
 * gets a prominent, one-tap control.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Crosshair,
  Loader2,
  MapPin,
  Package,
  TrendingUp,
  Truck,
  XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { AVAILABILITY_STYLES, dateTime, percent, relative } from '@/lib/format';
import { PageHeader } from '@/components/layout/AppShell';
import { StatusBadge, StatusIcon } from '@/components/StatusBadge';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingBlock,
  StatTile,
} from '@/components/ui';
import type { AgentAvailability, OrderStatus } from '@/lib/types';

/** The one obvious next step for each status the agent can act on. */
const NEXT_ACTION: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  ASSIGNED: { to: 'PICKED_UP', label: 'Mark picked up' },
  PICKED_UP: { to: 'IN_TRANSIT', label: 'Start transit' },
  IN_TRANSIT: { to: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  OUT_FOR_DELIVERY: { to: 'DELIVERED', label: 'Mark delivered' },
};

export default function AgentDashboard() {
  const queryClient = useQueryClient();
  const [pinging, setPinging] = useState(false);

  const profile = useQuery({ queryKey: ['agent-me'], queryFn: api.agents.me });
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: api.analytics.dashboard });
  const queue = useQuery({
    queryKey: ['orders', 'agent-queue'],
    queryFn: () => api.orders.list({ pageSize: 50 }),
    refetchInterval: 45_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['agent-me'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const setAvailability = useMutation({
    mutationFn: (availability: AgentAvailability) => api.agents.setAvailability(availability),
    onSuccess: (updated) => {
      toast.success(`You are now ${AVAILABILITY_STYLES[updated.availability].label.toLowerCase()}.`);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not update.'),
  });

  const advance = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      api.orders.changeStatus(id, { status }),
    onSuccess: (order) => {
      toast.success(`${order.code} → ${order.status.replace(/_/g, ' ').toLowerCase()}`);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Update failed.'),
  });

  /** Ask the browser for a fix and push it to the dispatcher. */
  const ping = () => {
    if (!navigator.geolocation) {
      toast.error('This browser cannot share a location.');
      return;
    }
    setPinging(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await api.agents.ping(position.coords.latitude, position.coords.longitude);
          toast.success('Location shared with dispatch.');
          void queryClient.invalidateQueries({ queryKey: ['agent-me'] });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not share location.');
        } finally {
          setPinging(false);
        }
      },
      () => {
        toast.error('Location permission denied.');
        setPinging(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  if (profile.isPending || dashboard.isPending) return <LoadingBlock />;
  if (profile.isError) return <ErrorState error={profile.error} onRetry={() => profile.refetch()} />;

  const me = profile.data;
  const totals = dashboard.data?.totals;

  const active = (queue.data?.items ?? []).filter((order) =>
    ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(order.status),
  );

  const availabilityStyle = AVAILABILITY_STYLES[me.availability];

  return (
    <>
      <PageHeader
        eyebrow="On duty"
        title="Today's run"
        subtitle={`${me.vehicleType.toLowerCase()}${me.vehicleNumber ? ` · ${me.vehicleNumber}` : ''}${
          me.zone ? ` · ${me.zone.name}` : ''
        }`}
      />

      {/* ---- duty controls ---- */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              {me.availability === 'AVAILABLE' && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={clsx('relative inline-flex h-3 w-3 rounded-full', availabilityStyle.dot)}
              />
            </span>
            <div>
              <p className="text-sm font-bold text-ink-900">{availabilityStyle.label}</p>
              <p className="text-xs text-ink-500">
                {me.activeOrderCount}/{me.maxConcurrentOrders} orders in hand
                {me.lastLocationAt ? ` · pinged ${relative(me.lastLocationAt)}` : ' · no GPS fix yet'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['AVAILABLE', 'ON_BREAK', 'OFFLINE'] as AgentAvailability[]).map((option) => (
              <button
                key={option}
                onClick={() => setAvailability.mutate(option)}
                disabled={setAvailability.isPending}
                className={clsx(
                  'rounded-xl border px-3.5 py-2 text-xs font-bold transition-all disabled:opacity-50',
                  me.availability === option
                    ? 'border-transparent bg-route text-white shadow-glow'
                    : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300 hover:text-brand-700',
                )}
              >
                {AVAILABILITY_STYLES[option].label}
              </button>
            ))}

            <Button
              variant="secondary"
              size="sm"
              onClick={ping}
              disabled={pinging}
              icon={
                pinging ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Crosshair className="h-3.5 w-3.5" />
                )
              }
            >
              Share location
            </Button>
          </div>
        </div>

        {me.currentLat !== null && me.currentLng !== null && (
          <div className="flex items-center gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-2.5 text-[11px] text-ink-500">
            <MapPin className="h-3.5 w-3.5" />
            <span className="font-mono">
              {me.currentLat.toFixed(4)}, {me.currentLng.toFixed(4)}
            </span>
            {me.lastLocationAt && <span>· updated {dateTime(me.lastLocationAt)}</span>}
          </div>
        )}
      </Card>

      {/* ---- stats ---- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="In hand"
          value={me.activeOrderCount}
          sublabel={`Capacity ${me.maxConcurrentOrders}`}
          icon={<Package className="h-5 w-5" />}
          gradient="from-cyan-500 to-blue-600"
        />
        <StatTile
          label="Delivered today"
          value={me.today?.deliveredToday ?? 0}
          sublabel={`${me.totalDelivered} all time`}
          icon={<CheckCircle2 className="h-5 w-5" />}
          gradient="from-emerald-500 to-teal-500"
        />
        <StatTile
          label="Failed today"
          value={me.today?.failedToday ?? 0}
          sublabel={`${me.totalFailed} all time`}
          icon={<XCircle className="h-5 w-5" />}
          gradient="from-rose-500 to-pink-500"
        />
        <StatTile
          label="Success rate"
          value={totals?.successRate !== null && totals ? percent(totals.successRate) : '—'}
          sublabel={`Rating ${me.ratingAvg.toFixed(1)} / 5`}
          icon={<TrendingUp className="h-5 w-5" />}
          gradient="from-violet-500 to-fuchsia-500"
        />
      </div>

      {/* ---- queue ---- */}
      <Card className="mt-6 overflow-hidden">
        <CardHeader
          title="Your active deliveries"
          subtitle="Tap the action to move a parcel along"
          icon={<Truck className="h-4.5 w-4.5" />}
          action={
            <Link to="/agent/deliveries" className="btn-secondary btn-sm">
              All deliveries
            </Link>
          }
        />

        {queue.isPending && <LoadingBlock label="Loading your run…" />}

        {!queue.isPending && active.length === 0 && (
          <EmptyState
            icon={<CheckCircle2 className="h-8 w-8" />}
            title="Nothing in hand"
            description={
              me.availability === 'AVAILABLE'
                ? 'You are marked available — the dispatcher will send work your way.'
                : 'Set yourself to available so the dispatcher can assign you orders.'
            }
          />
        )}

        <ul className="divide-y divide-ink-100">
          {active.map((order) => {
            const next = NEXT_ACTION[order.status];
            return (
              <li key={order.id} className="p-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Link to={`/agent/orders/${order.id}`} className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-brand-700">
                        {order.code}
                      </span>
                      <StatusBadge status={order.status} size="sm" />
                      {order.paymentType === 'COD' && (
                        <span className="badge bg-amber-100 text-amber-800">
                          Collect ₹{order.declaredValue}
                        </span>
                      )}
                    </div>

                    <p className="mt-1.5 text-sm font-semibold text-ink-800">
                      {order.dropAddress.line1}, {order.dropAddress.city} —{' '}
                      {order.dropAddress.pincode}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {order.dropAddress.contactName} · {order.dropAddress.contactPhone}
                      {order.dropAddress.landmark ? ` · near ${order.dropAddress.landmark}` : ''}
                    </p>
                  </Link>

                  <div className="flex shrink-0 flex-col items-stretch gap-2">
                    {next && (
                      <Button
                        size="sm"
                        loading={advance.isPending}
                        onClick={() => advance.mutate({ id: order.id, status: next.to })}
                        icon={<StatusIcon status={next.to} className="h-3.5 w-3.5" />}
                      >
                        {next.label}
                      </Button>
                    )}
                    <Link to={`/agent/orders/${order.id}`} className="btn-secondary btn-sm">
                      Details
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
