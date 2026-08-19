/**
 * The authenticated layout: a colour-coded sidebar whose contents are derived
 * from the signed-in role, plus a sticky top bar.
 *
 * One shell serves all three personas rather than three near-identical
 * layouts — the navigation model is the only thing that actually differs.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  BarChart3,
  Bell,
  ChevronDown,
  ClipboardList,
  Coins,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  PackagePlus,
  Search,
  Truck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { avatarGradient } from '@/lib/format';
import { Avatar } from '@/components/ui';
import { Logo } from './Logo';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: Record<string, { section: string; items: NavItem[] }[]> = {
  CUSTOMER: [
    {
      section: 'Shipping',
      items: [
        { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/app/new', label: 'Book a pickup', icon: PackagePlus },
        { to: '/app/orders', label: 'My orders', icon: ClipboardList },
      ],
    },
    {
      section: 'Account',
      items: [{ to: '/app/notifications', label: 'Notifications', icon: Bell }],
    },
  ],
  AGENT: [
    {
      section: 'Today',
      items: [
        { to: '/agent', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/agent/deliveries', label: 'My deliveries', icon: Truck },
      ],
    },
  ],
  ADMIN: [
    {
      section: 'Operations',
      items: [
        { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/admin/orders', label: 'All orders', icon: ClipboardList },
        { to: '/admin/new', label: 'Create order', icon: PackagePlus },
        { to: '/admin/agents', label: 'Delivery agents', icon: Truck },
      ],
    },
    {
      section: 'Configuration',
      items: [
        { to: '/admin/zones', label: 'Zones & areas', icon: Map },
        { to: '/admin/pricing', label: 'Rate cards', icon: Coins },
        { to: '/admin/users', label: 'Users', icon: Users },
      ],
    },
    {
      section: 'Insight',
      items: [
        { to: '/admin/notifications', label: 'Notification outbox', icon: Bell },
        { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
      ],
    },
  ],
};

const ROLE_THEME: Record<string, { label: string; badge: string; accent: string }> = {
  CUSTOMER: { label: 'Customer', badge: 'bg-brand-100 text-brand-700', accent: 'bg-route' },
  AGENT: {
    label: 'Delivery agent',
    badge: 'bg-cyan-100 text-cyan-700',
    accent: 'bg-gradient-to-br from-cyan-500 to-blue-600',
  },
  ADMIN: {
    label: 'Operations',
    badge: 'bg-amber-100 text-amber-700',
    accent: 'bg-gradient-to-br from-amber-500 to-rose-500',
  },
};

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Navigating on a phone should close the drawer.
  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  if (!user) return null;

  const groups = NAV[user.role] ?? [];
  const theme = ROLE_THEME[user.role];

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-ink-50">
      {/* ---------------- sidebar ---------------- */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-ink-200 bg-white transition-transform duration-200 lg:translate-x-0',
          mobileOpen ? 'translate-x-0 shadow-lift' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-ink-100 px-5">
          <Logo />
          <button
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {groups.map((group) => (
            <div key={group.section}>
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-ink-400">
                {group.section}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      clsx(
                        'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all',
                        isActive
                          ? 'bg-brand-50 text-brand-700 shadow-sm'
                          : 'text-ink-500 hover:bg-ink-50 hover:text-ink-900',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          className={clsx(
                            'h-4.5 w-4.5 shrink-0 transition-colors',
                            isActive ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-600',
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                        {isActive && (
                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-500" />
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Public tracking is reachable from inside the app too — staff use it
            to see exactly what a customer sees. */}
        <div className="border-t border-ink-100 p-3">
          <Link
            to="/track"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            <Search className="h-4.5 w-4.5 text-ink-400" />
            Public tracking
          </Link>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink-900/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ---------------- main ---------------- */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-200 bg-white/85 px-4 backdrop-blur-xl sm:px-6">
          <button
            className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink-900">
              {greeting()}, {user.fullName.split(' ')[0]}
            </p>
            <p className="truncate text-xs text-ink-400">
              {new Date().toLocaleDateString('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </p>
          </div>

          <span className={clsx('badge hidden sm:inline-flex', theme.badge)}>{theme.label}</span>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-xl p-1 transition-colors hover:bg-ink-100"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Avatar name={user.fullName} gradient={avatarGradient(user.id)} size="sm" />
              <ChevronDown className="h-4 w-4 text-ink-400" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-2 w-60 animate-fade-up overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-lift">
                  <div className="border-b border-ink-100 px-4 py-3">
                    <p className="truncate text-sm font-bold text-ink-900">{user.fullName}</p>
                    <p className="truncate text-xs text-ink-500">{user.email}</p>
                    {user.companyName && (
                      <p className="mt-1 truncate text-[11px] font-medium text-brand-600">
                        {user.companyName}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Shared page heading used at the top of every screen. */
export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-500">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
