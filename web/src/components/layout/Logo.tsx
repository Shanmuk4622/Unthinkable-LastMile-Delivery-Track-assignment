import { Link } from 'react-router-dom';
import clsx from 'clsx';

/** The wordmark. `to` is nullable so it can sit inside an already-linked card. */
export function Logo({
  to = '/',
  className,
  size = 'md',
  inverted,
}: {
  to?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  inverted?: boolean;
}) {
  const sizes = {
    sm: { box: 'h-7 w-7', text: 'text-base', bolt: 'h-3.5 w-3.5' },
    md: { box: 'h-9 w-9', text: 'text-lg', bolt: 'h-4.5 w-4.5' },
    lg: { box: 'h-12 w-12', text: 'text-2xl', bolt: 'h-6 w-6' },
  } as const;
  const s = sizes[size];

  const content = (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <span
        className={clsx(
          'grid shrink-0 place-items-center rounded-xl bg-route text-white shadow-glow',
          s.box,
        )}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className={s.bolt} aria-hidden="true">
          <path d="M13.5 2 5 13.2h4.2L7.8 22l8.7-11.6h-4.3z" />
        </svg>
      </span>
      <span
        className={clsx(
          'font-extrabold tracking-tight',
          s.text,
          inverted ? 'text-white' : 'text-ink-900',
        )}
      >
        Swift<span className={inverted ? 'text-white/70' : 'text-gradient'}>Route</span>
      </span>
    </span>
  );

  if (!to) return content;

  return (
    <Link to={to} className="transition-opacity hover:opacity-80" aria-label="SwiftRoute home">
      {content}
    </Link>
  );
}
