/**
 * The orders list, shared by the customer, agent and admin screens.
 *
 * `columns` lets each caller drop the columns that are noise for its audience
 * (a customer does not need an "agent" column when every order is theirs), but
 * the row rendering, empty state and responsive card fallback stay in one place.
 */
import { Link } from 'react-router-dom';
import { ArrowUpRight, PackageOpen } from 'lucide-react';
import clsx from 'clsx';
import { dateOnly, kg, money, relative } from '@/lib/format';
import { StatusBadge } from './StatusBadge';
import { EmptyState, SkeletonRows } from './ui';
import type { Order } from '@/lib/types';

export type OrderColumn = 'code' | 'route' | 'customer' | 'agent' | 'weight' | 'charge' | 'status' | 'placed';

const ALL_COLUMNS: OrderColumn[] = [
  'code',
  'route',
  'customer',
  'agent',
  'weight',
  'charge',
  'status',
  'placed',
];

const HEADINGS: Record<OrderColumn, string> = {
  code: 'Order',
  route: 'Route',
  customer: 'Customer',
  agent: 'Agent',
  weight: 'Billed',
  charge: 'Charge',
  status: 'Status',
  placed: 'Placed',
};

export function OrderTable({
  orders,
  loading,
  basePath,
  columns = ALL_COLUMNS,
  emptyTitle = 'No orders yet',
  emptyDescription,
  emptyAction,
}: {
  orders: Order[];
  loading?: boolean;
  /** Where a row links to, e.g. "/admin/orders". */
  basePath: string;
  columns?: OrderColumn[];
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}) {
  if (loading) return <SkeletonRows rows={6} />;

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<PackageOpen className="h-8 w-8" />}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  const show = (column: OrderColumn) => columns.includes(column);

  return (
    <>
      {/* ---- desktop table ---- */}
      <div className="hidden overflow-x-auto md:block">
        <table className="table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className={clsx(column === 'charge' && 'text-right')}
                >
                  {HEADINGS[column]}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="cursor-pointer">
                {show('code') && (
                  <td>
                    <Link to={`${basePath}/${order.id}`} className="block">
                      <span className="font-mono text-sm font-bold text-brand-700">
                        {order.code}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-ink-400">
                        {order.orderType} · {order.paymentType}
                      </span>
                    </Link>
                  </td>
                )}

                {show('route') && (
                  <td>
                    <Link to={`${basePath}/${order.id}`} className="block">
                      <span className="block text-sm font-semibold text-ink-800">
                        {order.pickupAddress.city} → {order.dropAddress.city}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] text-ink-400">
                        {order.pickupZone?.code ?? '—'} → {order.dropZone?.code ?? '—'}
                      </span>
                    </Link>
                  </td>
                )}

                {show('customer') && (
                  <td>
                    <span className="block truncate text-sm font-semibold text-ink-800">
                      {order.customer.fullName}
                    </span>
                    {order.customer.companyName && (
                      <span className="mt-0.5 block truncate text-[11px] text-ink-400">
                        {order.customer.companyName}
                      </span>
                    )}
                  </td>
                )}

                {show('agent') && (
                  <td>
                    {order.agent ? (
                      <>
                        <span className="block truncate text-sm font-medium text-ink-700">
                          {order.agent.user.fullName}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-ink-400">
                          {order.agent.zone?.code ?? order.agent.vehicleType.toLowerCase()}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs font-medium text-amber-600">Unassigned</span>
                    )}
                  </td>
                )}

                {show('weight') && (
                  <td className="font-mono text-xs">{kg(order.chargeableWeightKg)}</td>
                )}

                {show('charge') && (
                  <td className="text-right font-mono text-sm font-bold text-ink-900">
                    {money(order.totalCharge, order.currency)}
                  </td>
                )}

                {show('status') && (
                  <td>
                    <StatusBadge status={order.status} size="sm" />
                  </td>
                )}

                {show('placed') && (
                  <td className="whitespace-nowrap text-xs text-ink-500" title={order.createdAt}>
                    {relative(order.createdAt)}
                  </td>
                )}

                <td>
                  <Link
                    to={`${basePath}/${order.id}`}
                    className="grid h-7 w-7 place-items-center rounded-lg text-ink-300 transition-colors hover:bg-brand-50 hover:text-brand-600"
                    aria-label={`Open ${order.code}`}
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---- mobile cards ---- */}
      <ul className="divide-y divide-ink-100 md:hidden">
        {orders.map((order) => (
          <li key={order.id}>
            <Link to={`${basePath}/${order.id}`} className="block px-4 py-4 active:bg-brand-50/50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold text-brand-700">{order.code}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-ink-800">
                    {order.pickupAddress.city} → {order.dropAddress.city}
                  </p>
                </div>
                <StatusBadge status={order.status} size="sm" withIcon={false} />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
                <span className="font-mono font-bold text-ink-900">
                  {money(order.totalCharge, order.currency)}
                </span>
                <span>{kg(order.chargeableWeightKg)}</span>
                <span>
                  {order.orderType} · {order.paymentType}
                </span>
                {order.agent && <span>{order.agent.user.fullName}</span>}
                <span className="ml-auto">{dateOnly(order.createdAt)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
