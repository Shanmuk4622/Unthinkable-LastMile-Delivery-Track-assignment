/**
 * Account management.
 *
 * Self-service registration can only ever create a CUSTOMER, so every agent and
 * admin in the system traces back to a deliberate act on this screen. Creating
 * a user with role AGENT provisions their dispatch profile in the same
 * transaction.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ShieldCheck, Truck, UserPlus, Users as UsersIcon } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { api, ApiError } from '@/lib/api';
import { avatarGradient, dateOnly } from '@/lib/format';
import { useDebounced } from '@/hooks/useDebounced';
import { PageHeader } from '@/components/layout/AppShell';
import { AvailabilityBadge } from '@/components/StatusBadge';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Pagination,
  Segmented,
  Select,
  SkeletonRows,
} from '@/components/ui';
import type { AgentAvailability, Role, User, VehicleType, Zone } from '@/lib/types';

const ROLE_STYLE: Record<Role, string> = {
  ADMIN: 'bg-amber-100 text-amber-700',
  AGENT: 'bg-cyan-100 text-cyan-700',
  CUSTOMER: 'bg-violet-100 text-violet-700',
};

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();

  const role = params.get('role') ?? '';
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const debouncedSearch = useDebounced(search, 350);

  const users = useQuery({
    queryKey: ['users', { role, search: debouncedSearch, page }],
    queryFn: () =>
      api.users.list({
        role: role || undefined,
        search: debouncedSearch || undefined,
        page,
        pageSize: 20,
      }),
  });

  const zones = useQuery({ queryKey: ['zones'], queryFn: api.zones.list });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.users.update(id, { isActive }),
    onSuccess: (user) => {
      toast.success(`${user.fullName} ${user.isActive ? 'reactivated' : 'deactivated'}.`);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Update failed.'),
  });

  return (
    <>
      <PageHeader
        eyebrow="Access"
        title="Users"
        subtitle="Customers, delivery agents and operations staff. Elevated roles are created here and nowhere else."
        actions={
          <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            New user
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-4">
          <Segmented
            value={role}
            onChange={(value) => {
              const merged = new URLSearchParams(params);
              if (value) merged.set('role', value);
              else merged.delete('role');
              setParams(merged, { replace: true });
              setPage(1);
            }}
            options={[
              { value: '', label: 'Everyone' },
              { value: 'CUSTOMER', label: 'Customers' },
              { value: 'AGENT', label: 'Agents' },
              { value: 'ADMIN', label: 'Admins' },
            ]}
          />
          <div className="w-full sm:w-64">
            <Input
              placeholder="Search name, e-mail, company…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              prefix={<Search className="h-4 w-4" />}
              className="pl-9"
            />
          </div>
        </div>

        {users.isPending && <SkeletonRows rows={6} />}

        {users.data?.items.length === 0 && (
          <EmptyState
            icon={<UsersIcon className="h-8 w-8" />}
            title="No users match"
            description="Try a different search or role filter."
          />
        )}

        {(users.data?.items.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Contact</th>
                  <th>Details</th>
                  <th>Joined</th>
                  <th className="w-28" />
                </tr>
              </thead>
              <tbody>
                {users.data!.items.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={user.fullName}
                          gradient={avatarGradient(user.id)}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p
                            className={clsx(
                              'truncate text-sm font-bold',
                              user.isActive ? 'text-ink-900' : 'text-ink-400 line-through',
                            )}
                          >
                            {user.fullName}
                          </p>
                          <p className="truncate text-xs text-ink-500">{user.email}</p>
                        </div>
                      </div>
                    </td>

                    <td>
                      <Badge className={ROLE_STYLE[user.role]}>{user.role}</Badge>
                    </td>

                    <td className="text-xs">{user.phone ?? '—'}</td>

                    <td className="text-xs">
                      {user.role === 'AGENT' && user.agentProfile ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <AvailabilityBadge
                            availability={user.agentProfile.availability as AgentAvailability}
                          />
                          <span className="text-ink-500">
                            {user.agentProfile.activeOrderCount}/
                            {user.agentProfile.maxConcurrentOrders}
                          </span>
                        </div>
                      ) : user.companyName ? (
                        <span className="text-ink-600">{user.companyName}</span>
                      ) : user._count ? (
                        <span className="text-ink-500">{user._count.orders} orders</span>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="whitespace-nowrap text-xs text-ink-500">
                      {dateOnly(user.createdAt)}
                    </td>

                    <td>
                      <Button
                        variant={user.isActive ? 'ghost' : 'secondary'}
                        size="sm"
                        onClick={() =>
                          toggleActive.mutate({ id: user.id, isActive: !user.isActive })
                        }
                      >
                        {user.isActive ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {users.data && (
          <Pagination
            page={users.data.pagination.page}
            totalPages={users.data.pagination.totalPages}
            total={users.data.pagination.total}
            onChange={setPage}
          />
        )}
      </Card>

      <CreateUserModal
        open={createOpen}
        zones={zones.data ?? []}
        defaultRole={(role || 'CUSTOMER') as Role}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['users'] });
          void queryClient.invalidateQueries({ queryKey: ['agents'] });
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

function CreateUserModal({
  open,
  zones,
  defaultRole,
  onClose,
  onCreated,
}: {
  open: boolean;
  zones: Zone[];
  defaultRole: Role;
  onClose: () => void;
  onCreated: (user: User) => void;
}) {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    companyName: '',
    role: defaultRole,
    vehicleType: 'BIKE' as VehicleType,
    vehicleNumber: '',
    zoneId: '',
    maxConcurrentOrders: '5',
    availability: 'AVAILABLE' as AgentAvailability,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: () =>
      api.users.create({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        password: form.password,
        companyName: form.companyName.trim() || null,
        role: form.role,
        ...(form.role === 'AGENT'
          ? {
              agent: {
                vehicleType: form.vehicleType,
                vehicleNumber: form.vehicleNumber.trim() || null,
                zoneId: form.zoneId || null,
                maxConcurrentOrders: Number(form.maxConcurrentOrders),
                availability: form.availability,
              },
            }
          : {}),
      }),
    onSuccess: (user) => {
      toast.success(`${user.fullName} created.`);
      setForm({ ...form, fullName: '', email: '', phone: '', password: '', companyName: '' });
      setErrors({});
      onCreated(user);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors;
        if (Object.keys(fields).length) {
          setErrors(fields);
          return;
        }
      }
      toast.error(error instanceof Error ? error.message : 'Could not create the user.');
    },
  });

  const isAgent = form.role === 'AGENT';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a user"
      subtitle="Agent accounts get their dispatch profile provisioned automatically."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={create.isPending} onClick={() => create.mutate()}>
            Create user
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* role picker */}
        <div>
          <p className="label">Role</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                { value: 'CUSTOMER', label: 'Customer', icon: UsersIcon, hint: 'Books shipments' },
                { value: 'AGENT', label: 'Delivery agent', icon: Truck, hint: 'Runs deliveries' },
                { value: 'ADMIN', label: 'Operations', icon: ShieldCheck, hint: 'Full access' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setForm({ ...form, role: option.value })}
                className={clsx(
                  'rounded-xl border p-3 text-left transition-all',
                  form.role === option.value
                    ? 'border-brand-400 bg-brand-50 shadow-sm'
                    : 'border-ink-200 bg-white hover:border-brand-200',
                )}
              >
                <option.icon
                  className={clsx(
                    'h-4.5 w-4.5',
                    form.role === option.value ? 'text-brand-600' : 'text-ink-400',
                  )}
                />
                <p
                  className={clsx(
                    'mt-1.5 text-sm font-bold',
                    form.role === option.value ? 'text-brand-700' : 'text-ink-800',
                  )}
                >
                  {option.label}
                </p>
                <p className="text-[11px] text-ink-500">{option.hint}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name"
            required
            value={form.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
            error={errors.fullName}
          />
          <Input
            label="E-mail"
            type="email"
            required
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            error={errors.email}
          />
          <Input
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            error={errors.phone}
            hint={isAgent ? 'Shown to customers on the tracking page' : undefined}
          />
          <Input
            label="Temporary password"
            required
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            error={errors.password}
            hint="At least 8 characters with a letter and a number"
          />
        </div>

        {form.role === 'CUSTOMER' && (
          <Input
            label="Company"
            value={form.companyName}
            onChange={(event) => setForm({ ...form, companyName: event.target.value })}
            hint="Fill this in for accounts that ship on B2B contract rates"
          />
        )}

        {isAgent && (
          <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-cyan-700">
              Dispatch profile
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Vehicle"
                value={form.vehicleType}
                onChange={(event) =>
                  setForm({ ...form, vehicleType: event.target.value as VehicleType })
                }
                options={['BIKE', 'SCOOTER', 'VAN', 'TRUCK'].map((value) => ({
                  value,
                  label: value.charAt(0) + value.slice(1).toLowerCase(),
                }))}
              />
              <Input
                label="Vehicle number"
                value={form.vehicleNumber}
                onChange={(event) => setForm({ ...form, vehicleNumber: event.target.value })}
                placeholder="KA-01-HH-4521"
              />
              <Select
                label="Home zone"
                value={form.zoneId}
                onChange={(event) => setForm({ ...form, zoneId: event.target.value })}
                placeholder="No home zone"
                options={zones.map((zone) => ({
                  value: zone.id,
                  label: `${zone.code} · ${zone.name}`,
                }))}
              />
              <Input
                label="Max concurrent orders"
                type="number"
                min="1"
                max="50"
                value={form.maxConcurrentOrders}
                onChange={(event) => setForm({ ...form, maxConcurrentOrders: event.target.value })}
              />
            </div>
          </div>
        )}

        {form.role === 'ADMIN' && (
          <Alert tone="warning" title="Full operational access">
            Admins can edit pricing, reassign any order and override any status. Create these
            sparingly.
          </Alert>
        )}
      </div>
    </Modal>
  );
}
