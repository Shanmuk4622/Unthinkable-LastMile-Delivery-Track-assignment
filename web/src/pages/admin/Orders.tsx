/**
 * Every order in the network, with the filters the brief calls for:
 * status, zone and agent — plus free-text search and a date window.
 * Filter state lives in the URL so an ops lead can bookmark "failed in BLR-S".
 */
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FilterX, PackagePlus, Search, SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebounced } from '@/hooks/useDebounced';
import { PageHeader } from '@/components/layout/AppShell';
import { OrderTable } from '@/components/OrderTable';
import { Button, Card, Input, Pagination, Select } from '@/components/ui';
import type { OrderStatus, OrderType, PaymentType } from '@/lib/types';

const STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'RESCHEDULED',
  'CANCELLED',
];

export default function AdminOrders() {
  const [params, setParams] = useSearchParams();

  const get = (key: string) => params.get(key) ?? '';
  const page = Number(params.get('page') ?? 1);
  const debouncedSearch = useDebounced(get('q'), 350);

  const zones = useQuery({ queryKey: ['zones'], queryFn: api.zones.list });
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api.agents.list() });

  const orders = useQuery({
    queryKey: [
      'orders',
      'admin',
      {
        status: get('status'),
        zoneId: get('zoneId'),
        agentId: get('agentId'),
        orderType: get('orderType'),
        paymentType: get('paymentType'),
        sort: get('sort'),
        search: debouncedSearch,
        page,
      },
    ],
    queryFn: () =>
      api.orders.list({
        status: (get('status') || undefined) as OrderStatus | undefined,
        zoneId: get('zoneId') || undefined,
        agentId: get('agentId') || undefined,
        orderType: (get('orderType') || undefined) as OrderType | undefined,
        paymentType: (get('paymentType') || undefined) as PaymentType | undefined,
        sort: (get('sort') || 'newest') as 'newest' | 'oldest' | 'value',
        search: debouncedSearch || undefined,
        page,
        pageSize: 20,
      }),
  });

  const update = (next: Record<string, string>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    if (!('page' in next)) merged.delete('page');
    setParams(merged, { replace: true });
  };

  const activeFilters = ['status', 'zoneId', 'agentId', 'orderType', 'paymentType', 'q'].filter(
    (key) => get(key),
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="All orders"
        subtitle="Filter by status, zone or agent — and override anything that needs a human."
        actions={
          <Link to="/admin/new" className="btn-primary">
            <PackagePlus className="h-4 w-4" />
            Create order
          </Link>
        }
      />

      <Card className="mb-5">
        <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
          <p className="flex items-center gap-2 text-sm font-bold text-ink-800">
            <SlidersHorizontal className="h-4 w-4 text-brand-500" />
            Filters
            {activeFilters > 0 && (
              <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-[11px] text-brand-700">
                {activeFilters} active
              </span>
            )}
          </p>
          {activeFilters > 0 && (
            <Button
              variant="ghost"
              size="sm"
              icon={<FilterX className="h-3.5 w-3.5" />}
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
            >
              Clear all
            </Button>
          )}
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Input
            label="Search"
            placeholder="Code, customer, city…"
            value={get('q')}
            onChange={(event) => update({ q: event.target.value })}
            prefix={<Search className="h-4 w-4" />}
            className="pl-9"
            wrapClassName="sm:col-span-2 xl:col-span-2"
          />

          <Select
            label="Status"
            value={get('status')}
            onChange={(event) => update({ status: event.target.value })}
            placeholder="Any status"
            options={STATUSES.map((status) => ({
              value: status,
              label: status.replace(/_/g, ' '),
            }))}
          />

          <Select
            label="Zone"
            value={get('zoneId')}
            onChange={(event) => update({ zoneId: event.target.value })}
            placeholder="Any zone"
            options={(zones.data ?? []).map((zone) => ({
              value: zone.id,
              label: `${zone.code} · ${zone.name}`,
            }))}
          />

          <Select
            label="Agent"
            value={get('agentId')}
            onChange={(event) => update({ agentId: event.target.value })}
            placeholder="Any agent"
            options={(agents.data ?? []).map((agent) => ({
              value: agent.id,
              label: agent.user.fullName,
            }))}
          />

          <Select
            label="Sort"
            value={get('sort') || 'newest'}
            onChange={(event) => update({ sort: event.target.value })}
            options={[
              { value: 'newest', label: 'Newest first' },
              { value: 'oldest', label: 'Oldest first' },
              { value: 'value', label: 'Highest value' },
            ]}
          />
        </div>

        <div className="grid gap-4 border-t border-ink-100 p-5 sm:grid-cols-2 lg:w-1/2">
          <Select
            label="Order type"
            value={get('orderType')}
            onChange={(event) => update({ orderType: event.target.value })}
            placeholder="B2B and B2C"
            options={[
              { value: 'B2B', label: 'B2B' },
              { value: 'B2C', label: 'B2C' },
            ]}
          />
          <Select
            label="Payment"
            value={get('paymentType')}
            onChange={(event) => update({ paymentType: event.target.value })}
            placeholder="Prepaid and COD"
            options={[
              { value: 'PREPAID', label: 'Prepaid' },
              { value: 'COD', label: 'Cash on delivery' },
            ]}
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <OrderTable
          orders={orders.data?.items ?? []}
          loading={orders.isPending}
          basePath="/admin/orders"
          emptyTitle="No orders match those filters"
          emptyDescription="Try widening the search or clearing a filter."
        />

        {orders.data && (
          <Pagination
            page={orders.data.pagination.page}
            totalPages={orders.data.pagination.totalPages}
            total={orders.data.pagination.total}
            onChange={(next) => update({ page: String(next) })}
          />
        )}
      </Card>
    </>
  );
}
