/**
 * Rate engine configuration.
 *
 * This is the screen that backs the "all admin-configurable, no hardcoding"
 * requirement. Everything the engine reads is editable here:
 *
 *   • global settings — volumetric divisor, slab size, minimum weight
 *   • rate cards      — the 2×2 matrix of B2B/B2C × intra/inter, plus lane
 *                       overrides that beat the generic card
 *   • COD rules       — flat / percentage / floor / ceiling, per order type
 *
 * A live "test the engine" panel sits at the bottom so a change can be verified
 * against a real quote without leaving the page.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  Calculator,
  Coins,
  Layers,
  Pencil,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useDebounced } from '@/hooks/useDebounced';
import { PageHeader } from '@/components/layout/AppShell';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  LoadingBlock,
  Modal,
  Segmented,
  Select,
} from '@/components/ui';
import type { CodRule, OrderType, RateCard, RateScope, Zone } from '@/lib/types';

export default function AdminPricing() {
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'cards' | 'cod' | 'settings' | 'test'>('cards');
  const [cardModal, setCardModal] = useState<{ open: boolean; card: RateCard | null }>({
    open: false,
    card: null,
  });
  const [codModal, setCodModal] = useState<{ open: boolean; rule: CodRule | null }>({
    open: false,
    rule: null,
  });

  const zones = useQuery({ queryKey: ['zones'], queryFn: api.zones.list });
  const cards = useQuery({ queryKey: ['rate-cards'], queryFn: api.pricing.rateCards });
  const codRules = useQuery({ queryKey: ['cod-rules'], queryFn: api.pricing.codRules });
  const settings = useQuery({ queryKey: ['pricing-settings'], queryFn: api.pricing.settings });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['rate-cards'] });
    void queryClient.invalidateQueries({ queryKey: ['cod-rules'] });
    void queryClient.invalidateQueries({ queryKey: ['pricing-settings'] });
  };

  const saveCard = useMutation({
    mutationFn: (payload: Partial<RateCard> & { id?: string }) =>
      payload.id ? api.pricing.updateRateCard(payload.id, payload) : api.pricing.createRateCard(payload),
    onSuccess: () => {
      toast.success('Rate card saved. New quotes use it immediately.');
      setCardModal({ open: false, card: null });
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Save failed.'),
  });

  const deleteCard = useMutation({
    mutationFn: (id: string) => api.pricing.deleteRateCard(id),
    onSuccess: () => {
      toast.success('Rate card removed.');
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Delete failed.'),
  });

  const saveCod = useMutation({
    mutationFn: (payload: Partial<CodRule> & { id?: string }) =>
      payload.id ? api.pricing.updateCodRule(payload.id, payload) : api.pricing.createCodRule(payload),
    onSuccess: () => {
      toast.success('COD rule saved.');
      setCodModal({ open: false, rule: null });
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Save failed.'),
  });

  if (cards.isPending || settings.isPending) return <LoadingBlock />;

  const grouped = groupCards(cards.data ?? []);

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Rate engine"
        subtitle="Every number the pricing engine reads lives here. Change one and the next quote reflects it — orders already placed keep the snapshot they were created with."
        actions={
          tab === 'cards' ? (
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setCardModal({ open: true, card: null })}
            >
              New rate card
            </Button>
          ) : tab === 'cod' ? (
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setCodModal({ open: true, rule: null })}
            >
              New COD rule
            </Button>
          ) : undefined
        }
      />

      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-6"
        options={[
          { value: 'cards', label: 'Rate cards', count: cards.data?.length },
          { value: 'cod', label: 'COD surcharge', count: codRules.data?.length },
          { value: 'settings', label: 'Weight settings' },
          { value: 'test', label: 'Test the engine' },
        ]}
      />

      {/* ================= rate cards ================= */}
      {tab === 'cards' && (
        <div className="space-y-6">
          <Alert tone="info" title="How a card is chosen" icon={<Layers className="h-4 w-4" />}>
            The engine looks for a card matching the order type and scope. A card naming this exact{' '}
            <strong>zone pair</strong> beats the generic one for the scope; ties break on{' '}
            <strong>priority</strong>, then on the most recent effective date.
          </Alert>

          {(['B2C', 'B2B'] as OrderType[]).map((orderType) => (
            <div key={orderType}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-500">
                <span
                  className={clsx(
                    'rounded-md px-2 py-0.5 text-[11px] text-white',
                    orderType === 'B2C' ? 'bg-violet-500' : 'bg-sky-600',
                  )}
                >
                  {orderType}
                </span>
                {orderType === 'B2C' ? 'Consumer shipments' : 'Business contracts'}
              </h2>

              <div className="grid gap-4 lg:grid-cols-2">
                {(['INTRA_ZONE', 'INTER_ZONE'] as RateScope[]).map((scope) => (
                  <div key={scope} className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-400">
                      {scope === 'INTRA_ZONE' ? 'Within a zone' : 'Across zones'}
                    </p>

                    {(grouped[`${orderType}:${scope}`] ?? []).map((card) => (
                      <RateCardTile
                        key={card.id}
                        card={card}
                        onEdit={() => setCardModal({ open: true, card })}
                        onDelete={() => {
                          if (
                            confirm(
                              `Remove "${card.name}"? Cards that have priced orders are archived instead of deleted.`,
                            )
                          )
                            deleteCard.mutate(card.id);
                        }}
                      />
                    ))}

                    {!(grouped[`${orderType}:${scope}`] ?? []).length && (
                      <Card className="border-dashed p-5 text-center">
                        <p className="text-sm font-semibold text-amber-600">No card configured</p>
                        <p className="mt-1 text-xs text-ink-500">
                          {orderType} {scope === 'INTRA_ZONE' ? 'intra-zone' : 'inter-zone'} orders
                          cannot be priced until you add one.
                        </p>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-3"
                          onClick={() => setCardModal({ open: true, card: null })}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add card
                        </Button>
                      </Card>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ================= COD ================= */}
      {tab === 'cod' && (
        <div className="space-y-5">
          <Alert tone="info" title="How the surcharge is computed" icon={<Coins className="h-4 w-4" />}>
            <code className="font-mono text-xs">
              fee = clamp( max(flatFee, percentOfValue% × declaredValue), minFee, maxFee )
            </code>
            <p className="mt-2">
              The <em>maximum</em> of the flat and percentage components — not the sum — because the
              flat fee is a floor that makes small cash collections worth handling, and the
              percentage takes over once the cash carried becomes a real risk.
            </p>
          </Alert>

          <div className="grid gap-4 md:grid-cols-2">
            {(codRules.data ?? []).map((rule) => (
              <Card key={rule.id} hover className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          rule.orderType === 'B2C'
                            ? 'bg-violet-100 text-violet-700'
                            : 'bg-sky-100 text-sky-700'
                        }
                      >
                        {rule.orderType}
                      </Badge>
                      {!rule.isActive && <Badge className="bg-ink-100 text-ink-500">Inactive</Badge>}
                    </div>
                    <p className="mt-3 font-mono text-sm text-ink-700">
                      max({money(rule.flatFee)}, {rule.percentOfValue}% × value)
                    </p>
                    <p className="mt-1 font-mono text-xs text-ink-500">
                      clamped to {money(rule.minFee)} –{' '}
                      {rule.maxFee !== null ? money(rule.maxFee) : '∞'}
                    </p>
                  </div>
                  <button
                    onClick={() => setCodModal({ open: true, rule })}
                    className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
                    aria-label={`Edit ${rule.orderType} COD rule`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>

                {/* quick worked examples */}
                <div className="mt-4 space-y-1.5 border-t border-ink-100 pt-3">
                  {[500, 5000, 50000].map((value) => (
                    <div key={value} className="flex justify-between text-xs">
                      <span className="text-ink-500">On {money(value)} declared</span>
                      <span className="font-mono font-bold text-ink-900">
                        {money(
                          Math.min(
                            rule.maxFee ?? Number.POSITIVE_INFINITY,
                            Math.max(
                              rule.minFee,
                              Math.max(rule.flatFee, (value * rule.percentOfValue) / 100),
                            ),
                          ),
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ================= settings ================= */}
      {tab === 'settings' && settings.data && (
        <SettingsPanel
          settings={settings.data}
          onSaved={() => {
            toast.success('Weight settings updated.');
            invalidate();
          }}
        />
      )}

      {/* ================= test ================= */}
      {tab === 'test' && <EngineTester zones={zones.data ?? []} />}

      <RateCardModal
        state={cardModal}
        zones={zones.data ?? []}
        onClose={() => setCardModal({ open: false, card: null })}
        onSave={(payload) => saveCard.mutate(payload)}
        saving={saveCard.isPending}
      />

      <CodModal
        state={codModal}
        onClose={() => setCodModal({ open: false, rule: null })}
        onSave={(payload) => saveCod.mutate(payload)}
        saving={saveCod.isPending}
      />
    </>
  );
}

function groupCards(cards: RateCard[]): Record<string, RateCard[]> {
  const grouped: Record<string, RateCard[]> = {};
  for (const card of cards) {
    const key = `${card.orderType}:${card.scope}`;
    (grouped[key] ??= []).push(card);
  }
  for (const list of Object.values(grouped)) list.sort((a, b) => b.priority - a.priority);
  return grouped;
}

// ---------------------------------------------------------------------------

function RateCardTile({
  card,
  onEdit,
  onDelete,
}: {
  card: RateCard;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const laneSpecific = Boolean(card.fromZoneId && card.toZoneId);

  return (
    <Card hover className={clsx('p-4', !card.isActive && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-bold text-ink-900">{card.name}</h3>
            {laneSpecific && (
              <Badge className="bg-fuchsia-100 text-fuchsia-700">
                <Sparkles className="h-3 w-3" />
                Lane
              </Badge>
            )}
            {!card.isActive && <Badge className="bg-ink-100 text-ink-500">Archived</Badge>}
          </div>

          {laneSpecific && (
            <p className="mt-1 font-mono text-[11px] text-ink-500">
              {card.fromZone?.code} → {card.toZone?.code}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-1">
          <Badge className="bg-ink-100 text-ink-500">P{card.priority}</Badge>
          <button
            onClick={onEdit}
            className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
            aria-label={`Edit ${card.name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
            aria-label={`Delete ${card.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-ink-100 pt-3 text-xs">
        <Row label={`Base (≤ ${card.baseWeightKg} kg)`} value={money(card.basePrice)} />
        <Row label={`Per ${card.incrementalWeightKg} kg`} value={money(card.incrementalPrice)} />
        {card.handlingFee > 0 && <Row label="Handling" value={money(card.handlingFee)} />}
        {card.fuelSurchargePct > 0 && <Row label="Fuel" value={`${card.fuelSurchargePct}%`} />}
        <Row label="GST" value={`${card.gstPct}%`} />
        {card._count?.orders !== undefined && (
          <Row label="Orders priced" value={String(card._count.orders)} />
        )}
      </dl>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-ink-400">{label}</dt>
      <dd className="shrink-0 font-mono font-bold text-ink-800">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SettingsPanel({
  settings,
  onSaved,
}: {
  settings: { volumetricDivisor: number; weightRoundingKg: number; minChargeableWeightKg: number };
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    volumetricDivisor: String(settings.volumetricDivisor),
    weightRoundingKg: String(settings.weightRoundingKg),
    minChargeableWeightKg: String(settings.minChargeableWeightKg),
  });

  const save = useMutation({
    mutationFn: () =>
      api.pricing.updateSettings({
        volumetricDivisor: Number(form.volumetricDivisor),
        weightRoundingKg: Number(form.weightRoundingKg),
        minChargeableWeightKg: Number(form.minChargeableWeightKg),
      }),
    onSuccess: onSaved,
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Save failed.'),
  });

  const divisor = Number(form.volumetricDivisor) || 5000;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Weight settings"
          subtitle="Global knobs that apply to every rate card"
          icon={<Settings2 className="h-4.5 w-4.5" />}
        />
        <div className="space-y-4 p-5">
          <Input
            label="Volumetric divisor"
            type="number"
            min="1"
            value={form.volumetricDivisor}
            onChange={(event) => setForm({ ...form, volumetricDivisor: event.target.value })}
            hint="volumetric kg = (L × B × H) ÷ divisor. 5000 is the courier standard; lower it to bill bulky freight harder."
          />
          <Input
            label="Weight slab"
            type="number"
            min="0.1"
            step="0.1"
            suffix="kg"
            value={form.weightRoundingKg}
            onChange={(event) => setForm({ ...form, weightRoundingKg: event.target.value })}
            hint="Chargeable weight rounds UP to the next multiple of this."
          />
          <Input
            label="Minimum chargeable weight"
            type="number"
            min="0"
            step="0.1"
            suffix="kg"
            value={form.minChargeableWeightKg}
            onChange={(event) => setForm({ ...form, minChargeableWeightKg: event.target.value })}
            hint="Floor so tiny parcels still cover handling cost."
          />
          <Button full loading={save.isPending} onClick={() => save.mutate()}>
            Save settings
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Effect preview"
          subtitle="What the current divisor does to common box sizes"
          icon={<Calculator className="h-4.5 w-4.5" />}
        />
        <div className="p-5">
          <table className="table">
            <thead>
              <tr>
                <th>Box (cm)</th>
                <th className="text-right">Volume</th>
                <th className="text-right">Volumetric</th>
              </tr>
            </thead>
            <tbody>
              {[
                [20, 15, 10],
                [30, 20, 15],
                [40, 30, 25],
                [60, 45, 40],
              ].map(([l, b, h]) => (
                <tr key={`${l}x${b}x${h}`}>
                  <td className="font-mono text-xs">
                    {l}×{b}×{h}
                  </td>
                  <td className="text-right font-mono text-xs text-ink-500">
                    {(l * b * h).toLocaleString('en-IN')} cm³
                  </td>
                  <td className="text-right font-mono text-xs font-bold text-ink-900">
                    {((l * b * h) / divisor).toFixed(2)} kg
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function EngineTester({ zones }: { zones: Zone[] }) {
  const [form, setForm] = useState({
    pickupPincode: '',
    dropPincode: '',
    lengthCm: '30',
    breadthCm: '20',
    heightCm: '15',
    actualWeightKg: '1.2',
    orderType: 'B2C' as OrderType,
    paymentType: 'COD' as 'PREPAID' | 'COD',
    declaredValue: '4500',
  });

  const pincodeOptions = zones
    .flatMap((zone) => (zone.areas ?? []).map((area) => ({ area, zone })))
    .map(({ area, zone }) => ({
      value: area.pincode,
      label: `${area.pincode} — ${area.name} (${zone.code})`,
    }));

  const ready =
    /^\d{6}$/.test(form.pickupPincode) &&
    /^\d{6}$/.test(form.dropPincode) &&
    Number(form.lengthCm) > 0 &&
    Number(form.breadthCm) > 0 &&
    Number(form.heightCm) > 0 &&
    Number(form.actualWeightKg) > 0;

  const payload = ready
    ? {
        pickupPincode: form.pickupPincode,
        dropPincode: form.dropPincode,
        lengthCm: Number(form.lengthCm),
        breadthCm: Number(form.breadthCm),
        heightCm: Number(form.heightCm),
        actualWeightKg: Number(form.actualWeightKg),
        orderType: form.orderType,
        paymentType: form.paymentType,
        declaredValue: form.paymentType === 'COD' ? Number(form.declaredValue || 0) : 0,
      }
    : null;

  const debounced = useDebounced(payload, 400);

  const quote = useQuery({
    queryKey: ['engine-test', debounced],
    queryFn: () => api.pricing.quote(debounced!),
    enabled: Boolean(debounced),
    retry: false,
  });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Test the engine"
          subtitle="Price a hypothetical shipment against the live configuration"
          icon={<Calculator className="h-4.5 w-4.5" />}
        />
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Pickup pincode"
              value={form.pickupPincode}
              onChange={(event) => setForm({ ...form, pickupPincode: event.target.value })}
              placeholder="Choose…"
              options={pincodeOptions}
            />
            <Select
              label="Drop pincode"
              value={form.dropPincode}
              onChange={(event) => setForm({ ...form, dropPincode: event.target.value })}
              placeholder="Choose…"
              options={pincodeOptions}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(['lengthCm', 'breadthCm', 'heightCm'] as const).map((key) => (
              <Input
                key={key}
                label={key.replace('Cm', '')}
                type="number"
                suffix="cm"
                value={form[key]}
                onChange={(event) => setForm({ ...form, [key]: event.target.value })}
              />
            ))}
            <Input
              label="Weight"
              type="number"
              step="0.1"
              suffix="kg"
              value={form.actualWeightKg}
              onChange={(event) => setForm({ ...form, actualWeightKg: event.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Order type"
              value={form.orderType}
              onChange={(event) => setForm({ ...form, orderType: event.target.value as OrderType })}
              options={[
                { value: 'B2C', label: 'B2C' },
                { value: 'B2B', label: 'B2B' },
              ]}
            />
            <Select
              label="Payment"
              value={form.paymentType}
              onChange={(event) =>
                setForm({ ...form, paymentType: event.target.value as 'PREPAID' | 'COD' })
              }
              options={[
                { value: 'PREPAID', label: 'Prepaid' },
                { value: 'COD', label: 'COD' },
              ]}
            />
            {form.paymentType === 'COD' && (
              <Input
                label="Declared value"
                type="number"
                prefix="₹"
                value={form.declaredValue}
                onChange={(event) => setForm({ ...form, declaredValue: event.target.value })}
              />
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Result"
          subtitle="Exactly what a customer would be shown"
          icon={<Banknote className="h-4.5 w-4.5" />}
        />
        <div className="p-5">
          {!payload && (
            <p className="py-10 text-center text-sm text-ink-400">
              Pick both pincodes to run the engine.
            </p>
          )}
          {payload && quote.isError && (
            <Alert tone="warning" title="The engine refused this shipment">
              {(quote.error as Error).message}
            </Alert>
          )}
          {quote.data && <PriceBreakdown quote={quote.data} />}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RateCardModal({
  state,
  zones,
  onClose,
  onSave,
  saving,
}: {
  state: { open: boolean; card: RateCard | null };
  zones: Zone[];
  onClose: () => void;
  onSave: (payload: Partial<RateCard> & { id?: string }) => void;
  saving: boolean;
}) {
  const card = state.card;
  const [form, setForm] = useState({
    name: '',
    orderType: 'B2C' as OrderType,
    scope: 'INTRA_ZONE' as RateScope,
    fromZoneId: '',
    toZoneId: '',
    baseWeightKg: '0.5',
    basePrice: '49',
    incrementalWeightKg: '0.5',
    incrementalPrice: '22',
    fuelSurchargePct: '6',
    gstPct: '18',
    handlingFee: '0',
    priority: '50',
    isActive: true,
  });

  const [seededFor, setSeededFor] = useState<string | null | undefined>(undefined);
  if (state.open && seededFor !== (card?.id ?? null)) {
    setSeededFor(card?.id ?? null);
    setForm({
      name: card?.name ?? '',
      orderType: card?.orderType ?? 'B2C',
      scope: card?.scope ?? 'INTRA_ZONE',
      fromZoneId: card?.fromZoneId ?? '',
      toZoneId: card?.toZoneId ?? '',
      baseWeightKg: String(card?.baseWeightKg ?? 0.5),
      basePrice: String(card?.basePrice ?? 49),
      incrementalWeightKg: String(card?.incrementalWeightKg ?? 0.5),
      incrementalPrice: String(card?.incrementalPrice ?? 22),
      fuelSurchargePct: String(card?.fuelSurchargePct ?? 6),
      gstPct: String(card?.gstPct ?? 18),
      handlingFee: String(card?.handlingFee ?? 0),
      priority: String(card?.priority ?? 50),
      isActive: card?.isActive ?? true,
    });
  }

  const zoneOptions = zones.map((zone) => ({
    value: zone.id,
    label: `${zone.code} · ${zone.name}`,
  }));

  return (
    <Modal
      open={state.open}
      onClose={onClose}
      title={card ? `Edit "${card.name}"` : 'New rate card'}
      subtitle="Slab pricing: the base price covers everything up to the base weight, then each extra slab is charged."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            onClick={() =>
              onSave({
                ...(card ? { id: card.id } : {}),
                name: form.name.trim(),
                orderType: form.orderType,
                scope: form.scope,
                fromZoneId: form.fromZoneId || null,
                toZoneId: form.toZoneId || null,
                baseWeightKg: Number(form.baseWeightKg),
                basePrice: Number(form.basePrice),
                incrementalWeightKg: Number(form.incrementalWeightKg),
                incrementalPrice: Number(form.incrementalPrice),
                fuelSurchargePct: Number(form.fuelSurchargePct),
                gstPct: Number(form.gstPct),
                handlingFee: Number(form.handlingFee),
                priority: Number(form.priority),
                isActive: form.isActive,
              })
            }
          >
            {card ? 'Save changes' : 'Create card'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Input
          label="Card name"
          required
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          placeholder="B2C Local — standard"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Order type"
            value={form.orderType}
            onChange={(event) => setForm({ ...form, orderType: event.target.value as OrderType })}
            options={[
              { value: 'B2C', label: 'B2C' },
              { value: 'B2B', label: 'B2B' },
            ]}
          />
          <Select
            label="Scope"
            value={form.scope}
            onChange={(event) => setForm({ ...form, scope: event.target.value as RateScope })}
            options={[
              { value: 'INTRA_ZONE', label: 'Within a zone' },
              { value: 'INTER_ZONE', label: 'Across zones' },
            ]}
          />
          <Input
            label="Priority"
            type="number"
            min="0"
            max="1000"
            value={form.priority}
            onChange={(event) => setForm({ ...form, priority: event.target.value })}
            hint="Higher wins"
          />
        </div>

        <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-500">
            Lane override (optional)
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="From zone"
              value={form.fromZoneId}
              onChange={(event) => setForm({ ...form, fromZoneId: event.target.value })}
              placeholder="Any zone"
              options={zoneOptions}
            />
            <Select
              label="To zone"
              value={form.toZoneId}
              onChange={(event) => setForm({ ...form, toZoneId: event.target.value })}
              placeholder="Any zone"
              options={zoneOptions}
            />
          </div>
          <p className="mt-2 text-[11px] text-ink-400">
            Set both to make this card apply only to that exact lane — it then beats the generic
            card for the scope. Leave both empty for a network-wide card.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Base weight"
            type="number"
            step="0.1"
            suffix="kg"
            value={form.baseWeightKg}
            onChange={(event) => setForm({ ...form, baseWeightKg: event.target.value })}
          />
          <Input
            label="Base price"
            type="number"
            step="1"
            prefix="₹"
            value={form.basePrice}
            onChange={(event) => setForm({ ...form, basePrice: event.target.value })}
          />
          <Input
            label="Increment slab"
            type="number"
            step="0.1"
            suffix="kg"
            value={form.incrementalWeightKg}
            onChange={(event) => setForm({ ...form, incrementalWeightKg: event.target.value })}
          />
          <Input
            label="Price per slab"
            type="number"
            step="1"
            prefix="₹"
            value={form.incrementalPrice}
            onChange={(event) => setForm({ ...form, incrementalPrice: event.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Handling fee"
            type="number"
            step="1"
            prefix="₹"
            value={form.handlingFee}
            onChange={(event) => setForm({ ...form, handlingFee: event.target.value })}
          />
          <Input
            label="Fuel surcharge"
            type="number"
            step="0.5"
            suffix="%"
            value={form.fuelSurchargePct}
            onChange={(event) => setForm({ ...form, fuelSurchargePct: event.target.value })}
          />
          <Input
            label="GST"
            type="number"
            step="0.5"
            suffix="%"
            value={form.gstPct}
            onChange={(event) => setForm({ ...form, gstPct: event.target.value })}
          />
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-200 p-3.5">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
            className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm font-semibold text-ink-800">
            Active — the engine may select this card
          </span>
        </label>
      </div>
    </Modal>
  );
}

function CodModal({
  state,
  onClose,
  onSave,
  saving,
}: {
  state: { open: boolean; rule: CodRule | null };
  onClose: () => void;
  onSave: (payload: Partial<CodRule> & { id?: string }) => void;
  saving: boolean;
}) {
  const rule = state.rule;
  const [form, setForm] = useState({
    orderType: 'B2C' as OrderType,
    flatFee: '40',
    percentOfValue: '1.5',
    minFee: '40',
    maxFee: '500',
    isActive: true,
  });

  const [seededFor, setSeededFor] = useState<string | null | undefined>(undefined);
  if (state.open && seededFor !== (rule?.id ?? null)) {
    setSeededFor(rule?.id ?? null);
    setForm({
      orderType: rule?.orderType ?? 'B2C',
      flatFee: String(rule?.flatFee ?? 40),
      percentOfValue: String(rule?.percentOfValue ?? 1.5),
      minFee: String(rule?.minFee ?? 40),
      maxFee: rule?.maxFee !== null && rule?.maxFee !== undefined ? String(rule.maxFee) : '',
      isActive: rule?.isActive ?? true,
    });
  }

  return (
    <Modal
      open={state.open}
      onClose={onClose}
      title={rule ? `Edit ${rule.orderType} COD rule` : 'New COD rule'}
      subtitle="fee = clamp( max(flat, pct × declared value), min, max )"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            onClick={() =>
              onSave({
                ...(rule ? { id: rule.id } : {}),
                orderType: form.orderType,
                flatFee: Number(form.flatFee),
                percentOfValue: Number(form.percentOfValue),
                minFee: Number(form.minFee),
                maxFee: form.maxFee ? Number(form.maxFee) : null,
                isActive: form.isActive,
              })
            }
          >
            {rule ? 'Save changes' : 'Create rule'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Applies to"
          value={form.orderType}
          onChange={(event) => setForm({ ...form, orderType: event.target.value as OrderType })}
          options={[
            { value: 'B2C', label: 'B2C orders' },
            { value: 'B2B', label: 'B2B orders' },
          ]}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Flat fee"
            type="number"
            step="1"
            prefix="₹"
            value={form.flatFee}
            onChange={(event) => setForm({ ...form, flatFee: event.target.value })}
          />
          <Input
            label="Percentage of value"
            type="number"
            step="0.1"
            suffix="%"
            value={form.percentOfValue}
            onChange={(event) => setForm({ ...form, percentOfValue: event.target.value })}
          />
          <Input
            label="Minimum fee"
            type="number"
            step="1"
            prefix="₹"
            value={form.minFee}
            onChange={(event) => setForm({ ...form, minFee: event.target.value })}
          />
          <Input
            label="Maximum fee"
            type="number"
            step="1"
            prefix="₹"
            value={form.maxFee}
            onChange={(event) => setForm({ ...form, maxFee: event.target.value })}
            hint="Leave empty for no ceiling"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-200 p-3.5">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
            className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm font-semibold text-ink-800">Active</span>
        </label>
      </div>
    </Modal>
  );
}
