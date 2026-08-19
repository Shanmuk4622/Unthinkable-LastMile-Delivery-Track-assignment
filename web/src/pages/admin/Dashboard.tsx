/**
 * Operations control room.
 *
 * The one screen an ops lead keeps open: what is stuck, who is free, what the
 * network earned, and a live feed of everything happening across the estate.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  IndianRupee,
  MapPinned,
  PackageCheck,
  Truck,
  Users,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { STATUS_STYLES, money, moneyCompact, percent, relative } from '@/lib/format';
import { PageHeader } from '@/components/layout/AppShell';
import { OrderTable } from '@/components/OrderTable';
import { AvailabilityBadge, StatusBadge, StatusIcon } from '@/components/StatusBadge';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  ErrorState,
  LoadingBlock,
  StatTile,
} from '@/components/ui';
import type { OrderStatus } from '@/lib/types';

const PIPELINE: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
];

export default function AdminDashboard() {
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: api.analytics.dashboard });
  const unassigned = useQuery({
    queryKey: ['orders', 'unassigned'],
    queryFn: () => api.orders.list({ status: 'CONFIRMED', pageSize: 5 }),
  });

  if (dashboard.isPending) return <LoadingBlock />;
  if (dashboard.isError)
    return <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />;

  const { totals, statusCounts, series, mix, network, recentActivity } = dashboard.data;

  return (
    <>
      <PageHeader
        eyebrow="Control room"
        title="Operations overview"
        subtitle="Network-wide throughput, dispatch health and revenue."
        actions={
          <>
            <Link to="/admin/new" className="btn-secondary">
              Create order
            </Link>
            <Link to="/admin/orders" className="btn-primary">
              All orders
              <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        }
      />

      {/* ---- alert ---- */}
      {(network?.awaitingAssignment ?? 0) > 0 && (
        <Alert
          tone="warning"
          title={`${network!.awaitingAssignment} order${network!.awaitingAssignment === 1 ? '' : 's'} waiting for an agent`}
          icon={<AlertTriangle className="h-4 w-4" />}
        >
          These are confirmed but unassigned. Open one and hit auto-assign, or use the dispatch
          panel to pick a specific agent.
        </Alert>
      )}

      {/* ---- stats ---- */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total orders"
          value={totals.orders}
          sublabel={`${totals.active} in the network now`}
          icon={<PackageCheck className="h-5 w-5" />}
          gradient="from-violet-500 to-fuchsia-500"
        />
        <StatTile
          label="Revenue"
          value={moneyCompact(totals.revenue)}
          sublabel={`${money(totals.averageOrderValue)} average order`}
          icon={<IndianRupee className="h-5 w-5" />}
          gradient="from-emerald-500 to-teal-500"
        />
        <StatTile
          label="Success rate"
          value={totals.successRate !== null ? percent(totals.successRate) : '—'}
          sublabel={`${totals.delivered} delivered · ${totals.failed} failed`}
          icon={<Activity className="h-5 w-5" />}
          gradient="from-sky-500 to-blue-600"
        />
        <StatTile
          label="Agents available"
          value={`${network?.agents.available ?? 0}/${network?.agents.total ?? 0}`}
          sublabel={`${network?.zones ?? 0} zones · ${network?.areas ?? 0} pincodes`}
          icon={<Truck className="h-5 w-5" />}
          gradient="from-amber-500 to-orange-500"
        />
      </div>

      {/* ---- pipeline ---- */}
      <Card className="mt-6 p-5">
        <p className="mb-4 text-xs font-bold uppercase tracking-wider text-ink-400">
          Order pipeline
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          {PIPELINE.map((status) => {
            const style = STATUS_STYLES[status];
            const count = statusCounts[status] ?? 0;
            return (
              <Link
                key={status}
                to={`/admin/orders?status=${status}`}
                className={clsx(
                  'group rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-soft',
                  count > 0 ? style.border : 'border-ink-200',
                  count > 0 ? style.soft : 'bg-white',
                )}
              >
                <span
                  className={clsx(
                    'grid h-8 w-8 place-items-center rounded-lg text-white',
                    count > 0 ? style.solid : 'bg-ink-300',
                  )}
                >
                  <StatusIcon status={status} className="h-4 w-4" />
                </span>
                <p
                  className={clsx(
                    'mt-2 font-mono text-xl font-extrabold',
                    count > 0 ? style.text : 'text-ink-300',
                  )}
                >
                  {count}
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase leading-tight tracking-wide text-ink-500">
                  {status.replace(/_/g, ' ')}
                </p>
              </Link>
            );
          })}
        </div>
      </Card>

      {/* ---- charts ---- */}
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Throughput & revenue" subtitle="Last 14 days across the network" />
          <div className="h-72 p-5">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value: string) => value.slice(5).replace('-', '/')}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value: number) => `₹${Math.round(value / 1000)}k`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                    boxShadow: '0 8px 24px rgba(15,23,42,.10)',
                  }}
                  formatter={(value: number, name: string) =>
                    name === 'Revenue' ? money(value) : value
                  }
                />
                <Bar
                  yAxisId="left"
                  dataKey="orders"
                  name="Orders"
                  fill="#a78bfa"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={26}
                />
                <Bar
                  yAxisId="left"
                  dataKey="delivered"
                  name="Delivered"
                  fill="#10b981"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={26}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#0ea5e9"
                  strokeWidth={2.5}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Volume by zone" subtitle="Where the work is" />
          <div className="h-72 p-5">
            {mix.byZone.length === 0 ? (
              <p className="grid h-full place-items-center text-sm text-ink-400">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={mix.byZone.slice(0, 6)}
                  layout="vertical"
                  margin={{ top: 0, right: 12, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="code"
                    width={54}
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Bar dataKey="orders" name="Orders" fill="#7c3aed" radius={[0, 5, 5, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* ---- agents + activity ---- */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader
            title="Agent roster"
            subtitle="Availability and delivery record"
            icon={<Users className="h-4.5 w-4.5" />}
            action={
              <Link to="/admin/agents" className="btn-secondary btn-sm">
                Manage
              </Link>
            }
          />
          <ul className="divide-y divide-ink-100">
            {(network?.agents.leaderboard ?? []).map((agent) => (
              <li key={agent.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink-900">{agent.name}</p>
                  <p className="mt-0.5 text-[11px] text-ink-500">
                    {agent.zone ?? 'No zone'} · {agent.activeOrders}/{agent.capacity} in hand ·{' '}
                    {agent.delivered} delivered
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {agent.successRate !== null && (
                    <Badge
                      className={
                        agent.successRate >= 90
                          ? 'bg-emerald-100 text-emerald-700'
                          : agent.successRate >= 75
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-rose-100 text-rose-700'
                      }
                    >
                      {agent.successRate}%
                    </Badge>
                  )}
                  <AvailabilityBadge availability={agent.availability} />
                </div>
              </li>
            ))}
            {(network?.agents.leaderboard.length ?? 0) === 0 && (
              <li className="px-5 py-8 text-center text-sm text-ink-400">
                No delivery agents yet — create them under Users.
              </li>
            )}
          </ul>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Live activity"
            subtitle="The newest tracking events across every order"
            icon={<Zap className="h-4.5 w-4.5" />}
          />
          <ul className="divide-y divide-ink-100">
            {recentActivity.map((event) => (
              <li key={event.id}>
                <Link
                  to={`/admin/orders/${event.order.id}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-brand-50/40"
                >
                  <span
                    className={clsx(
                      'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white',
                      STATUS_STYLES[event.toStatus].solid,
                    )}
                  >
                    <StatusIcon status={event.toStatus} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-800">{event.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-ink-500">
                      <span className="font-mono font-bold text-brand-600">
                        {event.order.code}
                      </span>{' '}
                      · {event.order.customer.fullName} · {relative(event.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={event.toStatus} size="sm" withIcon={false} />
                </Link>
              </li>
            ))}
            {recentActivity.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-ink-400">No activity yet.</li>
            )}
          </ul>
        </Card>
      </div>

      {/* ---- unassigned queue ---- */}
      <Card className="mt-6 overflow-hidden">
        <CardHeader
          title="Waiting for dispatch"
          subtitle="Confirmed orders with no agent yet"
          icon={<MapPinned className="h-4.5 w-4.5" />}
          action={
            <Link to="/admin/orders?status=CONFIRMED" className="btn-secondary btn-sm">
              View queue
            </Link>
          }
        />
        <OrderTable
          orders={unassigned.data?.items ?? []}
          loading={unassigned.isPending}
          basePath="/admin/orders"
          columns={['code', 'route', 'customer', 'weight', 'charge', 'placed']}
          emptyTitle="Dispatch queue is clear"
          emptyDescription="Every confirmed order has an agent."
        />
      </Card>
    </>
  );
}
