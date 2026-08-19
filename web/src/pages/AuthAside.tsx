/**
 * The decorative half of the sign-in / sign-up split screen.
 * Hidden below `lg` so small screens get a clean, focused form.
 */
import { Link } from 'react-router-dom';
import { BadgeCheck, Gauge, History, MapPinned } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';

const POINTS = [
  { icon: MapPinned, text: 'Pincode-level zone detection across every serviceable area' },
  { icon: Gauge, text: 'Dispatch that weighs distance, zone, workload and track record' },
  { icon: History, text: 'An append-only trail of who changed what, and when' },
  { icon: BadgeCheck, text: 'A quote you can read line by line before you confirm' },
];

export function AuthAside() {
  return (
    <div className="relative hidden overflow-hidden bg-route lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div className="blob left-[-15%] top-[-10%] h-80 w-80 animate-float bg-white/20" />
      <div
        className="blob bottom-[-10%] right-[-10%] h-96 w-96 animate-float bg-white/10"
        style={{ animationDelay: '2s' }}
      />

      <div className="relative">
        <Link to="/" aria-label="SwiftRoute home">
          <Logo to={null} inverted />
        </Link>
      </div>

      <div className="relative max-w-md">
        <h2 className="text-4xl font-extrabold leading-tight tracking-tight text-white">
          Logistics rules,
          <br />
          finally legible.
        </h2>
        <p className="mt-5 leading-relaxed text-white/80">
          Complex pricing, dynamic assignment and reliable customer communication — modelled the way
          a real operation works, not the way a demo pretends it does.
        </p>

        <ul className="mt-10 space-y-4">
          {POINTS.map((point) => (
            <li key={point.text} className="flex items-start gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15 text-white backdrop-blur">
                <point.icon className="h-4 w-4" />
              </span>
              <span className="text-sm leading-relaxed text-white/90">{point.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-xs text-white/60">
        SwiftRoute · Last-Mile Delivery Tracker
      </p>
    </div>
  );
}
