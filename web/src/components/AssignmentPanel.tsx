/**
 * The dispatcher, made visible.
 *
 * An auto-assigner that is a black box is impossible to trust and impossible to
 * debug. This panel renders exactly what the engine saw: every eligible agent
 * with their four normalised signals and final score, every rejected agent with
 * the reason, and the history of who has held this order before.
 *
 * The admin can accept the engine's pick with one click, or override it by
 * choosing any other eligible agent from the same table.
 */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Ban,
  Crown,
  Gauge,
  History,
  MapPin,
  Radar,
  Sparkles,
  Timer,
  Truck,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { dateTime, relative } from '@/lib/format';
import { Alert, Badge, Button, Card, CardHeader, Spinner } from '@/components/ui';
import { AvailabilityBadge } from './StatusBadge';
import type { Order, ScoredCandidate } from '@/lib/types';

export function AssignmentPanel({
  orderId,
  order,
  onChanged,
}: {
  orderId: string;
  order: Order;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const assignable = ['CONFIRMED', 'ASSIGNED', 'RESCHEDULED', 'FAILED'].includes(order.status);

  const preview = useQuery({
    queryKey: ['assignment-preview', orderId],
    queryFn: () => api.orders.assignmentPreview(orderId),
    enabled: assignable,
  });

  const history = useQuery({
    queryKey: ['assignments', orderId],
    queryFn: () => api.orders.assignments(orderId),
  });

  const autoAssign = useMutation({
    mutationFn: () => api.orders.autoAssign(orderId),
    onSuccess: (updated) => {
      toast.success(`Auto-assigned to ${updated.agent?.user.fullName ?? 'an agent'}.`);
      onChanged();
      void preview.refetch();
      void history.refetch();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Dispatch failed.'),
  });

  const assignManually = useMutation({
    mutationFn: (agentId: string) =>
      api.orders.assign(orderId, agentId, 'Chosen manually by operations'),
    onSuccess: (updated) => {
      toast.success(`Assigned to ${updated.agent?.user.fullName ?? 'the agent'}.`);
      onChanged();
      void preview.refetch();
      void history.refetch();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Assignment failed.'),
  });

  const decision = preview.data;
  const ranked = decision?.ranked ?? [];
  const shown = expanded ? ranked : ranked.slice(0, 4);

  return (
    <Card>
      <CardHeader
        title="Dispatch engine"
        subtitle="Every eligible agent, scored on four signals"
        icon={<Radar className="h-4.5 w-4.5" />}
        action={
          assignable && (
            <Button
              size="sm"
              icon={<Zap className="h-3.5 w-3.5" />}
              loading={autoAssign.isPending}
              onClick={() => autoAssign.mutate()}
              disabled={!decision?.chosen}
            >
              Auto-assign
            </Button>
          )
        }
      />

      <div className="p-5">
        {!assignable && (
          <p className="py-3 text-sm text-ink-400">
            Dispatch is only available for confirmed, assigned, failed or rescheduled orders. This
            order is {order.status.replace(/_/g, ' ').toLowerCase()}.
          </p>
        )}

        {assignable && preview.isPending && (
          <div className="flex items-center gap-3 py-6">
            <Spinner />
            <p className="text-sm text-ink-500">Scoring agents…</p>
          </div>
        )}

        {decision && (
          <div className="space-y-4">
            {/* verdict */}
            <div
              className={clsx(
                'rounded-xl border p-4',
                decision.chosen
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-amber-200 bg-amber-50',
              )}
            >
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-500">
                <Sparkles className="h-3.5 w-3.5" />
                Engine verdict
              </p>
              <p className="mt-1.5 text-sm font-medium leading-relaxed text-ink-800">
                {decision.reason}
              </p>
              {decision.widenedSearch && (
                <p className="mt-2 text-xs font-semibold text-amber-700">
                  The service radius was relaxed to find anyone at all — worth checking coverage in
                  this zone.
                </p>
              )}
            </div>

            {/* ranked table */}
            {ranked.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">
                  Ranked shortlist
                </p>
                <div className="space-y-2">
                  {shown.map((candidate, index) => (
                    <CandidateRow
                      key={candidate.agentId}
                      candidate={candidate}
                      rank={index + 1}
                      isCurrent={order.agentId === candidate.agentId}
                      onAssign={() => assignManually.mutate(candidate.agentId)}
                      busy={assignManually.isPending}
                    />
                  ))}
                </div>

                {ranked.length > 4 && (
                  <button
                    onClick={() => setExpanded((open) => !open)}
                    className="mt-2 w-full rounded-lg py-2 text-xs font-bold text-brand-600 transition-colors hover:bg-brand-50"
                  >
                    {expanded ? 'Show fewer' : `Show all ${ranked.length} eligible agents`}
                  </button>
                )}
              </div>
            )}

            {/* rejections */}
            {decision.rejected.length > 0 && (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-400 transition-colors hover:text-ink-600">
                  <Ban className="h-3.5 w-3.5" />
                  {decision.rejected.length} agent
                  {decision.rejected.length === 1 ? '' : 's'} filtered out
                </summary>
                <ul className="mt-2.5 space-y-1.5">
                  {decision.rejected.map((candidate) => (
                    <li
                      key={candidate.agentId}
                      className="flex items-center justify-between gap-3 rounded-lg bg-ink-50 px-3 py-2 text-xs"
                    >
                      <span className="font-semibold text-ink-600">{candidate.agentName}</span>
                      <span className="text-right text-ink-400">{candidate.rejectedBecause}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {ranked.length === 0 && decision.rejected.length === 0 && (
              <Alert tone="warning" title="No delivery agents exist yet">
                Create agent accounts under Users, then set them to available.
              </Alert>
            )}
          </div>
        )}

        {/* assignment history */}
        {(history.data?.length ?? 0) > 0 && (
          <div className="mt-6 border-t border-ink-100 pt-5">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-400">
              <History className="h-3.5 w-3.5" />
              Assignment history
            </p>
            <ol className="space-y-2.5">
              {history.data!.map((record) => (
                <li
                  key={record.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-200 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-900">{record.agent.user.fullName}</p>
                    <p className="text-[11px] text-ink-500" title={dateTime(record.createdAt)}>
                      {relative(record.createdAt)}
                      {record.assignedBy ? ` · by ${record.assignedBy.fullName}` : ''}
                      {record.unassignedAt ? ' · released' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {record.distanceKm !== null && (
                      <Badge className="bg-ink-100 text-ink-600">{record.distanceKm} km</Badge>
                    )}
                    {record.score !== null && (
                      <Badge className="bg-brand-100 text-brand-700">
                        {record.score.toFixed(2)}
                      </Badge>
                    )}
                    <Badge
                      className={
                        record.mode === 'AUTO'
                          ? 'bg-emerald-100 text-emerald-700'
                          : record.mode === 'REASSIGN'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-blue-100 text-blue-700'
                      }
                    >
                      {record.mode}
                    </Badge>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function CandidateRow({
  candidate,
  rank,
  isCurrent,
  onAssign,
  busy,
}: {
  candidate: ScoredCandidate;
  rank: number;
  isCurrent: boolean;
  onAssign: () => void;
  busy: boolean;
}) {
  return (
    <div
      className={clsx(
        'rounded-xl border p-3.5 transition-colors',
        rank === 1 ? 'border-emerald-300 bg-emerald-50/60' : 'border-ink-200 bg-white',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={clsx(
              'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-extrabold',
              rank === 1 ? 'bg-emerald-500 text-white' : 'bg-ink-100 text-ink-500',
            )}
          >
            {rank === 1 ? <Crown className="h-4 w-4" /> : rank}
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-ink-900">{candidate.agentName}</p>
              {isCurrent && <Badge className="bg-blue-100 text-blue-700">Currently assigned</Badge>}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
              <span className="inline-flex items-center gap-1">
                <Truck className="h-3 w-3" />
                {candidate.vehicleType.toLowerCase()}
              </span>
              {candidate.zoneCode && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {candidate.zoneCode}
                </span>
              )}
              {candidate.distanceKm !== null && (
                <span className="inline-flex items-center gap-1 font-semibold text-ink-600">
                  <Radar className="h-3 w-3" />
                  {candidate.distanceKm} km
                </span>
              )}
              {candidate.etaMinutes !== null && (
                <span className="inline-flex items-center gap-1">
                  <Timer className="h-3 w-3" />~{candidate.etaMinutes} min
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Gauge className="h-3 w-3" />
                {candidate.activeOrders}/{candidate.maxConcurrentOrders} orders
              </span>
              <AvailabilityBadge availability={candidate.availability} />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="font-mono text-lg font-extrabold text-ink-900">
              {candidate.score.toFixed(3)}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">score</p>
          </div>
          {!isCurrent && (
            <Button variant="secondary" size="sm" onClick={onAssign} loading={busy}>
              Assign
            </Button>
          )}
        </div>
      </div>

      {/* signal bars */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        <SignalBar label="Proximity" value={candidate.signals.proximity} color="bg-sky-500" />
        <SignalBar label="Zone" value={candidate.signals.zoneMatch} color="bg-violet-500" />
        <SignalBar label="Capacity" value={candidate.signals.workload} color="bg-emerald-500" />
        <SignalBar label="Record" value={candidate.signals.performance} color="bg-amber-500" />
      </div>
    </div>
  );
}

function SignalBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-ink-400">{label}</span>
        <span className="font-mono text-[10px] font-bold text-ink-600">{value.toFixed(2)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-150 bg-ink-200">
        <div
          className={clsx('h-full rounded-full transition-all', color)}
          style={{ width: `${Math.max(2, value * 100)}%` }}
        />
      </div>
    </div>
  );
}
