/**
 * The UI kit.
 *
 * Small, unopinionated primitives that lean on the component classes in
 * index.css. Everything else in the app is composed from these, which is what
 * keeps spacing, radii and focus rings consistent across ~20 screens.
 */
import {
  forwardRef,
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import clsx from 'clsx';
import { AlertCircle, Loader2, X } from 'lucide-react';

// ---------------------------------------------------------------------------
//  Button
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
  full?: boolean;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  success: 'btn-success',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, full, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        VARIANT_CLASS[variant],
        size === 'sm' && 'btn-sm',
        full && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------------------
//  Form fields
// ---------------------------------------------------------------------------

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, children, className }: FieldProps) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="field-error">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

// `prefix` is a legacy HTML attribute typed as string; ours is a ReactNode
// adornment, so the DOM one is omitted rather than widened.
interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  hint?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  wrapClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, prefix, suffix, className, wrapClassName, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapClassName}>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          className={clsx(
            'input',
            error && 'input-error',
            prefix && 'pl-8',
            suffix && 'pr-12',
            className,
          )}
          {...rest}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-ink-400">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
  wrapClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, options, placeholder, className, wrapClassName, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapClassName}>
      <select ref={ref} className={clsx('select', error && 'input-error', className)} {...rest}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  wrapClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, className, wrapClassName, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapClassName}>
      <textarea
        ref={ref}
        rows={3}
        className={clsx('input resize-y', error && 'input-error', className)}
        {...rest}
      />
    </Field>
  );
});

// ---------------------------------------------------------------------------
//  Surfaces
// ---------------------------------------------------------------------------

export function Card({
  children,
  className,
  hover,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  as?: 'div' | 'section' | 'article';
}) {
  return <Tag className={clsx('card', hover && 'card-hover', className)}>{children}</Tag>;
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold tracking-tight text-ink-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Badge({
  children,
  className,
  dot,
}: {
  children: ReactNode;
  className?: string;
  dot?: string;
}) {
  return (
    <span className={clsx('badge', className)}>
      {dot && <span className={clsx('h-1.5 w-1.5 rounded-full', dot)} />}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
//  Feedback
// ---------------------------------------------------------------------------

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-5 w-5 animate-spin text-brand-500', className)} />;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Spinner className="h-7 w-7" />
      <p className="text-sm font-medium text-ink-500">{label}</p>
    </div>
  );
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={clsx('space-y-3 p-5', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-12 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && (
        <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-route-soft text-brand-500">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-ink-800">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500">
        <AlertCircle className="h-7 w-7" />
      </div>
      <h3 className="text-base font-bold text-ink-800">We hit a snag</h3>
      <p className="mt-1.5 max-w-md text-sm text-ink-500">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  icon,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  const tones = {
    info: 'bg-sky-50 border-sky-200 text-sky-900',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    danger: 'bg-rose-50 border-rose-200 text-rose-900',
  } as const;

  return (
    <div className={clsx('flex gap-3 rounded-xl border p-4 text-sm', tones[tone])}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={clsx(title && 'mt-1', 'leading-relaxed')}>{children}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Modal
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  // Escape closes, and the body must not scroll behind the overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' } as const;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6">
      <div
        className="fixed inset-0 bg-ink-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'relative z-10 w-full animate-fade-up rounded-t-3xl bg-white shadow-lift sm:rounded-3xl',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-ink-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex flex-wrap justify-end gap-3 border-t border-ink-100 bg-ink-50/50 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Misc
// ---------------------------------------------------------------------------

export function Avatar({
  name,
  gradient,
  size = 'md',
}: {
  name: string;
  gradient: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-lg',
  } as const;

  const letters = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span
      className={clsx(
        'grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold text-white shadow-sm',
        gradient,
        sizes[size],
      )}
      title={name}
    >
      {letters}
    </span>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-5 py-3.5">
      <p className="text-xs font-medium text-ink-500">
        Page <span className="text-ink-800">{page}</span> of {totalPages} · {total} record
        {total === 1 ? '' : 's'}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

/** Labelled statistic used across all three dashboards. */
export function StatTile({
  label,
  value,
  sublabel,
  icon,
  gradient = 'from-brand-500 to-surf-500',
  trend,
}: {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  icon?: ReactNode;
  gradient?: string;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <div className="card card-hover relative overflow-hidden p-5">
      <div
        className={clsx(
          'absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br opacity-[.12]',
          gradient,
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-400">{label}</p>
          <p className="mt-2 truncate text-2xl font-extrabold tracking-tight text-ink-900">{value}</p>
          {sublabel && <p className="mt-1 truncate text-xs text-ink-500">{sublabel}</p>}
          {trend && (
            <p
              className={clsx(
                'mt-2 inline-flex rounded-md px-1.5 py-0.5 text-xs font-bold',
                trend.positive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600',
              )}
            >
              {trend.value}
            </p>
          )}
        </div>
        {icon && (
          <span
            className={clsx(
              'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm',
              gradient,
            )}
          >
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}

/** Segmented control used for tabs and filters. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'no-scrollbar inline-flex gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1',
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={clsx(
            'whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
            value === option.value
              ? 'bg-white text-brand-700 shadow-sm'
              : 'text-ink-500 hover:text-ink-800',
          )}
        >
          {option.label}
          {option.count !== undefined && (
            <span
              className={clsx(
                'ml-1.5 rounded px-1 py-0.5 text-[10px]',
                value === option.value ? 'bg-brand-100 text-brand-700' : 'bg-ink-200 text-ink-500',
              )}
            >
              {option.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
