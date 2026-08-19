/**
 * Order detail — one screen, three audiences.
 *
 * Rather than maintaining three near-identical pages, the layout is shared and
 * the *action rail* changes with the caller's role:
 *
 *   CUSTOMER  reschedule after a failure, cancel while it is still early
 *   AGENT     walk the delivery ladder, report a failure
 *   ADMIN     assign / auto-assign, override any status, inspect the dispatcher
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bell,
  Building2,
  CalendarClock,
  Copy,
  Gauge,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Ruler,
  ShieldAlert,
  Sparkles,
  Truck,
  UserCheck,
  Wallet,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { dateOnly, dateTime, kg, money, relative, todayInput } from '@/lib/format';
import { PageHeader } from '@/components/layout/AppShell';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { ProgressRail, StatusBadge, StatusIcon } from '@/components/StatusBadge';
import { TrackingTimeline } from '@/components/TrackingTimeline';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Textarea,
} from '@/components/ui';
import { AssignmentPanel } from '@/components/AssignmentPanel';
import type { OrderStatus } from '@/lib/types';

const FAILURE_REASONS = [
  'Customer not available',
  'Address not found / incorrect',
  'Customer refused delivery',
  'COD amount not ready',
  'Premises closed',
  'Unreachable by phone',
  'Weather / road blocked',
];

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [failureOpen, setFailureOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);

  const [failureReason, setFailureReason] = useState(FAILURE_REASONS[0]);
  const [failureNotes, setFailureNotes] = useState('');
  const [newDate, setNewDate] = useState(todayInput(2));
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [overrideStatus, setOverrideStatus] = useState<OrderStatus>('CONFIRMED');

  const order = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.orders.get(id!),
    enabled: Boolean(id),
    refetchInterval: 45_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['order', id] });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const changeStatus = useMutation({
    mutationFn: (payload: {
      status: OrderStatus;
      notes?: string;
      failureReason?: string;
      override?: boolean;
    }) => api.orders.changeStatus(id!, payload),
    onSuccess: (updated) => {
      toast.success(`Order moved to ${updated.status.replace(/_/g, ' ').toLowerCase()}.`);
      setFailureOpen(false);
      setOverrideOpen(false);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Update failed.'),
  });

  const reschedule = useMutation({
    mutationFn: () => api.orders.reschedule(id!, newDate, rescheduleReason || undefined),
    onSuccess: (updated) => {
      toast.success(
        updated.agent
          ? `Rescheduled — ${updated.agent.user.fullName} will handle the next attempt.`
          : 'Rescheduled. An agent will be assigned shortly.',
      );
      setRescheduleOpen(false);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Reschedule failed.'),
  });

  const cancel = useMutation({
    mutationFn: () => api.orders.cancel(id!, cancelReason || undefined),
    onSuccess: () => {
      toast.success('Order cancelled.');
      setCancelOpen(false);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Cancellation failed.'),
  });

  if (order.isPending) return <LoadingBlock label="Loading order…" />;
  if (order.isError) return <ErrorState error={order.error} onRetry={() => order.refetch()} />;

  const data = order.data;
  const role = user?.role;
  const isAdmin = role === 'ADMIN';
  const isAgent = role === 'AGENT';
  const isCustomer = role === 'CUSTOMER';

  const backTo = isAdmin ? '/admin/orders' : isAgent ? '/agent/deliveries' : '/app/orders';

  // Which ladder rungs can this agent press right now?
  const agentNext = (data.allowedNextStatuses ?? []).filter((status) =>
    ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(status),
  );

  const canCancel =
    (isCustomer && ['PENDING', 'CONFIRMED'].includes(data.status)) ||
    (isAdmin && !['DELIVERED', 'CANCELLED'].includes(data.status));

  return (
    <>
      <Link
        to={backTo}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 transition-colors hover:text-brand-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to orders
      </Link>

      <PageHeader
        eyebrow={`${data.orderType} · ${data.paymentType}`}
        title={data.code}
        subtitle={`Booked ${relative(data.createdAt)} by ${data.createdBy.fullName}${
          data.createdBy.id !== data.customerId ? ' (on behalf of the customer)' : ''
        }`}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={<Copy className="h-3.5 w-3.5" />}
              onClick={() => {
                void navigator.clipboard.writeText(data.code);
                toast.success('Tracking number copied');
              }}
            >
              Copy code
            </Button>
            <Link to={`/track/${data.code}`} className="btn-secondary btn-sm">
              Customer view
            </Link>
          </>
        }
      />

      {/* ---- status hero ---- */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100 px-6 py-5">
          <div className="flex items-center gap-4">
            <span
              className={`grid h-14 w-14 place-items-center rounded-2xl text-white shadow-sm ${
                { DELIVERED: 'bg-emerald-500', FAILED: 'bg-rose-500', CANCELLED: 'bg-zinc-400' }[
                  data.status as string
                ] ?? 'bg-route'
              }`}
            >
              <StatusIcon status={data.status} className="h-7 w-7" />
            </span>
            <div>
              <StatusBadge status={data.status} />
              <p className="mt-1.5 text-sm text-ink-500">
                {data.status === 'DELIVERED'
                  ? `Delivered ${dateTime(data.deliveredAt)}`
                  : data.status === 'FAILED'
                    ? `Attempt ${data.attemptCount} failed — ${data.failureReason}`
                    : data.scheduledDate
                      ? `Expected by ${dateOnly(data.scheduledDate)}`
                      : 'Awaiting scheduling'}
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Total charge</p>
            <p className="font-mono text-2xl font-extrabold text-ink-900">
              {money(data.totalCharge, data.currency)}
            </p>
            {data.paymentType === 'COD' && (
              <p className="text-xs font-semibold text-amber-600">
                Collect {money(data.declaredValue, data.currency)} on delivery
              </p>
            )}
          </div>
        </div>

        <div className="px-6 py-7">
          <ProgressRail status={data.status} />
        </div>
      </Card>

      {/* ---- alerts ---- */}
      {data.status === 'FAILED' && (
        <Alert
          tone="danger"
          title="Delivery attempt failed"
          icon={<ShieldAlert className="h-4 w-4" />}
        >
          <p>
            {data.failureReason}. The agent has been released and the parcel is held safely.
            {(isCustomer || isAdmin) && ' Pick a new date to re-dispatch it to a different agent.'}
          </p>
          {(isCustomer || isAdmin) && (
            <Button
              size="sm"
              className="mt-3"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => setRescheduleOpen(true)}
            >
              Reschedule delivery
            </Button>
          )}
        </Alert>
      )}

      {data.status === 'RESCHEDULED' && !data.agent && (
        <Alert tone="warning" title="Waiting for a new agent" icon={<CalendarClock className="h-4 w-4" />}>
          A new delivery date is locked in for {dateOnly(data.scheduledDate)}. The dispatcher could
          not find a free agent yet — operations will assign one manually.
        </Alert>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ================= left ================= */}
        <div className="space-y-6">
          {/* route */}
          <Card>
            <CardHeader
              title="Route"
              subtitle="Pickup and delivery addresses with their detected zones"
              icon={<MapPin className="h-4.5 w-4.5" />}
            />
            <div className="grid gap-px bg-ink-100 sm:grid-cols-2">
              <AddressBlock
                kind="Pickup"
                address={data.pickupAddress}
                zone={data.pickupZone}
                tone="violet"
              />
              <AddressBlock
                kind="Delivery"
                address={data.dropAddress}
                zone={data.dropZone}
                tone="sky"
              />
            </div>
            {data.notes && (
              <div className="border-t border-ink-100 px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-400">
                  Delivery instructions
                </p>
                <p className="mt-1.5 text-sm text-ink-700">{data.notes}</p>
              </div>
            )}
          </Card>

          {/* package */}
          <Card>
            <CardHeader
              title="Package"
              subtitle="Dimensions and the weight we billed on"
              icon={<Package className="h-4.5 w-4.5" />}
            />
            <div className="grid grid-cols-2 gap-px bg-ink-100 sm:grid-cols-4">
              <Metric
                icon={<Ruler className="h-4 w-4" />}
                label="Dimensions"
                value={`${data.lengthCm}×${data.breadthCm}×${data.heightCm}`}
                sub="cm"
              />
              <Metric
                icon={<Package className="h-4 w-4" />}
                label="Actual"
                value={kg(data.actualWeightKg)}
              />
              <Metric
                icon={<Package className="h-4 w-4" />}
                label="Volumetric"
                value={kg(data.volumetricWeightKg)}
              />
              <Metric
                icon={<Sparkles className="h-4 w-4" />}
                label="Chargeable"
                value={kg(data.chargeableWeightKg)}
                highlight
              />
            </div>
          </Card>

          {/* pricing */}
          {data.pricingBreakdown && (
            <Card>
              <CardHeader
                title="How this price was calculated"
                subtitle={
                  data.rateCard
                    ? `Priced with "${data.rateCard.name}" and frozen at booking time`
                    : undefined
                }
                icon={<Wallet className="h-4.5 w-4.5" />}
              />
              <div className="p-5">
                <PriceBreakdown quote={data.pricingBreakdown} showZones={false} />
              </div>
            </Card>
          )}

          {/* dispatcher (admin) */}
          {isAdmin && <AssignmentPanel orderId={data.id} order={data} onChanged={refresh} />}

          {/* timeline */}
          <Card>
            <CardHeader
              title="Tracking history"
              subtitle="Append-only — every change records who, what and when"
              icon={<Bell className="h-4.5 w-4.5" />}
              action={
                <Badge className="bg-ink-100 text-ink-600">
                  {data.trackingEvents?.length ?? 0} events
                </Badge>
              }
            />
            <div className="p-6">
              <TrackingTimeline events={data.trackingEvents ?? []} />
            </div>
          </Card>
        </div>

        {/* ================= right rail ================= */}
        <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          {/* agent ladder */}
          {isAgent && agentNext.length > 0 && (
            <Card>
              <CardHeader
                title="Update this delivery"
                subtitle="Your next possible steps"
                icon={<Truck className="h-4.5 w-4.5" />}
              />
              <div className="space-y-2 p-5">
                {agentNext.map((status) => (
                  <Button
                    key={status}
                    full
                    variant={status === 'DELIVERED' ? 'success' : 'primary'}
                    loading={changeStatus.isPending}
                    onClick={() => changeStatus.mutate({ status })}
                    icon={<StatusIcon status={status} className="h-4 w-4" />}
                  >
                    Mark as {status.replace(/_/g, ' ').toLowerCase()}
                  </Button>
                ))}

                {(data.allowedNextStatuses ?? []).includes('FAILED') && (
                  <Button
                    full
                    variant="danger"
                    icon={<XCircle className="h-4 w-4" />}
                    onClick={() => setFailureOpen(true)}
                  >
                    Report a failed attempt
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* assigned agent */}
          <Card>
            <CardHeader
              title="Delivery agent"
              icon={<UserCheck className="h-4.5 w-4.5" />}
            />
            <div className="p-5">
              {data.agent ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-base font-bold text-ink-900">{data.agent.user.fullName}</p>
                    <p className="text-sm text-ink-500">
                      {data.agent.vehicleType.toLowerCase()}
                      {data.agent.vehicleNumber ? ` · ${data.agent.vehicleNumber}` : ''}
                    </p>
                  </div>
                  {data.agent.zone && (
                    <Badge className="bg-brand-100 text-brand-700">
                      {data.agent.zone.code} · {data.agent.zone.name}
                    </Badge>
                  )}
                  {data.agent.user.phone && (isAdmin || isCustomer) && (
                    <a
                      href={`tel:${data.agent.user.phone}`}
                      className="btn-secondary btn-sm w-full"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {data.agent.user.phone}
                    </a>
                  )}
                </div>
              ) : (
                <p className="py-2 text-sm text-ink-400">
                  No agent assigned yet.
                  {isAdmin && ' Use the dispatch panel to assign one.'}
                </p>
              )}
            </div>
          </Card>

          {/* customer */}
          {(isAdmin || isAgent) && (
            <Card>
              <CardHeader title="Customer" icon={<Building2 className="h-4.5 w-4.5" />} />
              <div className="space-y-2 p-5 text-sm">
                <p className="font-bold text-ink-900">{data.customer.fullName}</p>
                {data.customer.companyName && (
                  <p className="text-ink-500">{data.customer.companyName}</p>
                )}
                {isAdmin && <p className="text-ink-500">{data.customer.email}</p>}
                {data.customer.phone && (
                  <a href={`tel:${data.customer.phone}`} className="link block">
                    {data.customer.phone}
                  </a>
                )}
              </div>
            </Card>
          )}

          {/* actions */}
          <Card>
            <CardHeader title="Actions" icon={<Gauge className="h-4.5 w-4.5" />} />
            <div className="space-y-2 p-5">
              {(isCustomer || isAdmin) && data.status === 'FAILED' && (
                <Button
                  full
                  icon={<RefreshCw className="h-4 w-4" />}
                  onClick={() => setRescheduleOpen(true)}
                >
                  Reschedule delivery
                </Button>
              )}

              {isAdmin && (
                <Button
                  full
                  variant="secondary"
                  icon={<ShieldAlert className="h-4 w-4" />}
                  onClick={() => setOverrideOpen(true)}
                >
                  Override status
                </Button>
              )}

              {canCancel && (
                <Button
                  full
                  variant="danger"
                  icon={<XCircle className="h-4 w-4" />}
                  onClick={() => setCancelOpen(true)}
                >
                  Cancel order
                </Button>
              )}

              <Button
                full
                variant="ghost"
                icon={<RefreshCw className="h-4 w-4" />}
                onClick={() => order.refetch()}
              >
                Refresh
              </Button>
            </div>
          </Card>

          {/* meta */}
          <Card className="p-5">
            <dl className="space-y-2.5 text-xs">
              <Row label="Booked" value={dateTime(data.createdAt)} />
              {data.pickedUpAt && <Row label="Picked up" value={dateTime(data.pickedUpAt)} />}
              {data.deliveredAt && <Row label="Delivered" value={dateTime(data.deliveredAt)} />}
              <Row label="Attempts" value={String(data.attemptCount + 1)} />
              {data.rateCard && <Row label="Rate card" value={data.rateCard.name} />}
            </dl>
          </Card>
        </div>
      </div>

      {/* ================= modals ================= */}
      <Modal
        open={failureOpen}
        onClose={() => setFailureOpen(false)}
        title="Report a failed attempt"
        subtitle="The customer is notified immediately and can pick a new date."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFailureOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={changeStatus.isPending}
              onClick={() =>
                changeStatus.mutate({
                  status: 'FAILED',
                  failureReason,
                  notes: failureNotes || undefined,
                })
              }
            >
              Mark as failed
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="What went wrong?"
            required
            value={failureReason}
            onChange={(event) => setFailureReason(event.target.value)}
            options={FAILURE_REASONS.map((reason) => ({ value: reason, label: reason }))}
          />
          <Textarea
            label="Additional notes"
            value={failureNotes}
            onChange={(event) => setFailureNotes(event.target.value)}
            placeholder="Anything the next agent should know…"
          />
          <Alert tone="warning">
            This releases you from the order and increments the attempt counter. The record is
            permanent — tracking history cannot be edited.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        title="Reschedule delivery"
        subtitle="We will assign a different agent for the next attempt."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRescheduleOpen(false)}>
              Cancel
            </Button>
            <Button loading={reschedule.isPending} onClick={() => reschedule.mutate()}>
              Confirm new date
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="New delivery date"
            type="date"
            required
            min={todayInput()}
            value={newDate}
            onChange={(event) => setNewDate(event.target.value)}
          />
          <Textarea
            label="Anything we should do differently?"
            value={rescheduleReason}
            onChange={(event) => setRescheduleReason(event.target.value)}
            placeholder="e.g. please try after 6pm, or leave with the security desk"
          />
          <Alert tone="info">
            The agent whose attempt failed is excluded from the next dispatch round, so your parcel
            gets a fresh pair of hands.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this order"
        subtitle="This cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancel order
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason"
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          placeholder="Why is this order being cancelled?"
        />
      </Modal>

      <Modal
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        title="Override order status"
        subtitle="Operations-only. The override is recorded on the tracking event."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOverrideOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={changeStatus.isPending}
              onClick={() =>
                changeStatus.mutate({
                  status: overrideStatus,
                  override: true,
                  notes: 'Manual override by operations',
                })
              }
            >
              Apply override
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Set status to"
            value={overrideStatus}
            onChange={(event) => setOverrideStatus(event.target.value as OrderStatus)}
            options={(
              [
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
              ] as OrderStatus[]
            )
              .filter((status) => status !== data.status)
              .map((status) => ({ value: status, label: status.replace(/_/g, ' ') }))}
          />
          <Alert tone="warning" title="This bypasses the transition rules">
            Normal flow only allows {(data.allowedNextStatuses ?? []).join(', ') || 'no further steps'}.
            An override is logged as such and stays in the history forever.
          </Alert>
        </div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------

function AddressBlock({
  kind,
  address,
  zone,
  tone,
}: {
  kind: string;
  address: {
    contactName: string;
    contactPhone: string;
    line1: string;
    line2: string | null;
    landmark: string | null;
    city: string;
    state: string | null;
    pincode: string;
  };
  zone: { code: string; name: string } | null;
  tone: 'violet' | 'sky';
}) {
  const tones = {
    violet: 'bg-violet-100 text-violet-700',
    sky: 'bg-sky-100 text-sky-700',
  } as const;

  return (
    <div className="bg-white px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className={`badge ${tones[tone]}`}>{kind}</span>
        {zone && (
          <span className="font-mono text-[11px] font-bold text-ink-400">{zone.code}</span>
        )}
      </div>
      <p className="text-sm font-bold text-ink-900">{address.contactName}</p>
      <p className="text-xs text-ink-500">{address.contactPhone}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-700">
        {address.line1}
        {address.line2 && <>, {address.line2}</>}
        {address.landmark && <span className="block text-ink-500">Near {address.landmark}</span>}
      </p>
      <p className="mt-1 text-sm font-medium text-ink-600">
        {address.city}
        {address.state ? `, ${address.state}` : ''} — {address.pincode}
      </p>
      {zone && <p className="mt-1.5 text-xs text-ink-400">{zone.name}</p>}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`px-5 py-4 ${highlight ? 'bg-brand-50' : 'bg-white'}`}>
      <p
        className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${
          highlight ? 'text-brand-600' : 'text-ink-400'
        }`}
      >
        {icon}
        {label}
      </p>
      <p
        className={`mt-1.5 font-mono text-sm font-extrabold ${
          highlight ? 'text-brand-700' : 'text-ink-900'
        }`}
      >
        {value}
        {sub && <span className="ml-1 text-xs font-medium text-ink-400">{sub}</span>}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="font-semibold text-ink-400">{label}</dt>
      <dd className="truncate text-right font-medium text-ink-700">{value}</dd>
    </div>
  );
}
