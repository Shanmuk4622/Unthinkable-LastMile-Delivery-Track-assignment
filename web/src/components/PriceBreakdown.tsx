/**
 * The price explainer.
 *
 * This component is the whole point of the rate engine being auditable: it
 * shows the customer not just *what* they are paying but *why* — which zone
 * pair was detected, whether the parcel billed on scale or volume, which rate
 * card applied, and the arithmetic behind every line.
 */
import clsx from 'clsx';
import {
  ArrowRight,
  Box,
  Info,
  MapPin,
  ReceiptText,
  Scale,
  Sparkles,
  Weight,
} from 'lucide-react';
import { money, kg } from '@/lib/format';
import type { Quote } from '@/lib/types';

export function PriceBreakdown({
  quote,
  className,
  showZones = true,
}: {
  quote: Quote;
  className?: string;
  showZones?: boolean;
}) {
  const { weights, charges, zones, rateCard, lines } = quote;
  const volumetricWon = weights.billedOn === 'VOLUMETRIC';

  return (
    <div className={clsx('space-y-4', className)}>
      {/* ---- zone detection ---- */}
      {showZones && (
        <div className="rounded-2xl border border-brand-100 bg-route-soft p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-700">
            <MapPin className="h-3.5 w-3.5" />
            Zone detection
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <ZonePill code={zones.pickup.code} name={zones.pickup.name} city={zones.pickup.city} />
            <ArrowRight className="h-4 w-4 shrink-0 text-brand-400" />
            <ZonePill code={zones.drop.code} name={zones.drop.name} city={zones.drop.city} />
            <span
              className={clsx(
                'badge ml-auto',
                zones.sameZone ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700',
              )}
            >
              {zones.sameZone ? 'Intra-zone' : 'Inter-zone'}
            </span>
          </div>
        </div>
      )}

      {/* ---- weight logic ---- */}
      <div className="rounded-2xl border border-ink-200 bg-white p-4">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-500">
          <Scale className="h-3.5 w-3.5" />
          Chargeable weight
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <WeightCard
            icon={<Weight className="h-4 w-4" />}
            label="Actual"
            value={kg(weights.actualKg)}
            active={!volumetricWon}
          />
          <WeightCard
            icon={<Box className="h-4 w-4" />}
            label="Volumetric"
            value={kg(weights.volumetricKg)}
            active={volumetricWon}
            hint={`L×B×H ÷ ${weights.volumetricDivisor}`}
          />
          <WeightCard
            icon={<Sparkles className="h-4 w-4" />}
            label="Billed on"
            value={kg(weights.chargeableKg)}
            highlight
            hint={`rounded up to ${weights.slabKg} kg slabs`}
          />
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-ink-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
          <span>
            We bill on whichever is higher.{' '}
            {volumetricWon ? (
              <>
                This parcel is bulky for its weight, so the{' '}
                <strong className="text-ink-700">volumetric</strong> figure wins.
              </>
            ) : (
              <>
                This parcel is dense, so the <strong className="text-ink-700">actual</strong> weight
                wins.
              </>
            )}
          </span>
        </p>
      </div>

      {/* ---- line items ---- */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/60 px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-500">
            <ReceiptText className="h-3.5 w-3.5" />
            Charge breakdown
          </p>
          <span
            className={clsx(
              'badge text-[10px]',
              rateCard.laneSpecific
                ? 'bg-fuchsia-100 text-fuchsia-700'
                : 'bg-ink-100 text-ink-600',
            )}
            title={
              rateCard.laneSpecific
                ? 'A lane-specific card exists for this exact zone pair and takes precedence.'
                : 'The generic card for this scope applies.'
            }
          >
            {rateCard.laneSpecific && <Sparkles className="h-3 w-3" />}
            {rateCard.name}
          </span>
        </div>

        <ul className="divide-y divide-ink-100">
          {lines.map((line) => (
            <li key={line.key} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p
                  className={clsx(
                    'text-sm font-semibold',
                    line.kind === 'tax' ? 'text-ink-500' : 'text-ink-800',
                  )}
                >
                  {line.label}
                </p>
                <p className="mt-0.5 font-mono text-[11px] leading-relaxed text-ink-400">
                  {line.formula}
                </p>
              </div>
              <p
                className={clsx(
                  'shrink-0 font-mono text-sm font-bold tabular-nums',
                  line.amount === 0 ? 'text-ink-400' : 'text-ink-900',
                )}
              >
                {money(line.amount, quote.currency)}
              </p>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-4 bg-route px-4 py-4 text-white">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider opacity-85">Total payable</p>
            <p className="mt-0.5 text-[11px] opacity-75">
              Inclusive of {charges.gstPct}% GST
              {charges.codSurcharge > 0 ? ' and COD handling' : ''}
            </p>
          </div>
          <p className="font-mono text-2xl font-extrabold tabular-nums">
            {money(charges.total, quote.currency)}
          </p>
        </div>
      </div>
    </div>
  );
}

function ZonePill({ code, name, city }: { code: string; name: string; city: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-brand-200 bg-white px-3 py-2">
      <p className="font-mono text-[11px] font-bold text-brand-600">{code}</p>
      <p className="truncate text-sm font-semibold text-ink-800">{name}</p>
      <p className="truncate text-[11px] text-ink-400">{city}</p>
    </div>
  );
}

function WeightCard({
  icon,
  label,
  value,
  hint,
  active,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  active?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={clsx(
        'rounded-xl border p-3 transition-colors',
        highlight
          ? 'border-brand-300 bg-brand-50'
          : active
            ? 'border-emerald-300 bg-emerald-50'
            : 'border-ink-200 bg-ink-50/50',
      )}
    >
      <p
        className={clsx(
          'flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide',
          highlight ? 'text-brand-600' : active ? 'text-emerald-600' : 'text-ink-400',
        )}
      >
        {icon}
        {label}
      </p>
      <p
        className={clsx(
          'mt-1 font-mono text-base font-extrabold tabular-nums',
          highlight ? 'text-brand-700' : active ? 'text-emerald-700' : 'text-ink-600',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[10px] leading-tight text-ink-400">{hint}</p>}
    </div>
  );
}
