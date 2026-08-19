/**
 * The customer's own orders, with status filtering driven by the URL so a
 * filtered view can be bookmarked or shared.
 */
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PackagePlus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebounced } from '@/hooks/useDebounced';
import { PageHeader } from '@/components/layout/AppShell';
import { OrderTable } from '@/components/OrderTable';
import { Card, Input, Pagination, Segmented } from '@/components/ui';
import type { OrderStatus } from '@/lib/types';

const TABS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'CONFIRMED', label: 'Awaiting pickup' },
  { value: 'IN_TRANSIT', label: 'In transit' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'FAILED', label: 'Failed' },
];

export default function CustomerOrders() {
  const [params, setParams] = useSearchParams();

  const status = params.get('status') ?? '';
  const search = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 1);

  const debouncedSearch = useDebounced(search, 350);

  const orders = useQuery({
    queryKey: ['orders', { status, search: debouncedSearch, page }],
    queryFn: () =>
      api.orders.list({
        status: (status || undefined) as OrderStatus | undefined,
        search: debouncedSearch || undefined,
        page,
        pageSize: 15,
      }),
  });

  const update = (next: Record<string, string>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    // Any filter change resets pagination — page 7 of a new filter is nonsense.
    if (!('page' in next)) merged.delete('page');
    setParams(merged, { replace: true });
  };

  return (
    <>
      <PageHeader
        eyebrow="Shipments"
        title="My orders"
        subtitle="Every parcel you have shipped with SwiftRoute."
        actions={
          <Link to="/app/new" className="btn-primary">
            <PackagePlus className="h-4 w-4" />
            Book a pickup
          </Link>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-4">
          <Segmented
            value={status}
            onChange={(value) => update({ status: value })}
            options={TABS}
          />

          <div className="w-full sm:w-64">
            <Input
              placeholder="Search code, city, pincode…"
              value={search}
              onChange={(event) => update({ q: event.target.value })}
              prefix={<Search className="h-4 w-4" />}
              className="pl-9"
            />
          </div>
        </div>

        <OrderTable
          orders={orders.data?.items ?? []}
          loading={orders.isPending}
          basePath="/app/orders"
          columns={['code', 'route', 'agent', 'weight', 'charge', 'status', 'placed']}
          emptyTitle={status || search ? 'No orders match those filters' : 'No shipments yet'}
          emptyDescription={
            status || search
              ? 'Try clearing the search or picking a different status.'
              : 'Book your first pickup — you will see the exact charge before you confirm.'
          }
          emptyAction={
            !status && !search ? (
              <Link to="/app/new" className="btn-primary">
                <PackagePlus className="h-4 w-4" />
                Book a pickup
              </Link>
            ) : undefined
          }
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
