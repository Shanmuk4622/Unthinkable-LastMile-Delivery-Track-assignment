/**
 * Marketing landing page.
 *
 * Doubles as the reviewer's front door: the demo credentials are one click
 * away, and the "how pricing works" section explains the rate engine in the
 * product itself rather than only in the README.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Boxes,
  Building2,
  Calculator,
  Clock3,
  Copy,
  Gauge,
  History,
  Layers,
  MapPinned,
  Package,
  Search,
  ShieldCheck,
  Truck,
  Users,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui';

const FEATURES = [
  {
    icon: Calculator,
    title: 'Explainable rate engine',
    body: 'Volumetric weight, zone pair, B2B/B2C rate card and COD surcharge — every rupee is shown with the arithmetic that produced it. Nothing is hardcoded; admins own every number.',
    gradient: 'from-violet-500 to-fuchsia-500',
  },
  {
    icon: MapPinned,
    title: 'Pincode-level zone detection',
    body: 'A serviceability table maps each pincode to an operational zone, so detection is a single indexed lookup and operations staff can onboard a locality without a GIS tool.',
    gradient: 'from-sky-500 to-blue-600',
  },
  {
    icon: Gauge,
    title: 'Weighted agent dispatch',
    body: 'Proximity, zone familiarity, current workload and delivery record are scored together — then the full ranked shortlist is stored, so every automatic decision can be explained.',
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    icon: History,
    title: 'Immutable tracking history',
    body: 'Every status change appends one row recording who, what, when and why. There is no update or delete path anywhere in the API — the timeline is append-only by construction.',
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    icon: Bell,
    title: 'Multi-channel notifications',
    body: 'E-mail on every status change and SMS at the moments that matter, written through a transactional outbox so a slow mail server can never roll back a delivery.',
    gradient: 'from-rose-500 to-pink-600',
  },
  {
    icon: History,
    title: 'Failed-delivery recovery',
    body: 'A failed attempt flags the order, notifies the customer and releases the agent. The customer picks a new date and the dispatcher runs again — excluding the agent who just failed.',
    gradient: 'from-indigo-500 to-purple-600',
  },
];

const DEMO_ACCOUNTS = [
  {
    role: 'Operations admin',
    email: 'admin@swiftroute.dev',
    password: 'Admin@123',
    blurb: 'Zones, rate cards, dispatch, every order.',
    icon: ShieldCheck,
    gradient: 'from-amber-500 to-rose-500',
  },
  {
    role: 'Customer',
    email: 'customer@swiftroute.dev',
    password: 'Demo@123',
    blurb: 'Book a pickup, watch the price build up live.',
    icon: Package,
    gradient: 'from-violet-500 to-fuchsia-500',
  },
  {
    role: 'Delivery agent',
    email: 'agent@swiftroute.dev',
    password: 'Demo@123',
    blurb: 'Run the delivery ladder, mark a failure.',
    icon: Truck,
    gradient: 'from-cyan-500 to-blue-600',
  },
];

const PIPELINE = [
  { icon: Package, label: 'Order placed', tint: 'text-violet-600 bg-violet-100' },
  { icon: Calculator, label: 'Priced', tint: 'text-fuchsia-600 bg-fuchsia-100' },
  { icon: Users, label: 'Agent matched', tint: 'text-blue-600 bg-blue-100' },
  { icon: Truck, label: 'In transit', tint: 'text-indigo-600 bg-indigo-100' },
  { icon: BadgeCheck, label: 'Delivered', tint: 'text-emerald-600 bg-emerald-100' },
];

export default function Landing() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');

  const track = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      toast.error('Enter a tracking number first.');
      return;
    }
    navigate(`/track/${encodeURIComponent(trimmed)}`);
  };

  const copyCredentials = async (email: string, password: string) => {
    try {
      await navigator.clipboard.writeText(`${email} / ${password}`);
      toast.success('Credentials copied');
    } catch {
      toast.error('Could not access the clipboard — copy them manually.');
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* ================= nav ================= */}
      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo to={null} />
          <nav className="hidden items-center gap-7 text-sm font-semibold text-ink-600 md:flex">
            <a href="#features" className="transition-colors hover:text-brand-600">
              Platform
            </a>
            <a href="#pricing-engine" className="transition-colors hover:text-brand-600">
              Rate engine
            </a>
            <a href="#demo" className="transition-colors hover:text-brand-600">
              Try it
            </a>
            <Link to="/track" className="transition-colors hover:text-brand-600">
              Track
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="btn-ghost hidden sm:inline-flex">
              Sign in
            </Link>
            <Link to="/register" className="btn-primary">
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* ================= hero ================= */}
      <section className="relative overflow-hidden bg-mesh">
        <div className="blob left-[-8%] top-[-10%] h-80 w-80 animate-float bg-brand-300/40" />
        <div
          className="blob right-[-6%] top-[10%] h-72 w-72 animate-float bg-surf-300/40"
          style={{ animationDelay: '1.4s' }}
        />
        <div
          className="blob bottom-[-14%] left-[35%] h-72 w-72 animate-float bg-pink-300/30"
          style={{ animationDelay: '2.6s' }}
        />

        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="mx-auto max-w-3xl text-center"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-brand-700 shadow-sm backdrop-blur">
              <Zap className="h-3.5 w-3.5" />
              Last-mile delivery management
            </span>

            <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight text-ink-900 sm:text-6xl">
              Price it right.
              <br />
              <span className="text-gradient">Dispatch it smart.</span>
              <br />
              Track every step.
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-ink-600 sm:text-lg">
              SwiftRoute turns messy logistics rules into one dependable flow — a zone-aware pricing
              engine your ops team controls, dispatch that picks the genuinely best agent, and an
              audit trail that never lies.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link to="/register" className="btn-primary px-6 py-3 text-base">
                Book your first pickup
                <ArrowRight className="h-4.5 w-4.5" />
              </Link>
              <a href="#demo" className="btn-secondary px-6 py-3 text-base">
                Explore the demo
              </a>
            </div>

            {/* tracking box */}
            <form
              onSubmit={track}
              className="mx-auto mt-10 flex max-w-md gap-2 rounded-2xl border border-white/70 bg-white/85 p-2 shadow-lift backdrop-blur"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="Track a shipment, e.g. SR-7K3M9QX2"
                  aria-label="Tracking number"
                  className="w-full rounded-xl border-0 bg-transparent py-2.5 pl-9 pr-3 text-sm font-medium text-ink-900 placeholder:text-ink-400 focus:outline-none"
                />
              </div>
              <Button type="submit" size="sm" className="px-4">
                Track
              </Button>
            </form>
          </motion.div>

          {/* pipeline */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.18 }}
            className="mx-auto mt-16 max-w-4xl"
          >
            <div className="card-glass flex flex-wrap items-center justify-center gap-x-2 gap-y-4 p-5 sm:justify-between">
              {PIPELINE.map((step, index) => (
                <div key={step.label} className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-2">
                    <span className={`grid h-11 w-11 place-items-center rounded-xl ${step.tint}`}>
                      <step.icon className="h-5 w-5" />
                    </span>
                    <span className="text-[11px] font-bold text-ink-600">{step.label}</span>
                  </div>
                  {index < PIPELINE.length - 1 && (
                    <svg
                      className="hidden h-4 w-12 shrink-0 text-brand-300 sm:block"
                      viewBox="0 0 48 8"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M0 4h44"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray="6 4"
                        strokeLinecap="round"
                        className="animate-route-dash"
                      />
                      <path d="m42 1 5 3-5 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================= stats ================= */}
      <section className="border-y border-ink-100 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden bg-ink-100 px-4 sm:px-6 md:grid-cols-4">
          {[
            { value: '3', label: 'Role-based personas', icon: Users },
            { value: '10', label: 'Lifecycle states', icon: Layers },
            { value: '2×2', label: 'Rate card matrix', icon: Boxes },
            { value: '4', label: 'Dispatch signals', icon: Gauge },
          ].map((stat) => (
            <div key={stat.label} className="bg-white px-4 py-8 text-center">
              <stat.icon className="mx-auto mb-2 h-5 w-5 text-brand-400" />
              <p className="text-3xl font-extrabold tracking-tight text-gradient">{stat.value}</p>
              <p className="mt-1 text-xs font-semibold text-ink-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= features ================= */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-500">The platform</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
            Six problems, solved properly
          </h2>
          <p className="mt-4 text-ink-600">
            Not a CRUD app with a delivery theme — each piece is modelled the way a real 3PL
            operation actually works.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <motion.article
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.45, delay: index * 0.06 }}
              className="card card-hover p-6"
            >
              <span
                className={`mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${feature.gradient} text-white shadow-sm`}
              >
                <feature.icon className="h-6 w-6" />
              </span>
              <h3 className="text-base font-bold text-ink-900">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{feature.body}</p>
            </motion.article>
          ))}
        </div>
      </section>

      {/* ================= rate engine ================= */}
      <section id="pricing-engine" className="border-y border-ink-100 bg-route-soft py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-brand-500">
                Rate engine
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
                Eight steps, zero magic numbers
              </h2>
              <p className="mt-4 leading-relaxed text-ink-600">
                Everything the engine reads — the volumetric divisor, the slab size, each rate card,
                the COD rule — lives in a table an administrator edits from the UI. Change a number
                and the very next quote reflects it, while every order already placed keeps the
                price snapshot it was created with.
              </p>

              <div className="mt-7 flex flex-wrap gap-2">
                {['B2B / B2C cards', 'Intra vs inter-zone', 'Volumetric weight', 'COD surcharge', 'Lane overrides', 'GST + fuel'].map(
                  (tag) => (
                    <span key={tag} className="chip">
                      <BadgeCheck className="h-3.5 w-3.5 text-brand-500" />
                      {tag}
                    </span>
                  ),
                )}
              </div>
            </div>

            {/* worked example */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-ink-100 bg-white px-5 py-3.5">
                <p className="text-sm font-bold text-ink-800">Worked example</p>
                <span className="badge bg-brand-100 text-brand-700">B2C · inter-zone · COD</span>
              </div>

              <div className="space-y-2.5 p-5 font-mono text-[13px]">
                {[
                  ['Parcel 30 × 20 × 15 cm, 1.2 kg', ''],
                  ['Volumetric = 9000 ÷ 5000', '1.80 kg'],
                  ['Chargeable = max(1.20, 1.80) → slab', '2.00 kg'],
                  ['Base freight (first 0.5 kg)', '₹49.00'],
                  ['3 extra slabs × ₹22', '₹66.00'],
                  ['Fuel surcharge 6%', '₹6.90'],
                  ['COD max(₹40, 1.5% × ₹4,500)', '₹67.50'],
                  ['GST 18% × ₹189.40', '₹34.09'],
                ].map(([label, value], index) => (
                  <div
                    key={label}
                    className={`flex items-center justify-between gap-3 ${
                      index === 0 ? 'pb-2 text-ink-500' : 'text-ink-700'
                    }`}
                  >
                    <span className="min-w-0 truncate">{label}</span>
                    <span className="shrink-0 font-bold tabular-nums text-ink-900">{value}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between bg-route px-5 py-4 text-white">
                <span className="text-xs font-bold uppercase tracking-wider opacity-85">Total</span>
                <span className="font-mono text-xl font-extrabold">₹223.49</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= demo accounts ================= */}
      <section id="demo" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-500">Try it now</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
            Three seeded accounts
          </h2>
          <p className="mt-4 text-ink-600">
            The demo database ships with six zones, 25 serviceable pincodes and a fortnight of
            orders across every status. Sign in as any persona.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {DEMO_ACCOUNTS.map((account) => (
            <div key={account.email} className="card card-hover overflow-hidden">
              <div className={`bg-gradient-to-br ${account.gradient} px-5 py-6 text-white`}>
                <account.icon className="h-7 w-7" />
                <h3 className="mt-3 text-lg font-bold">{account.role}</h3>
                <p className="mt-1 text-sm opacity-90">{account.blurb}</p>
              </div>
              <div className="space-y-3 p-5">
                <div className="rounded-xl bg-ink-50 p-3 font-mono text-xs">
                  <p className="text-ink-700">{account.email}</p>
                  <p className="mt-1 text-ink-500">{account.password}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    icon={<Copy className="h-3.5 w-3.5" />}
                    onClick={() => copyCredentials(account.email, account.password)}
                  >
                    Copy
                  </Button>
                  <Link
                    to="/login"
                    state={{ email: account.email, password: account.password }}
                    className="btn-primary btn-sm flex-1"
                  >
                    Sign in
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ================= cta ================= */}
      <section className="relative overflow-hidden bg-route">
        <div className="blob left-[10%] top-[-40%] h-72 w-72 bg-white/20" />
        <div className="blob bottom-[-50%] right-[8%] h-80 w-80 bg-white/10" />

        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <Clock3 className="mx-auto h-10 w-10 text-white/80" />
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Ready in under a minute
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/85">
            Create an account, enter two pincodes and a box size, and watch the charge assemble
            itself line by line before you confirm.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/register"
              className="btn bg-white px-6 py-3 text-base text-brand-700 hover:bg-white/90"
            >
              Create a free account
              <ArrowRight className="h-4.5 w-4.5" />
            </Link>
            <Link
              to="/track"
              className="btn border border-white/40 px-6 py-3 text-base text-white hover:bg-white/10"
            >
              Track a shipment
            </Link>
          </div>
        </div>
      </section>

      {/* ================= footer ================= */}
      <footer className="border-t border-ink-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-6">
          <Logo to={null} size="sm" />
          <p className="text-xs text-ink-400">
            Built for the Unthinkable last-mile delivery assignment · Node · Express · Prisma ·
            React
          </p>
          <div className="flex items-center gap-4 text-xs font-semibold text-ink-500">
            <Link to="/track" className="transition-colors hover:text-brand-600">
              Track
            </Link>
            <Link to="/login" className="transition-colors hover:text-brand-600">
              Sign in
            </Link>
            <a
              href="https://github.com/Shanmuk4622/Unthinkable-LastMile-Delivery-Track-assignment"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 transition-colors hover:text-brand-600"
            >
              <Building2 className="h-3.5 w-3.5" />
              Source
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
