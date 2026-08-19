/**
 * API client.
 *
 * One axios instance with two interceptors:
 *   • request  — attaches the access token,
 *   • response — unwraps the { success, data } envelope, and transparently
 *                refreshes an expired session exactly once before retrying.
 *
 * The refresh is de-duplicated: if six queries expire at the same moment they
 * all await the same in-flight refresh rather than racing to rotate the token
 * six times (which, with rotation, would invalidate five of them).
 */
import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import type {
  AgentProfile,
  ApiErrorShape,
  Area,
  AssignmentDecision,
  AssignmentRecord,
  AuthResult,
  CodRule,
  CreateOrderInput,
  Dashboard,
  Meta,
  NotificationRecord,
  Order,
  OrderFilters,
  OrderStatus,
  Pagination,
  PricingSettings,
  PublicTracking,
  Quote,
  QuoteInput,
  RateCard,
  Serviceability,
  User,
  Zone,
} from './types';

const ACCESS_KEY = 'swiftroute.accessToken';
const REFRESH_KEY = 'swiftroute.refreshToken';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/** A thrown API failure, carrying the server's stable error code. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: ApiErrorShape['details'],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level messages from a 422, keyed by form field name. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const field of this.details?.fields ?? []) out[field.path] = field.message;
    return out;
  }
}

const http: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Shared promise so concurrent 401s trigger exactly one refresh. */
let refreshInFlight: Promise<string> | null = null;

async function refreshSession(): Promise<string> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) throw new ApiError('UNAUTHORIZED', 'No active session.', 401);

  const response = await axios.post<{ data: AuthResult }>(
    `${http.defaults.baseURL}/auth/refresh`,
    { refreshToken },
    { headers: { 'Content-Type': 'application/json' } },
  );

  const result = response.data.data;
  tokenStore.set(result.accessToken, result.refreshToken);
  return result.accessToken;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: ApiErrorShape }>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status ?? 0;

    const isAuthRoute = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');

    if (status === 401 && original && !original._retried && !isAuthRoute && tokenStore.refresh) {
      original._retried = true;
      try {
        refreshInFlight ??= refreshSession().finally(() => {
          refreshInFlight = null;
        });
        const token = await refreshInFlight;
        original.headers.Authorization = `Bearer ${token}`;
        return http(original);
      } catch {
        tokenStore.clear();
        // Let the router send them to the login screen; a hard redirect here
        // would wipe any unsaved form state.
        window.dispatchEvent(new CustomEvent('swiftroute:session-expired'));
      }
    }

    const payload = error.response?.data?.error;

    throw new ApiError(
      payload?.code ?? (error.code === 'ECONNABORTED' ? 'TIMEOUT' : 'NETWORK_ERROR'),
      payload?.message ??
        (status === 0
          ? 'Cannot reach the SwiftRoute API. Is the server running?'
          : error.message || 'Something went wrong.'),
      status,
      payload?.details,
    );
  },
);

/** Unwrap `{ success, data }`. */
async function unwrap<T>(promise: Promise<{ data: { data: T } }>): Promise<T> {
  return (await promise).data.data;
}

/** Unwrap a paginated list, keeping the pagination block. */
async function unwrapList<T>(
  promise: Promise<{ data: { data: T[]; pagination?: Pagination } }>,
): Promise<{ items: T[]; pagination: Pagination }> {
  const response = (await promise).data;
  return {
    items: response.data,
    pagination:
      response.pagination ?? {
        page: 1,
        pageSize: response.data.length,
        total: response.data.length,
        totalPages: 1,
      },
  };
}

/** Drop empty strings so they never reach the API as filters. */
function clean(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null),
  );
}

// ===========================================================================
//  Endpoints
// ===========================================================================

export const api = {
  meta: () => unwrap<Meta>(http.get('/meta')),
  health: () => unwrap<Record<string, unknown>>(http.get('/health')),

  auth: {
    register: (body: {
      email: string;
      password: string;
      fullName: string;
      phone?: string;
      companyName?: string;
    }) => unwrap<AuthResult>(http.post('/auth/register', body)),

    login: (email: string, password: string) =>
      unwrap<AuthResult>(http.post('/auth/login', { email, password })),

    me: () => unwrap<User>(http.get('/auth/me')),

    logout: () => http.post('/auth/logout', { refreshToken: tokenStore.refresh }),

    changePassword: (currentPassword: string, newPassword: string) =>
      unwrap<{ message: string }>(http.post('/auth/change-password', { currentPassword, newPassword })),
  },

  pricing: {
    quote: (body: QuoteInput) => unwrap<Quote>(http.post('/pricing/quote', body)),
    settings: () => unwrap<PricingSettings>(http.get('/pricing/settings')),
    updateSettings: (body: Partial<PricingSettings>) =>
      unwrap<PricingSettings>(http.put('/pricing/settings', body)),

    rateCards: () => unwrap<RateCard[]>(http.get('/pricing/rate-cards')),
    createRateCard: (body: Partial<RateCard>) =>
      unwrap<RateCard>(http.post('/pricing/rate-cards', body)),
    updateRateCard: (id: string, body: Partial<RateCard>) =>
      unwrap<RateCard>(http.put(`/pricing/rate-cards/${id}`, body)),
    deleteRateCard: (id: string) => unwrap<unknown>(http.delete(`/pricing/rate-cards/${id}`)),

    codRules: () => unwrap<CodRule[]>(http.get('/pricing/cod-rules')),
    createCodRule: (body: Partial<CodRule>) => unwrap<CodRule>(http.post('/pricing/cod-rules', body)),
    updateCodRule: (id: string, body: Partial<CodRule>) =>
      unwrap<CodRule>(http.put(`/pricing/cod-rules/${id}`, body)),
    deleteCodRule: (id: string) => unwrap<unknown>(http.delete(`/pricing/cod-rules/${id}`)),
  },

  zones: {
    list: () => unwrap<Zone[]>(http.get('/zones')),
    get: (id: string) => unwrap<Zone>(http.get(`/zones/${id}`)),
    create: (body: Partial<Zone>) => unwrap<Zone>(http.post('/zones', body)),
    update: (id: string, body: Partial<Zone>) => unwrap<Zone>(http.put(`/zones/${id}`, body)),
    remove: (id: string) => unwrap<unknown>(http.delete(`/zones/${id}`)),

    areas: () => unwrap<Area[]>(http.get('/zones/areas/all')),
    createArea: (body: Partial<Area>) => unwrap<Area>(http.post('/zones/areas', body)),
    updateArea: (id: string, body: Partial<Area>) => unwrap<Area>(http.put(`/zones/areas/${id}`, body)),
    removeArea: (id: string) => unwrap<unknown>(http.delete(`/zones/areas/${id}`)),

    serviceability: (pincode: string) =>
      unwrap<Serviceability>(http.get(`/zones/serviceability/${pincode}`)),
  },

  orders: {
    list: (filters: OrderFilters = {}) =>
      unwrapList<Order>(http.get('/orders', { params: clean(filters as Record<string, unknown>) })),
    get: (id: string) => unwrap<Order>(http.get(`/orders/${id}`)),
    create: (body: CreateOrderInput) => unwrap<Order>(http.post('/orders', body)),

    changeStatus: (
      id: string,
      body: {
        status: OrderStatus;
        notes?: string;
        failureReason?: string;
        lat?: number;
        lng?: number;
        override?: boolean;
      },
    ) => unwrap<Order>(http.patch(`/orders/${id}/status`, body)),

    assign: (id: string, agentId: string, reason?: string) =>
      unwrap<Order>(http.post(`/orders/${id}/assign`, { agentId, reason })),
    autoAssign: (id: string) => unwrap<Order>(http.post(`/orders/${id}/auto-assign`)),
    assignmentPreview: (id: string) =>
      unwrap<AssignmentDecision>(http.get(`/orders/${id}/assignment-preview`)),
    assignments: (id: string) => unwrap<AssignmentRecord[]>(http.get(`/orders/${id}/assignments`)),

    reschedule: (id: string, newDate: string, reason?: string) =>
      unwrap<Order>(http.post(`/orders/${id}/reschedule`, { newDate, reason })),
    cancel: (id: string, reason?: string) => unwrap<Order>(http.post(`/orders/${id}/cancel`, { reason })),
  },

  agents: {
    list: (params: { availability?: string; zoneId?: string } = {}) =>
      unwrap<AgentProfile[]>(http.get('/agents', { params: clean(params) })),
    me: () => unwrap<AgentProfile>(http.get('/agents/me')),
    setAvailability: (availability: string) =>
      unwrap<AgentProfile>(http.patch('/agents/me/availability', { availability })),
    ping: (lat: number, lng: number) => unwrap<unknown>(http.post('/agents/me/location', { lat, lng })),
    update: (id: string, body: Record<string, unknown>) =>
      unwrap<AgentProfile>(http.put(`/agents/${id}`, body)),
    workload: (id: string) => unwrap<Order[]>(http.get(`/agents/${id}/workload`)),
  },

  users: {
    list: (params: { role?: string; search?: string; page?: number; pageSize?: number } = {}) =>
      unwrapList<User>(http.get('/users', { params: clean(params) })),
    create: (body: Record<string, unknown>) => unwrap<User>(http.post('/users', body)),
    update: (id: string, body: Record<string, unknown>) => unwrap<User>(http.put(`/users/${id}`, body)),
    lookupCustomers: (q: string) =>
      unwrap<Array<Pick<User, 'id' | 'fullName' | 'email' | 'phone' | 'companyName'>>>(
        http.get('/users/customers/lookup', { params: { q } }),
      ),
  },

  notifications: {
    list: (params: { orderId?: string; channel?: string; status?: string; page?: number } = {}) =>
      unwrapList<NotificationRecord>(http.get('/notifications', { params: clean(params) })),
    get: (id: string) => unwrap<NotificationRecord>(http.get(`/notifications/${id}`)),
    transports: () => unwrap<Record<string, unknown>>(http.get('/notifications/transports')),
    retry: () => unwrap<{ retried: number }>(http.post('/notifications/retry')),
  },

  tracking: {
    byCode: (code: string) => unwrap<PublicTracking>(http.get(`/tracking/${code}`)),
  },

  analytics: {
    dashboard: () => unwrap<Dashboard>(http.get('/analytics/dashboard')),
  },
};

export default api;
