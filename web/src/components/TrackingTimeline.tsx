/**
 * The immutable tracking history, rendered as a vertical timeline.
 *
 * Every row shows what changed, who changed it and when — the three things an
 * audit log exists to answer. The actor's role is colour-coded so a customer
 * can tell at a glance which steps were the courier's doing, which were the
 * system's, and which were their own.
 */
import clsx from 'clsx';
import { Bot, Headset, User as UserIcon, Truck } from 'lucide-react';
import { STATUS_STYLES, dateTime, relative, statusLabel } from '@/lib/format';
import { StatusIcon } from './StatusBadge';
import type { ActorRole, OrderStatus } from '@/lib/types';

export interface TimelineEntry {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  title: string;
  notes: string | null;
  actorRole: ActorRole;
  actorName?: string;
  createdAt: string;
}

const ACTOR_STYLE: Record<ActorRole, { label: string; className: string; Icon: typeof UserIcon }> = {
  CUSTOMER: { label: 'Customer', className: 'bg-violet-50 text-violet-600', Icon: UserIcon },
  AGENT: { label: 'Agent', className: 'bg-cyan-50 text-cyan-600', Icon: Truck },
  ADMIN: { label: 'Operations', className: 'bg-amber-50 text-amber-700', Icon: Headset },
  SYSTEM: { label: 'System', className: 'bg-ink-100 text-ink-600', Icon: Bot },
};

export function TrackingTimeline({
  events,
  className,
  compact,
}: {
  events: TimelineEntry[];
  className?: string;
  compact?: boolean;
}) {
  if (events.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-ink-400">
        No tracking events recorded yet.
      </p>
    );
  }

  // Newest first reads better for a live shipment.
  const ordered = [...events].reverse();

  return (
    <ol className={clsx('relative', className)}>
      {ordered.map((event, index) => {
        const style = STATUS_STYLES[event.toStatus];
        const actor = ACTOR_STYLE[event.actorRole] ?? ACTOR_STYLE.SYSTEM;
        const isLatest = index === 0;
        const isLast = index === ordered.length - 1;

        return (
          <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
            {/* rail */}
            {!isLast && (
              <span
                aria-hidden="true"
                className="absolute left-[15px] top-9 h-[calc(100%-1.5rem)] w-0.5 rounded-full bg-ink-150 bg-ink-200"
              />
            )}

            {/* node */}
            <span className="relative shrink-0">
              {isLatest && (
                <span
                  className={clsx('absolute inset-0 animate-pulse-ring rounded-full', style.solid)}
                />
              )}
              <span
                className={clsx(
                  'relative grid h-8 w-8 place-items-center rounded-full text-white shadow-sm',
                  style.solid,
                )}
              >
                <StatusIcon status={event.toStatus} className="h-4 w-4" />
              </span>
            </span>

            {/* body */}
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-bold text-ink-900">{event.title}</p>
                {isLatest && (
                  <span className={clsx('badge px-2 py-0.5 text-[10px]', style.badge)}>Latest</span>
                )}
              </div>

              {event.fromStatus && !compact && (
                <p className="mt-0.5 font-mono text-[11px] text-ink-400">
                  {statusLabel(event.fromStatus)} → {statusLabel(event.toStatus)}
                </p>
              )}

              {event.notes && (
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{event.notes}</p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={clsx(
                    'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold',
                    actor.className,
                  )}
                >
                  <actor.Icon className="h-3 w-3" />
                  {event.actorName ?? actor.label}
                </span>
                <span className="text-ink-400" title={dateTime(event.createdAt)}>
                  {relative(event.createdAt)}
                </span>
                <span className="hidden text-ink-300 sm:inline">·</span>
                <span className="hidden text-ink-400 sm:inline">{dateTime(event.createdAt)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
