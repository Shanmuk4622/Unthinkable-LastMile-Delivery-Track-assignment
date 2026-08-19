/**
 * Customer home: what is moving right now, what it has cost, and one obvious
 * next action.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  IndianRupee,
  PackagePlus,
  Truck,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { CHART_COLORS, money, moneyCompact, percent } from '@/lib/format';
import { PageHeader } from '@/components/layout/AppShell';
import { OrderTable } from '@/components/OrderTable';
import { Card, CardHeader, ErrorState, LoadingBlock, StatTile } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';

export default function CustomerDashboard() {
  const { user } = useAuth();

  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: api.analytics.dashboard });
  const recent = useQuery({
    queryKey: ['orders', { pageSize: 6 }],
    queryFn: () => api.orders.list({ pageSize: 6 }),
  });

  if (dashboard.isPending) return <LoadingBlock />;
  if (dashboard.isError)
    return <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />;

  const { totals, series, mix, statusCounts } = dashboard.data;

  const activeStatuses = (
    ['CONFIRMED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] as const
  ).filter((status) => statusCounts[status] > 0);

  return (
    <>
      <PageHeader
        eyebrow="Your shipping"
        title={`Hello, ${user?.fullName.split(' ')[0]}`}
        subtitle="Everything you have in the network, and what it is costing you."
        actions={
          <Link to="/app/new" className="btn-primary">
            <PackagePlus className="h-4 w-4" />
            Book a pickup
          </Link>
        }
      />

      {/* ---- stats ---- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total orders"
          value={totals.orders}
          sublabel={`${totals.active} moving right now`}
          icon={<Truck className="h-5 w-5" />}
          gradient="from-violet-500 to-fuchsia-500"
        />
        <StatTile
          label="Delivered"
          value={totals.delivered}
          sublabel={totals.successRate !== null ? `${percent(totals.successRate)} success rate` : 'No attempts yet'}
          icon={<CheckCircle2 className="h-5 w-5" />}
          gradient="from-emerald-500 to-teal-500"
        />
        <StatTile
          label="Total spend"
          value={moneyCompact(totals.revenue)}
          sublabel={`${money(totals.averageOrderValue)} average`}
          icon={<IndianRupee className="h-5 w-5" />}
          gradient="from-sky-500 to-blue-600"
        />
        <StatTile
          label="In flight"
          value={totals.active}
          sublabel={activeStatuses.length ? activeStatuses.length + ' stages active' : 'Nothing in transit'}
          icon={<TrendingUp className="h-5 w-5" />}
          gradient="from-amber-500 to-orange-500"
        />
      </div>

      {/* ---- live pipeline ---- */}
      {activeStatuses.length > 0 && (
        <Card className="mt-6 p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-400">
            Live pipeline
          </p>
          <div className="flex flex-wrap gap-2">
            {activeStatuses.map((status) => (
              <Link
                key={status}
                to={`/app/orders?status=${status}`}
                className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft"
              >
                <StatusBadge status={status} size="sm" />
                <span className="font-mono text-sm font-extrabold text-ink-900">
                  {statusCounts[status]}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* ---- charts ---- */}
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Shipping activity" subtitle="Orders and spend over the last 14 days" />
          <div className="h-64 p-5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value: string) => value.slice(5).replace('-', '/')}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                    boxShadow: '0 8px 24px rgba(15,23,42,.10)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="orders"
                  name="Orders"
                  stroke="#7c3aed"
                  strokeWidth={2.5}
                  fill="url(#ordersFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Shipment mix" subtitle="Order and payment types" />
          <div className="h-64 p-5">
            {mix.byOrderType.length === 0 ? (
              <p className="grid h-full place-items-center text-sm text-ink-400">
                No shipments yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[...mix.byOrderType, ...mix.byPaymentType]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="45%"
                    outerRadius="78%"
                    paddingAngle={3}
                    label={({ name, value }) => `${name} ${value}`}
                    labelLine={false}
                    style={{ fontSize: 11 }}
                  >
                    {[...mix.byOrderType, ...mix.byPaymentType].map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* ---- recent ---- */}
      <Card className="mt-6 overflow-hidden">
        <CardHeader
          title="Recent orders"
          subtitle="Your six most recent shipments"
          action={
            <Link to="/app/orders" className="btn-secondary btn-sm">
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <OrderTable
          orders={recent.data?.items ?? []}
          loading={recent.isPending}
          basePath="/app/orders"
          columns={['code', 'route', 'weight', 'charge', 'status', 'placed']}
          emptyTitle="No shipments yet"
          emptyDescription="Book your first pickup and we will price it before you confirm."
          emptyAction={
            <Link to="/app/new" className="btn-primary">
              <PackagePlus className="h-4 w-4" />
              Book a pickup
            </Link>
          }
        />
      </Card>
    </>
  );
}
