/**
 * Every order this agent has ever held, filterable by status.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebounced } from '@/hooks/useDebounced';
import { PageHeader } from '@/components/layout/AppShell';
import { OrderTable } from '@/components/OrderTable';
import { Card, Input, Pagination, Segmented } from '@/components/ui';
import type { OrderStatus } from '@/lib/types';

const TABS = [
  { value: '', label: 'All' },
  { value: 'ASSIGNED', label: 'To pick up' },
  { value: 'IN_TRANSIT', label: 'In transit' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'FAILED', label: 'Failed' },
];

export default function AgentDeliveries() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounced(search, 350);

  const orders = useQuery({
    queryKey: ['orders', 'agent', { status, search: debouncedSearch, page }],
    queryFn: () =>
      api.orders.list({
        status: (status || undefined) as OrderStatus | undefined,
        search: debouncedSearch || undefined,
        page,
        pageSize: 15,
      }),
  });

  return (
    <>
      <PageHeader
        eyebrow="History"
        title="My deliveries"
        subtitle="Everything assigned to you, past and present."
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-4">
          <Segmented
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={TABS}
          />
          <div className="w-full sm:w-64">
            <Input
              placeholder="Search code, city, pincode…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              prefix={<Search className="h-4 w-4" />}
              className="pl-9"
            />
          </div>
        </div>

        <OrderTable
          orders={orders.data?.items ?? []}
          loading={orders.isPending}
          basePath="/agent/orders"
          columns={['code', 'route', 'customer', 'weight', 'status', 'placed']}
          emptyTitle="No deliveries here"
          emptyDescription="Nothing matches this filter yet."
        />

        {orders.data && (
          <Pagination
            page={orders.data.pagination.page}
            totalPages={orders.data.pagination.totalPages}
            total={orders.data.pagination.total}
            onChange={setPage}
          />
        )}
      </Card>
    </>
  );
}
