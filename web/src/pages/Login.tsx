/**
 * Sign in.
 *
 * The demo-account buttons on the landing page navigate here with credentials
 * in router state, which pre-fills the form — a reviewer never has to type or
 * remember a password.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck, Package, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { homeFor, useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';
import { AuthAside } from './AuthAside';

const QUICK_FILL = [
  { label: 'Admin', email: 'admin@swiftroute.dev', password: 'Admin@123', icon: ShieldCheck },
  { label: 'Customer', email: 'customer@swiftroute.dev', password: 'Demo@123', icon: Package },
  { label: 'Agent', email: 'agent@swiftroute.dev', password: 'Demo@123', icon: Truck },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const prefill = (location.state ?? {}) as { email?: string; password?: string; from?: string };

  const [email, setEmail] = useState(prefill.email ?? '');
  const [password, setPassword] = useState(prefill.password ?? '');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prefill.email) setEmail(prefill.email);
    if (prefill.password) setPassword(prefill.password);
  }, [prefill.email, prefill.password]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const user = await login(email, password);
      toast.success(`Welcome back, ${user.fullName.split(' ')[0]}!`);
      navigate(prefill.from ?? homeFor(user.role), { replace: true });
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'Could not sign in. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <AuthAside />

      <div className="flex items-center justify-center bg-white px-4 py-12 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Welcome back</h1>
          <p className="mt-2 text-sm text-ink-500">
            Sign in to book pickups, run dispatch or update deliveries.
          </p>

          {/* one-tap demo fill */}
          <div className="mt-6">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink-400">
              Quick demo sign-in
            </p>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_FILL.map((account) => (
                <button
                  key={account.label}
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                    setError(null);
                  }}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-2 py-3 text-[11px] font-bold text-ink-600 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                >
                  <account.icon className="h-4 w-4" />
                  {account.label}
                </button>
              ))}
            </div>
          </div>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-ink-200" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              or use your details
            </span>
            <span className="h-px flex-1 bg-ink-200" />
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            <Input
              label="E-mail address"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              prefix={<Mail className="h-4 w-4" />}
              className="pl-9"
            />

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                prefix={<Lock className="h-4 w-4" />}
                className="pl-9 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-[38px] text-ink-400 transition-colors hover:text-ink-700"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-700">
                {error}
              </div>
            )}

            <Button type="submit" full loading={submitting} className="py-3">
              Sign in
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-500">
            New to SwiftRoute?{' '}
            <Link to="/register" className="link">
              Create an account
            </Link>
          </p>

          <p className="mt-3 text-center text-sm">
            <Link to="/track" className="text-ink-400 transition-colors hover:text-brand-600">
              Just tracking a parcel?
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
