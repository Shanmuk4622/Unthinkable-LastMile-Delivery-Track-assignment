/**
 * Self-service sign-up.
 *
 * Only ever creates a CUSTOMER — agent and admin accounts are provisioned by an
 * administrator, which is enforced server-side too.
 */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Building2, Eye, EyeOff, Lock, Mail, Phone, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';
import { AuthAside } from './AuthAside';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    companyName: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((previous) => ({ ...previous, [key]: event.target.value }));
    setErrors((previous) => ({ ...previous, [key]: '' }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBanner(null);
    setErrors({});
    setSubmitting(true);

    try {
      const user = await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        companyName: form.companyName.trim() || undefined,
      });
      toast.success(`Welcome to SwiftRoute, ${user.fullName.split(' ')[0]}!`);
      navigate('/app', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fieldErrors = caught.fieldErrors;
        if (Object.keys(fieldErrors).length) setErrors(fieldErrors);
        else setBanner(caught.message);
      } else {
        setBanner('Could not create your account. Please try again.');
      }
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

          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Free to start. Get an instant quote on your first pickup.
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
            <Input
              label="Full name"
              required
              autoComplete="name"
              value={form.fullName}
              onChange={set('fullName')}
              error={errors.fullName}
              placeholder="Ananya Rao"
              prefix={<User className="h-4 w-4" />}
              className="pl-9"
            />

            <Input
              label="E-mail address"
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={set('email')}
              error={errors.email}
              placeholder="you@company.com"
              prefix={<Mail className="h-4 w-4" />}
              className="pl-9"
            />

            <Input
              label="Phone"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={set('phone')}
              error={errors.phone}
              placeholder="+91 98450 12345"
              hint="Used for delivery SMS updates"
              prefix={<Phone className="h-4 w-4" />}
              className="pl-9"
            />

            <Input
              label="Company"
              value={form.companyName}
              onChange={set('companyName')}
              error={errors.companyName}
              placeholder="Optional — for B2B shipping"
              prefix={<Building2 className="h-4 w-4" />}
              className="pl-9"
            />

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={form.password}
                onChange={set('password')}
                error={errors.password}
                placeholder="At least 8 characters"
                hint="Needs one letter and one number"
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

            {banner && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-700">
                {banner}
              </div>
            )}

            <Button type="submit" full loading={submitting} className="py-3">
              Create account
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-500">
            Already have an account?{' '}
            <Link to="/login" className="link">
              Sign in
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
