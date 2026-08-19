/**
 * Book a pickup.
 *
 * The core requirement is "the charge is shown before the customer confirms",
 * so the quote is not a button you press at the end — it is a live panel that
 * re-prices itself as you type, and the confirm button stays disabled until a
 * real quote exists.
 *
 * Admins get one extra control at the top: a customer picker, which is how the
 * "admin creates an order on behalf of a customer" requirement is met.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  Box,
  CheckCircle2,
  Loader2,
  MapPin,
  PackagePlus,
  Search,
  Sparkles,
  Truck,
  UserRound,
  Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { money, todayInput } from '@/lib/format';
import { useDebounced } from '@/hooks/useDebounced';
import { PageHeader } from '@/components/layout/AppShell';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { Alert, Button, Card, Input, Textarea } from '@/components/ui';
import type { AddressInput, OrderType, PaymentType } from '@/lib/types';

const EMPTY_ADDRESS: AddressInput = {
  label: null,
  contactName: '',
  contactPhone: '',
  line1: '',
  line2: null,
  landmark: null,
  city: '',
  state: null,
  pincode: '',
  lat: null,
  lng: null,
};

export default function NewOrder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';

  const [customerId, setCustomerId] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');

  const [pickup, setPickup] = useState<AddressInput>({
    ...EMPTY_ADDRESS,
    contactName: isAdmin ? '' : (user?.fullName ?? ''),
    contactPhone: isAdmin ? '' : (user?.phone ?? ''),
  });
  const [drop, setDrop] = useState<AddressInput>(EMPTY_ADDRESS);

  const [pkg, setPkg] = useState({
    lengthCm: '',
    breadthCm: '',
    heightCm: '',
    actualWeightKg: '',
  });

  const [orderType, setOrderType] = useState<OrderType>(user?.companyName ? 'B2B' : 'B2C');
  const [paymentType, setPaymentType] = useState<PaymentType>('PREPAID');
  const [declaredValue, setDeclaredValue] = useState('');
  const [scheduledDate, setScheduledDate] = useState(todayInput(1));
  const [notes, setNotes] = useState('');
  const [autoAssign, setAutoAssign] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // ---- customer lookup (admin only) -------------------------------------
  const debouncedCustomerQuery = useDebounced(customerQuery, 300);
  const customers = useQuery({
    queryKey: ['customer-lookup', debouncedCustomerQuery],
    queryFn: () => api.users.lookupCustomers(debouncedCustomerQuery),
    enabled: isAdmin,
  });

  // ---- serviceability as you type ---------------------------------------
  const pickupPin = useDebounced(pickup.pincode, 400);
  const dropPin = useDebounced(drop.pincode, 400);

  const pickupZone = useServiceability(pickupPin);
  const dropZone = useServiceability(dropPin);

  // Auto-fill the city once we know the pincode — one less thing to type.
  useEffect(() => {
    if (pickupZone.data?.serviceable && pickupZone.data.zone && !pickup.city) {
      setPickup((previous) => ({ ...previous, city: pickupZone.data!.zone!.city }));
    }
  }, [pickupZone.data, pickup.city]);

  useEffect(() => {
    if (dropZone.data?.serviceable && dropZone.data.zone && !drop.city) {
      setDrop((previous) => ({ ...previous, city: dropZone.data!.zone!.city }));
    }
  }, [dropZone.data, drop.city]);

  // ---- live quote --------------------------------------------------------
  const quoteInput = useMemo(() => {
    const dims = {
      lengthCm: Number(pkg.lengthCm),
      breadthCm: Number(pkg.breadthCm),
      heightCm: Number(pkg.heightCm),
      actualWeightKg: Number(pkg.actualWeightKg),
    };

    const ready =
      /^\d{6}$/.test(pickup.pincode) &&
      /^\d{6}$/.test(drop.pincode) &&
      Object.values(dims).every((value) => Number.isFinite(value) && value > 0);

    if (!ready) return null;

    return {
      pickupPincode: pickup.pincode,
      dropPincode: drop.pincode,
      ...dims,
      orderType,
      paymentType,
      declaredValue: paymentType === 'COD' ? Number(declaredValue || 0) : 0,
    };
  }, [pkg, pickup.pincode, drop.pincode, orderType, paymentType, declaredValue]);

  const debouncedQuoteInput = useDebounced(quoteInput, 450);

  const quote = useQuery({
    queryKey: ['quote', debouncedQuoteInput],
    queryFn: () => api.pricing.quote(debouncedQuoteInput!),
    enabled: Boolean(debouncedQuoteInput),
    retry: false,
  });

  // ---- submit ------------------------------------------------------------
  const createOrder = useMutation({
    mutationFn: () =>
      api.orders.create({
        ...(isAdmin && customerId ? { customerId } : {}),
        orderType,
        paymentType,
        declaredValue: paymentType === 'COD' ? Number(declaredValue || 0) : 0,
        pickup,
        drop,
        lengthCm: Number(pkg.lengthCm),
        breadthCm: Number(pkg.breadthCm),
        heightCm: Number(pkg.heightCm),
        actualWeightKg: Number(pkg.actualWeightKg),
        scheduledDate: scheduledDate || null,
        notes: notes.trim() || null,
        confirmImmediately: true,
        autoAssign,
      }),
    onSuccess: (order) => {
      toast.success(`Order ${order.code} confirmed!`);
      navigate(`${isAdmin ? '/admin' : '/app'}/orders/${order.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors;
        if (Object.keys(fields).length) {
          setFieldErrors(fields);
          toast.error('Some details need fixing — see the highlighted fields.');
          return;
        }
      }
      toast.error(error instanceof Error ? error.message : 'Could not create the order.');
    },
  });

  const blockers = validate();
  const canSubmit = blockers.length === 0 && Boolean(quote.data) && !createOrder.isPending;

  function validate(): string[] {
    const issues: string[] = [];
    if (isAdmin && !customerId) issues.push('Choose the customer this order belongs to');
    if (!pickup.contactName || !pickup.contactPhone || !pickup.line1 || !pickup.pincode)
      issues.push('Complete the pickup address');
    if (!drop.contactName || !drop.contactPhone || !drop.line1 || !drop.pincode)
      issues.push('Complete the drop address');
    if (!quoteInput) issues.push('Enter all four package measurements');
    if (pickupZone.data && !pickupZone.data.serviceable) issues.push('Pickup pincode is not serviceable');
    if (dropZone.data && !dropZone.data.serviceable) issues.push('Drop pincode is not serviceable');
    if (paymentType === 'COD' && Number(declaredValue || 0) <= 0)
      issues.push('COD orders need a declared value');
    return issues;
  }

  return (
    <>
      <PageHeader
        eyebrow="New shipment"
        title="Book a pickup"
        subtitle="Enter the route and the box. We price it live — you confirm only when you are happy with the number."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* ================= form ================= */}
        <div className="space-y-5">
          {/* customer picker */}
          {isAdmin && (
            <Section
              icon={<UserRound className="h-5 w-5" />}
              title="Customer"
              subtitle="Which account is this shipment booked against?"
              tone="amber"
            >
              <div className="space-y-3">
                <Input
                  placeholder="Search by name, e-mail or company…"
                  value={customerQuery}
                  onChange={(event) => setCustomerQuery(event.target.value)}
                  prefix={<Search className="h-4 w-4" />}
                  className="pl-9"
                />

                <div className="max-h-52 space-y-1.5 overflow-y-auto">
                  {customers.isPending && (
                    <p className="py-3 text-center text-sm text-ink-400">Loading customers…</p>
                  )}
                  {customers.data?.length === 0 && (
                    <p className="py-3 text-center text-sm text-ink-400">
                      No customer matches that search.
                    </p>
                  )}
                  {customers.data?.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => {
                        setCustomerId(candidate.id);
                        setPickup((previous) => ({
                          ...previous,
                          contactName: previous.contactName || candidate.fullName,
                          contactPhone: previous.contactPhone || (candidate.phone ?? ''),
                        }));
                        if (candidate.companyName) setOrderType('B2B');
                      }}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                        customerId === candidate.id
                          ? 'border-brand-400 bg-brand-50 shadow-sm'
                          : 'border-ink-200 bg-white hover:border-brand-200 hover:bg-brand-50/40'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-ink-900">
                          {candidate.fullName}
                        </span>
                        <span className="block truncate text-xs text-ink-500">
                          {candidate.email}
                          {candidate.companyName ? ` · ${candidate.companyName}` : ''}
                        </span>
                      </span>
                      {customerId === candidate.id && (
                        <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-brand-600" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </Section>
          )}

          {/* pickup */}
          <Section
            icon={<MapPin className="h-5 w-5" />}
            title="Pickup address"
            subtitle="Where should the agent collect the parcel?"
            tone="violet"
          >
            <AddressFields
              value={pickup}
              onChange={setPickup}
              prefix="pickup"
              errors={fieldErrors}
              serviceability={pickupZone}
            />
          </Section>

          {/* drop */}
          <Section
            icon={<Truck className="h-5 w-5" />}
            title="Delivery address"
            subtitle="Where is it going?"
            tone="sky"
          >
            <AddressFields
              value={drop}
              onChange={setDrop}
              prefix="drop"
              errors={fieldErrors}
              serviceability={dropZone}
            />
          </Section>

          {/* package */}
          <Section
            icon={<Box className="h-5 w-5" />}
            title="Package"
            subtitle="We bill on the higher of actual and volumetric weight."
            tone="emerald"
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Input
                label="Length"
                type="number"
                min="1"
                step="0.5"
                required
                suffix="cm"
                value={pkg.lengthCm}
                onChange={(event) => setPkg({ ...pkg, lengthCm: event.target.value })}
                error={fieldErrors.lengthCm}
                placeholder="30"
              />
              <Input
                label="Breadth"
                type="number"
                min="1"
                step="0.5"
                required
                suffix="cm"
                value={pkg.breadthCm}
                onChange={(event) => setPkg({ ...pkg, breadthCm: event.target.value })}
                error={fieldErrors.breadthCm}
                placeholder="20"
              />
              <Input
                label="Height"
                type="number"
                min="1"
                step="0.5"
                required
                suffix="cm"
                value={pkg.heightCm}
                onChange={(event) => setPkg({ ...pkg, heightCm: event.target.value })}
                error={fieldErrors.heightCm}
                placeholder="15"
              />
              <Input
                label="Weight"
                type="number"
                min="0.1"
                step="0.1"
                required
                suffix="kg"
                value={pkg.actualWeightKg}
                onChange={(event) => setPkg({ ...pkg, actualWeightKg: event.target.value })}
                error={fieldErrors.actualWeightKg}
                placeholder="1.5"
              />
            </div>

            {quote.data && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
                <Sparkles className="h-3.5 w-3.5" />
                Volumetric {quote.data.weights.volumetricKg} kg vs actual{' '}
                {quote.data.weights.actualKg} kg → billing on{' '}
                <strong>{quote.data.weights.chargeableKg} kg</strong> (
                {quote.data.weights.billedOn.toLowerCase()})
              </div>
            )}
          </Section>

          {/* options */}
          <Section
            icon={<Wallet className="h-5 w-5" />}
            title="Shipment options"
            subtitle="Order type selects the rate card; payment type decides the COD surcharge."
            tone="rose"
          >
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Choice
                  label="Order type"
                  value={orderType}
                  onChange={(value) => setOrderType(value as OrderType)}
                  options={[
                    { value: 'B2C', label: 'B2C', hint: 'Individual recipient' },
                    { value: 'B2B', label: 'B2B', hint: 'Business contract rates' },
                  ]}
                />
                <Choice
                  label="Payment"
                  value={paymentType}
                  onChange={(value) => setPaymentType(value as PaymentType)}
                  options={[
                    { value: 'PREPAID', label: 'Prepaid', hint: 'Paid at booking' },
                    { value: 'COD', label: 'Cash on delivery', hint: 'Surcharge applies' },
                  ]}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {paymentType === 'COD' && (
                  <Input
                    label="Declared value"
                    type="number"
                    min="1"
                    required
                    prefix="₹"
                    value={declaredValue}
                    onChange={(event) => setDeclaredValue(event.target.value)}
                    error={fieldErrors.declaredValue}
                    placeholder="4500"
                    hint="The amount the agent will collect"
                  />
                )}
                <Input
                  label="Preferred delivery date"
                  type="date"
                  min={todayInput()}
                  value={scheduledDate}
                  onChange={(event) => setScheduledDate(event.target.value)}
                />
              </div>

              <Textarea
                label="Delivery instructions"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Gate code, preferred time window, fragile handling…"
                maxLength={1000}
              />

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 bg-white p-3.5 transition-colors hover:border-brand-300 hover:bg-brand-50/40">
                <input
                  type="checkbox"
                  checked={autoAssign}
                  onChange={(event) => setAutoAssign(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                />
                <span>
                  <span className="block text-sm font-bold text-ink-900">
                    Dispatch automatically
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-500">
                    Assign the nearest available agent the moment the order is confirmed.
                  </span>
                </span>
              </label>
            </div>
          </Section>
        </div>

        {/* ================= live quote ================= */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-ink-900">Live quote</h2>
                <p className="text-xs text-ink-500">Updates as you type</p>
              </div>
              {quote.isFetching && <Loader2 className="h-4 w-4 animate-spin text-brand-500" />}
            </div>

            <div className="p-5">
              {!quoteInput && (
                <div className="py-10 text-center">
                  <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-route-soft text-brand-400">
                    <PackagePlus className="h-7 w-7" />
                  </span>
                  <p className="text-sm font-semibold text-ink-700">Waiting for details</p>
                  <p className="mx-auto mt-1.5 max-w-[15rem] text-xs text-ink-500">
                    Enter both pincodes and all four package measurements, and the price appears
                    here instantly.
                  </p>
                </div>
              )}

              {quoteInput && quote.isError && (
                <Alert
                  tone="warning"
                  title="Cannot price this shipment yet"
                  icon={<AlertCircle className="h-4 w-4" />}
                >
                  {(quote.error as Error).message}
                </Alert>
              )}

              {quote.data && <PriceBreakdown quote={quote.data} />}
            </div>

            <div className="space-y-3 border-t border-ink-100 bg-ink-50/60 p-5">
              {blockers.length > 0 && (
                <ul className="space-y-1.5">
                  {blockers.map((blocker) => (
                    <li
                      key={blocker}
                      className="flex items-start gap-2 text-xs font-medium text-ink-500"
                    >
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      {blocker}
                    </li>
                  ))}
                </ul>
              )}

              <Button
                full
                className="py-3"
                disabled={!canSubmit}
                loading={createOrder.isPending}
                onClick={() => createOrder.mutate()}
              >
                {quote.data
                  ? `Confirm & pay ${money(quote.data.charges.total, quote.data.currency)}`
                  : 'Confirm booking'}
                <ArrowRight className="h-4 w-4" />
              </Button>

              <p className="text-center text-[11px] leading-relaxed text-ink-400">
                The price is recalculated on the server when you confirm and then frozen onto the
                order — a later rate-card change can never restate this invoice.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
//  Local building blocks
// ---------------------------------------------------------------------------

function useServiceability(pincode: string) {
  return useQuery({
    queryKey: ['serviceability', pincode],
    queryFn: () => api.zones.serviceability(pincode),
    enabled: /^\d{6}$/.test(pincode),
    staleTime: 5 * 60_000,
  });
}

const TONES = {
  violet: 'bg-violet-50 text-violet-600',
  sky: 'bg-sky-50 text-sky-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  rose: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-600',
} as const;

function Section({
  icon,
  title,
  subtitle,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tone: keyof typeof TONES;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3 border-b border-ink-100 px-5 py-4">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONES[tone]}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink-900">{title}</h2>
          <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

function AddressFields({
  value,
  onChange,
  prefix,
  errors,
  serviceability,
}: {
  value: AddressInput;
  onChange: (next: AddressInput) => void;
  prefix: string;
  errors: Record<string, string>;
  serviceability: ReturnType<typeof useServiceability>;
}) {
  const set =
    (key: keyof AddressInput) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...value, [key]: event.target.value });

  const info = serviceability.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Contact name"
          required
          value={value.contactName}
          onChange={set('contactName')}
          error={errors[`${prefix}.contactName`]}
          placeholder="Who is handing over / receiving?"
        />
        <Input
          label="Contact phone"
          type="tel"
          required
          value={value.contactPhone}
          onChange={set('contactPhone')}
          error={errors[`${prefix}.contactPhone`]}
          placeholder="+91 98450 12345"
        />
      </div>

      <Input
        label="Address line 1"
        required
        value={value.line1}
        onChange={set('line1')}
        error={errors[`${prefix}.line1`]}
        placeholder="Flat / building / street"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Address line 2"
          value={value.line2 ?? ''}
          onChange={set('line2')}
          placeholder="Area, locality"
        />
        <Input
          label="Landmark"
          value={value.landmark ?? ''}
          onChange={set('landmark')}
          placeholder="Near the metro station"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Input
            label="Pincode"
            required
            inputMode="numeric"
            maxLength={6}
            value={value.pincode}
            onChange={(event) =>
              onChange({ ...value, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) })
            }
            error={errors[`${prefix}.pincode`]}
            placeholder="560034"
          />
          {/^\d{6}$/.test(value.pincode) && (
            <div className="mt-1.5">
              {serviceability.isFetching ? (
                <p className="flex items-center gap-1.5 text-xs text-ink-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Checking coverage…
                </p>
              ) : info?.serviceable ? (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {info.zone?.name} ({info.zone?.code})
                </p>
              ) : info ? (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Not serviceable yet
                </p>
              ) : null}
            </div>
          )}
        </div>

        <Input
          label="City"
          required
          value={value.city}
          onChange={set('city')}
          error={errors[`${prefix}.city`]}
          placeholder="Bengaluru"
        />
        <Input
          label="State"
          value={value.state ?? ''}
          onChange={set('state')}
          placeholder="Karnataka"
        />
      </div>
    </div>
  );
}

function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; hint: string }>;
}) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
              value === option.value
                ? 'border-brand-400 bg-brand-50 shadow-sm'
                : 'border-ink-200 bg-white hover:border-brand-200'
            }`}
          >
            <span
              className={`block text-sm font-bold ${
                value === option.value ? 'text-brand-700' : 'text-ink-800'
              }`}
            >
              {option.label}
            </span>
            <span className="mt-0.5 block text-[11px] leading-tight text-ink-500">
              {option.hint}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
