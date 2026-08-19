/**
 * The delivery-agent roster.
 *
 * This is the availability model the dispatcher scores against, made editable:
 * duty state, home zone, vehicle class, concurrent-order capacity and last
 * known position all live on one card per agent.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Crosshair,
  Gauge,
  MapPin,
  Package,
  Pencil,
  Truck,
  UserPlus,
  Users,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { AVAILABILITY_STYLES, avatarGradient, percent, relative } from '@/lib/format';
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
  LoadingBlock,
  Modal,
  Segmented,
  Select,
} from '@/components/ui';
import type { AgentAvailability, AgentProfile, VehicleType, Zone } from '@/lib/types';

const VEHICLE_CAPACITY: Record<VehicleType, number> = {
  BIKE: 15,
  SCOOTER: 25,
  VAN: 500,
  TRUCK: 5000,
};

export default function AdminAgents() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<AgentProfile | null>(null);

  const agents = useQuery({
    queryKey: ['agents', filter],
    queryFn: () => api.agents.list(filter ? { availability: filter } : {}),
    refetchInterval: 60_000,
  });

  const zones = useQuery({ queryKey: ['zones'], queryFn: api.zones.list });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.agents.update(id, body),
    onSuccess: () => {
      toast.success('Agent updated.');
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Update failed.'),
  });

  if (agents.isPending) return <LoadingBlock />;

  const list = agents.data ?? [];
  const available = list.filter((agent) => agent.availability === 'AVAILABLE').length;
  const atCapacity = list.filter(
    (agent) => agent.activeOrderCount >= agent.maxConcurrentOrders,
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="Fleet"
        title="Delivery agents"
        subtitle="Availability, capacity and position — the three things the dispatcher scores against."
        actions={
          <Link to="/admin/users?role=AGENT" className="btn-primary">
            <UserPlus className="h-4 w-4" />
            Add an agent
          </Link>
        }
      />

      {available === 0 && list.length > 0 && (
        <Alert tone="warning" title="No agent is currently available">
          Auto-assignment will fail until at least one agent is set to available with spare
          capacity.
        </Alert>
      )}

      <div className="mb-5 mt-6 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: '', label: 'All', count: list.length },
            { value: 'AVAILABLE', label: 'Available', count: available },
            { value: 'BUSY', label: 'Busy' },
            { value: 'ON_BREAK', label: 'On break' },
            { value: 'OFFLINE', label: 'Offline' },
          ]}
        />
        {atCapacity > 0 && (
          <Badge className="bg-amber-100 text-amber-700">
            {atCapacity} at full capacity
          </Badge>
        )}
      </div>

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="No delivery agents"
            description="Create an agent account under Users — the profile the dispatcher needs is provisioned automatically."
            action={
              <Link to="/admin/users" className="btn-primary">
                <UserPlus className="h-4 w-4" />
                Go to users
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((agent) => {
            const load = agent.maxConcurrentOrders
              ? agent.activeOrderCount / agent.maxConcurrentOrders
              : 0;
            const attempts = agent.totalDelivered + agent.totalFailed;
            const successRate = attempts
              ? Math.round((agent.totalDelivered / attempts) * 100)
              : null;

            return (
              <Card key={agent.id} hover className="overflow-hidden">
                <div className="flex items-start gap-3 p-5">
                  <Avatar
                    name={agent.user.fullName}
                    gradient={avatarGradient(agent.id)}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-bold text-ink-900">
                        {agent.user.fullName}
                      </h3>
                      <AvailabilityBadge availability={agent.availability} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-500">{agent.user.email}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
                      <span className="inline-flex items-center gap-1">
                        <Truck className="h-3 w-3" />
                        {agent.vehicleType.toLowerCase()}
                        {agent.vehicleNumber ? ` · ${agent.vehicleNumber}` : ''}
                      </span>
                      {agent.zone && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {agent.zone.code}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setEditing(agent)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
                    aria-label={`Edit ${agent.user.fullName}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>

                {/* capacity bar */}
                <div className="px-5 pb-4">
                  <div className="mb-1.5 flex items-center justify-between text-[11px]">
                    <span className="font-bold uppercase tracking-wide text-ink-400">
                      Workload
                    </span>
                    <span className="font-mono font-bold text-ink-700">
                      {agent.activeOrderCount}/{agent.maxConcurrentOrders}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className={clsx(
                        'h-full rounded-full transition-all',
                        load >= 1 ? 'bg-rose-500' : load >= 0.6 ? 'bg-amber-500' : 'bg-emerald-500',
                      )}
                      style={{ width: `${Math.max(3, Math.min(100, load * 100))}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-px border-t border-ink-100 bg-ink-100">
                  <Metric icon={<Package className="h-3.5 w-3.5" />} label="Delivered" value={agent.totalDelivered} />
                  <Metric icon={<Gauge className="h-3.5 w-3.5" />} label="Failed" value={agent.totalFailed} />
                  <Metric
                    icon={<Gauge className="h-3.5 w-3.5" />}
                    label="Success"
                    value={successRate !== null ? percent(successRate) : '—'}
                  />
                </div>

                <div className="flex items-center gap-1.5 border-t border-ink-100 bg-ink-50/60 px-5 py-2.5 text-[11px] text-ink-500">
                  <Crosshair className="h-3 w-3" />
                  {agent.currentLat !== null && agent.currentLng !== null ? (
                    <span className="font-mono">
                      {agent.currentLat.toFixed(3)}, {agent.currentLng.toFixed(3)}
                      {agent.lastLocationAt && (
                        <span className="ml-1 font-sans">· {relative(agent.lastLocationAt)}</span>
                      )}
                    </span>
                  ) : (
                    <span>No GPS fix — falls back to the zone centroid</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <EditAgentModal
        agent={editing}
        zones={zones.data ?? []}
        onClose={() => setEditing(null)}
        onSave={(body) => editing && update.mutate({ id: editing.id, body })}
        saving={update.isPending}
      />
    </>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="bg-white px-3 py-3 text-center">
      <p className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-ink-400">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-mono text-sm font-extrabold text-ink-900">{value}</p>
    </div>
  );
}

function EditAgentModal({
  agent,
  zones,
  onClose,
  onSave,
  saving,
}: {
  agent: AgentProfile | null;
  zones: Zone[];
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    vehicleType: 'BIKE' as VehicleType,
    vehicleNumber: '',
    zoneId: '',
    availability: 'OFFLINE' as AgentAvailability,
    maxConcurrentOrders: '5',
    currentLat: '',
    currentLng: '',
  });

  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (agent && seededFor !== agent.id) {
    setSeededFor(agent.id);
    setForm({
      vehicleType: agent.vehicleType,
      vehicleNumber: agent.vehicleNumber ?? '',
      zoneId: agent.zoneId ?? '',
      availability: agent.availability,
      maxConcurrentOrders: String(agent.maxConcurrentOrders),
      currentLat: agent.currentLat?.toString() ?? '',
      currentLng: agent.currentLng?.toString() ?? '',
    });
  }

  return (
    <Modal
      open={Boolean(agent)}
      onClose={onClose}
      title={agent ? `Edit ${agent.user.fullName}` : 'Edit agent'}
      subtitle="These fields feed straight into the dispatch score."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            onClick={() =>
              onSave({
                vehicleType: form.vehicleType,
                vehicleNumber: form.vehicleNumber.trim() || null,
                zoneId: form.zoneId || null,
                availability: form.availability,
                maxConcurrentOrders: Number(form.maxConcurrentOrders),
                currentLat: form.currentLat ? Number(form.currentLat) : null,
                currentLng: form.currentLng ? Number(form.currentLng) : null,
              })
            }
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Duty status"
            value={form.availability}
            onChange={(event) =>
              setForm({ ...form, availability: event.target.value as AgentAvailability })
            }
            options={(Object.keys(AVAILABILITY_STYLES) as AgentAvailability[]).map((value) => ({
              value,
              label: AVAILABILITY_STYLES[value].label,
            }))}
            hint="Only AVAILABLE agents are considered by the dispatcher"
          />
          <Select
            label="Home zone"
            value={form.zoneId}
            onChange={(event) => setForm({ ...form, zoneId: event.target.value })}
            placeholder="No home zone"
            options={zones.map((zone) => ({ value: zone.id, label: `${zone.code} · ${zone.name}` }))}
            hint="Same-zone agents get a scoring head start"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Vehicle"
            value={form.vehicleType}
            onChange={(event) =>
              setForm({ ...form, vehicleType: event.target.value as VehicleType })
            }
            options={(Object.keys(VEHICLE_CAPACITY) as VehicleType[]).map((value) => ({
              value,
              label: `${value.charAt(0)}${value.slice(1).toLowerCase()} — up to ${VEHICLE_CAPACITY[value]} kg`,
            }))}
            hint="Vehicles that cannot carry the weight are filtered out"
          />
          <Input
            label="Vehicle number"
            value={form.vehicleNumber}
            onChange={(event) => setForm({ ...form, vehicleNumber: event.target.value })}
            placeholder="KA-01-HH-4521"
          />
        </div>

        <Input
          label="Maximum concurrent orders"
          type="number"
          min="1"
          max="50"
          value={form.maxConcurrentOrders}
          onChange={(event) => setForm({ ...form, maxConcurrentOrders: event.target.value })}
          hint="The agent flips to BUSY automatically on reaching this"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Latitude"
            type="number"
            step="any"
            value={form.currentLat}
            onChange={(event) => setForm({ ...form, currentLat: event.target.value })}
            placeholder="12.9352"
          />
          <Input
            label="Longitude"
            type="number"
            step="any"
            value={form.currentLng}
            onChange={(event) => setForm({ ...form, currentLng: event.target.value })}
            placeholder="77.6245"
          />
        </div>

        <Alert tone="info">
          In production the driver app pings its position every 30–60 seconds. Setting coordinates
          here is the manual equivalent, useful for demos and for agents whose device is offline.
        </Alert>
      </div>
    </Modal>
  );
}
