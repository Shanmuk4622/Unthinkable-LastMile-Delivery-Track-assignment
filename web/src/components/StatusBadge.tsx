/**
 * Status primitives shared by every screen: the badge, the horizontal progress
 * rail and the availability pill.
 */
import clsx from 'clsx';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Navigation,
  PackageCheck,
  PartyPopper,
  Truck,
  UserCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { AVAILABILITY_STYLES, STATUS_STYLES, statusLabel } from '@/lib/format';
import type { AgentAvailability, OrderStatus } from '@/lib/types';

const ICONS: Record<OrderStatus, LucideIcon> = {
  PENDING: Clock,
  CONFIRMED: CheckCircle2,
  ASSIGNED: UserCheck,
  PICKED_UP: PackageCheck,
  IN_TRANSIT: Truck,
  OUT_FOR_DELIVERY: Navigation,
  DELIVERED: PartyPopper,
  FAILED: AlertTriangle,
  RESCHEDULED: CalendarClock,
  CANCELLED: XCircle,
};

export function StatusIcon({ status, className }: { status: OrderStatus; className?: string }) {
  const Icon = ICONS[status] ?? Clock;
  return <Icon className={className ?? 'h-4 w-4'} />;
}

export function StatusBadge({
  status,
  label,
  size = 'md',
  withIcon = true,
}: {
  status: OrderStatus;
  label?: string;
  size?: 'sm' | 'md';
  withIcon?: boolean;
}) {
  const style = STATUS_STYLES[status];

  return (
    <span
      className={clsx(
        'badge',
        style.badge,
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
      )}
    >
      {withIcon && <StatusIcon status={status} className="h-3.5 w-3.5" />}
      {label ?? statusLabel(status)}
    </span>
  );
}

export function AvailabilityBadge({ availability }: { availability: AgentAvailability }) {
  const style = AVAILABILITY_STYLES[availability];
  return (
    <span className={clsx('badge', style.badge)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  );
}

/**
 * The seven-stop journey rail. Failed and cancelled orders break out of the
 * happy path, so the rail renders them as a terminated route in the status
 * colour rather than pretending the shipment is still progressing.
 */
const HAPPY_PATH: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

const SHORT_LABEL: Partial<Record<OrderStatus, string>> = {
  PENDING: 'Placed',
  CONFIRMED: 'Confirmed',
  ASSIGNED: 'Assigned',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
};

export function ProgressRail({ status, className }: { status: OrderStatus; className?: string }) {
  const derailed = status === 'FAILED' || status === 'CANCELLED' || status === 'RESCHEDULED';

  // A derailed shipment still shows how far it got before it stopped.
  const effective: OrderStatus =
    status === 'FAILED' || status === 'RESCHEDULED'
      ? 'OUT_FOR_DELIVERY'
      : status === 'CANCELLED'
        ? 'CONFIRMED'
        : status;

  const currentIndex = HAPPY_PATH.indexOf(effective);
  const accent = STATUS_STYLES[status];

  return (
    <div className={clsx('w-full', className)}>
      <div className="flex items-start">
        {HAPPY_PATH.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;

          return (
            <div key={step} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                {/* connector in */}
                <div
                  className={clsx(
                    'h-1 flex-1 rounded-full transition-colors',
                    index === 0 ? 'bg-transparent' : done || active ? accent.solid : 'bg-ink-200',
                  )}
                />

                <div className="relative mx-1 shrink-0">
                  {active && !derailed && (
                    <span
                      className={clsx(
                        'absolute inset-0 animate-pulse-ring rounded-full',
                        accent.solid,
                      )}
                    />
                  )}
                  <span
                    className={clsx(
                      'relative grid h-7 w-7 place-items-center rounded-full border-2 transition-all',
                      done
                        ? clsx(accent.solid, 'border-transparent text-white')
                        : active
                          ? clsx(accent.solid, 'border-transparent text-white shadow-lg')
                          : 'border-ink-200 bg-white text-ink-300',
                    )}
                  >
                    <StatusIcon
                      status={active && derailed ? status : step}
                      className="h-3.5 w-3.5"
                    />
                  </span>
                </div>

                {/* connector out */}
                <div
                  className={clsx(
                    'h-1 flex-1 rounded-full transition-colors',
                    index === HAPPY_PATH.length - 1
                      ? 'bg-transparent'
                      : done
                        ? accent.solid
                        : 'bg-ink-200',
                  )}
                />
              </div>

              <p
                className={clsx(
                  'mt-2 hidden text-center text-[10px] font-semibold leading-tight sm:block',
                  active ? accent.text : done ? 'text-ink-600' : 'text-ink-300',
                )}
              >
                {active && derailed ? statusLabel(status) : SHORT_LABEL[step]}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
