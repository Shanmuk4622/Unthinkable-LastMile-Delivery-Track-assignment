/**
 * Deeper network analytics — the numbers an ops lead reviews weekly rather
 * than watches live.
 */
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, IndianRupee, PackageCheck, Percent } from 'lucide-react';
import { api } from '@/lib/api';
import { CHART_COLORS, STATUS_STYLES, money, moneyCompact, percent } from '@/lib/format';
import { PageHeader } from '@/components/layout/AppShell';
import { Card, CardHeader, ErrorState, LoadingBlock, StatTile } from '@/components/ui';
import type { OrderStatus } from '@/lib/types';

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  fontSize: 12,
  boxShadow: '0 8px 24px rgba(15,23,42,.10)',
} as const;

export default function AdminAnalytics() {
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: api.analytics.dashboard });

  if (dashboard.isPending) return <LoadingBlock />;
  if (dashboard.isError)
    return <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />;

  const { totals, statusCounts, series, mix, network } = dashboard.data;

  const statusData = (Object.entries(statusCounts) as Array<[OrderStatus, number]>)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({
      name: status.replace(/_/g, ' '),
      value: count,
      fill: STATUS_STYLES[status].hex,
    }));

  const agentRadar = (network?.agents.leaderboard ?? []).slice(0, 6).map((agent) => ({
    agent: agent.name.split(' ')[0],
    delivered: agent.delivered,
    successRate: agent.successRate ?? 0,
  }));

  const cumulative = series.reduce<Array<{ date: string; total: number }>>((acc, day) => {
    const previous = acc.at(-1)?.total ?? 0;
    acc.push({ date: day.date, total: Math.round((previous + day.revenue) * 100) / 100 });
    return acc;
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Insight"
        title="Network analytics"
        subtitle="Throughput, revenue, zone concentration and agent performance across the last fortnight."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Orders"
          value={totals.orders}
          sublabel={`${totals.active} in flight`}
          icon={<PackageCheck className="h-5 w-5" />}
          gradient="from-violet-500 to-fuchsia-500"
        />
        <StatTile
          label="Revenue"
          value={moneyCompact(totals.revenue)}
          sublabel={`${money(totals.averageOrderValue)} average`}
          icon={<IndianRupee className="h-5 w-5" />}
          gradient="from-emerald-500 to-teal-500"
        />
        <StatTile
          label="Delivery success"
          value={totals.successRate !== null ? percent(totals.successRate) : '—'}
          sublabel={`${totals.failed} failed attempts`}
          icon={<Percent className="h-5 w-5" />}
          gradient="from-sky-500 to-blue-600"
        />
        <StatTile
          label="Zone coverage"
          value={`${network?.zones ?? 0}`}
          sublabel={`${network?.areas ?? 0} serviceable pincodes`}
          icon={<Activity className="h-5 w-5" />}
          gradient="from-amber-500 to-orange-500"
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Status distribution" subtitle="Where every order currently sits" />
          <div className="h-72 p-5">
            {statusData.length === 0 ? (
              <p className="grid h-full place-items-center text-sm text-ink-400">No orders yet</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="42%"
                    outerRadius="76%"
                    paddingAngle={2}
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                    style={{ fontSize: 10 }}
                  >
                    {statusData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Cumulative revenue" subtitle="Running total over 14 days" />
          <div className="h-72 p-5">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cumulative} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value: string) => value.slice(5).replace('-', '/')}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value: number) => `₹${Math.round(value / 1000)}k`}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => money(value)} />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Cumulative revenue"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Revenue by zone" subtitle="Where the money comes from" />
          <div className="h-72 p-5">
            {mix.byZone.length === 0 ? (
              <p className="grid h-full place-items-center text-sm text-ink-400">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mix.byZone} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="code"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value: number) => `₹${Math.round(value / 1000)}k`}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number) => money(value)}
                  />
                  <Bar dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]} maxBarSize={44}>
                    {mix.byZone.map((entry, index) => (
                      <Cell key={entry.code} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Agent performance" subtitle="Deliveries and success rate" />
          <div className="h-72 p-5">
            {agentRadar.length === 0 ? (
              <p className="grid h-full place-items-center text-sm text-ink-400">
                No agent history yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={agentRadar} outerRadius="72%">
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="agent" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Radar
                    name="Success rate %"
                    dataKey="successRate"
                    stroke="#7c3aed"
                    fill="#7c3aed"
                    fillOpacity={0.35}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* order mix */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Order type mix" subtitle="B2B versus B2C volume" />
          <div className="h-56 p-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mix.byOrderType} layout="vertical" margin={{ left: 12, right: 12 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={50} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="value" name="Orders" radius={[0, 6, 6, 0]} maxBarSize={32}>
                  {mix.byOrderType.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_COLORS[index]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Payment mix" subtitle="Prepaid versus cash on delivery" />
          <div className="h-56 p-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mix.byPaymentType} layout="vertical" margin={{ left: 12, right: 12 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="value" name="Orders" radius={[0, 6, 6, 0]} maxBarSize={32}>
                  {mix.byPaymentType.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_COLORS[index + 2]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </>
  );
}
