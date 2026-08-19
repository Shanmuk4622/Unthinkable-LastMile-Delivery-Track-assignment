/**
 * Session state.
 *
 * The access token is the source of truth for "am I signed in", but the user
 * object is what the UI actually renders, so both live here and are refreshed
 * together. On mount we re-validate the stored token against /auth/me rather
 * than trusting a cached user blob — roles can change server-side.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, tokenStore } from '@/lib/api';
import type { Role, User } from '@/lib/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  role: Role | null;
  login: (email: string, password: string) => Promise<User>;
  register: (input: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    companyName?: string;
  }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!tokenStore.access) {
      setUser(null);
      return;
    }
    try {
      setUser(await api.auth.me());
    } catch {
      tokenStore.clear();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  // The API client fires this when a refresh token is finally rejected.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('swiftroute:session-expired', onExpired);
    return () => window.removeEventListener('swiftroute:session-expired', onExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.auth.login(email, password);
    tokenStore.set(result.accessToken, result.refreshToken);
    setUser(result.user);
    return result.user;
  }, []);

  const register = useCallback(
    async (input: {
      email: string;
      password: string;
      fullName: string;
      phone?: string;
      companyName?: string;
    }) => {
      const result = await api.auth.register(input);
      tokenStore.set(result.accessToken, result.refreshToken);
      setUser(result.user);
      return result.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Signing out must succeed locally even if the network call does not.
    }
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      role: user?.role ?? null,
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, loading, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}

/** The landing route for each role after signing in. */
// eslint-disable-next-line react-refresh/only-export-components
export function homeFor(role: Role | null | undefined): string {
  switch (role) {
    case 'ADMIN':
      return '/admin';
    case 'AGENT':
      return '/agent';
    case 'CUSTOMER':
      return '/app';
    default:
      return '/';
  }
}
