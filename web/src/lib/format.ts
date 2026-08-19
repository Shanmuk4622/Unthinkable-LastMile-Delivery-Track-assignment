/**
 * Presentation helpers: money, dates, weights and the per-status colour system.
 *
 * The colour map is the reason a shipment "feels" the same colour everywhere —
 * badge, timeline node, progress rail, chart series — instead of each component
 * inventing its own.
 */
import type { AgentAvailability, OrderStatus } from './types';

// ---------------------------------------------------------------------------
//  Numbers
// ---------------------------------------------------------------------------

export function money(amount: number | null | undefined, currency = 'INR'): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Compact form for dashboard tiles: ₹1.2L, ₹86.4k. */
export function moneyCompact(amount: number, currency = 'INR'): string {
  if (Math.abs(amount) >= 100000) return `${symbolFor(currency)}${(amount / 100000).toFixed(2)}L`;
  if (Math.abs(amount) >= 1000) return `${symbolFor(currency)}${(amount / 1000).toFixed(1)}k`;
  return money(amount, currency);
}

function symbolFor(currency: string): string {
  return currency === 'INR' ? '₹' : `${currency} `;
}

export function number(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function kg(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${Number(value.toFixed(3))} kg`;
}

export function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${Math.round(value)}%`;
}

// ---------------------------------------------------------------------------
//  Dates
// ---------------------------------------------------------------------------

export function dateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function dateOnly(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function timeOnly(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** "3 hours ago", "in 2 days". */
export function relative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const then = new Date(value).getTime();
  const diffSeconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  for (const [unit, seconds] of units) {
    if (abs >= seconds) return formatter.format(Math.round(diffSeconds / seconds), unit);
  }
  return formatter.format(diffSeconds, 'second');
}

/** `yyyy-mm-dd` for <input type="date">. */
export function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function todayInput(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
//  Colour system
// ---------------------------------------------------------------------------

export interface StatusStyle {
  /** Badge / chip classes. */
  badge: string;
  /** Solid fill for timeline nodes and progress bars. */
  solid: string;
  /** Tinted panel background. */
  soft: string;
  /** Text-only colour. */
  text: string;
  /** Border colour. */
  border: string;
  /** Hex, for Recharts and SVG. */
  hex: string;
}

export const STATUS_STYLES: Record<OrderStatus, StatusStyle> = {
  PENDING: {
    badge: 'bg-slate-100 text-slate-700',
    solid: 'bg-slate-400',
    soft: 'bg-slate-50',
    text: 'text-slate-600',
    border: 'border-slate-200',
    hex: '#64748b',
  },
  CONFIRMED: {
    badge: 'bg-violet-100 text-violet-700',
    solid: 'bg-violet-500',
    soft: 'bg-violet-50',
    text: 'text-violet-600',
    border: 'border-violet-200',
    hex: '#8b5cf6',
  },
  ASSIGNED: {
    badge: 'bg-blue-100 text-blue-700',
    solid: 'bg-blue-500',
    soft: 'bg-blue-50',
    text: 'text-blue-600',
    border: 'border-blue-200',
    hex: '#3b82f6',
  },
  PICKED_UP: {
    badge: 'bg-cyan-100 text-cyan-700',
    solid: 'bg-cyan-500',
    soft: 'bg-cyan-50',
    text: 'text-cyan-600',
    border: 'border-cyan-200',
    hex: '#06b6d4',
  },
  IN_TRANSIT: {
    badge: 'bg-indigo-100 text-indigo-700',
    solid: 'bg-indigo-500',
    soft: 'bg-indigo-50',
    text: 'text-indigo-600',
    border: 'border-indigo-200',
    hex: '#6366f1',
  },
  OUT_FOR_DELIVERY: {
    badge: 'bg-amber-100 text-amber-800',
    solid: 'bg-amber-500',
    soft: 'bg-amber-50',
    text: 'text-amber-600',
    border: 'border-amber-200',
    hex: '#f59e0b',
  },
  DELIVERED: {
    badge: 'bg-emerald-100 text-emerald-700',
    solid: 'bg-emerald-500',
    soft: 'bg-emerald-50',
    text: 'text-emerald-600',
    border: 'border-emerald-200',
    hex: '#10b981',
  },
  FAILED: {
    badge: 'bg-rose-100 text-rose-700',
    solid: 'bg-rose-500',
    soft: 'bg-rose-50',
    text: 'text-rose-600',
    border: 'border-rose-200',
    hex: '#f43f5e',
  },
  RESCHEDULED: {
    badge: 'bg-orange-100 text-orange-700',
    solid: 'bg-orange-500',
    soft: 'bg-orange-50',
    text: 'text-orange-600',
    border: 'border-orange-200',
    hex: '#f97316',
  },
  CANCELLED: {
    badge: 'bg-zinc-200 text-zinc-600',
    solid: 'bg-zinc-400',
    soft: 'bg-zinc-50',
    text: 'text-zinc-500',
    border: 'border-zinc-200',
    hex: '#a1a1aa',
  },
};

export const AVAILABILITY_STYLES: Record<
  AgentAvailability,
  { badge: string; dot: string; label: string }
> = {
  AVAILABLE: { badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', label: 'Available' },
  BUSY: { badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500', label: 'Busy' },
  ON_BREAK: { badge: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500', label: 'On break' },
  OFFLINE: { badge: 'bg-ink-100 text-ink-500', dot: 'bg-ink-400', label: 'Offline' },
};

/** Fallback label when the server's statusMeta has not loaded yet. */
export function statusLabel(status: OrderStatus): string {
  return status
    .toLowerCase()
    .split('_')
    .map((word, i) => (i === 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/** Categorical palette for charts — distinguishable and on-brand. */
export const CHART_COLORS = [
  '#7c3aed',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#6366f1',
  '#14b8a6',
  '#f43f5e',
];

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Deterministic avatar gradient, so a person keeps the same colour. */
export function avatarGradient(seed: string): string {
  const palettes = [
    'from-violet-500 to-fuchsia-500',
    'from-sky-500 to-indigo-500',
    'from-emerald-500 to-teal-500',
    'from-amber-500 to-orange-500',
    'from-rose-500 to-pink-500',
    'from-cyan-500 to-blue-500',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palettes[hash % palettes.length];
}
