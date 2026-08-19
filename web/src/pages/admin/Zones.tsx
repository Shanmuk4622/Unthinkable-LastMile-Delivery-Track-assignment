/**
 * Zones and areas — "admin manages zones and assigns areas to zones".
 *
 * The area table is the serviceability map: one row per pincode. Moving a
 * pincode between zones is a single dropdown, and it immediately changes how
 * every future order on that lane is priced and dispatched.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, MapPinned, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useDebounced } from '@/hooks/useDebounced';
import { PageHeader } from '@/components/layout/AppShell';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Textarea,
} from '@/components/ui';
import type { Area, Zone } from '@/lib/types';

export default function AdminZones() {
  const queryClient = useQueryClient();

  const [zoneModal, setZoneModal] = useState<{ open: boolean; zone: Zone | null }>({
    open: false,
    zone: null,
  });
  const [areaModal, setAreaModal] = useState<{ open: boolean; area: Area | null }>({
    open: false,
    area: null,
  });
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');

  const debouncedSearch = useDebounced(search, 250);

  const zones = useQuery({ queryKey: ['zones'], queryFn: api.zones.list });
  const areas = useQuery({ queryKey: ['areas'], queryFn: api.zones.areas });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['zones'] });
    void queryClient.invalidateQueries({ queryKey: ['areas'] });
  };

  const saveZone = useMutation({
    mutationFn: (payload: Partial<Zone> & { id?: string }) =>
      payload.id ? api.zones.update(payload.id, payload) : api.zones.create(payload),
    onSuccess: () => {
      toast.success('Zone saved.');
      setZoneModal({ open: false, zone: null });
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Save failed.'),
  });

  const removeZone = useMutation({
    mutationFn: (id: string) => api.zones.remove(id),
    onSuccess: () => {
      toast.success('Zone removed.');
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Delete failed.'),
  });

  const saveArea = useMutation({
    mutationFn: (payload: Partial<Area> & { id?: string }) =>
      payload.id ? api.zones.updateArea(payload.id, payload) : api.zones.createArea(payload),
    onSuccess: () => {
      toast.success('Pincode saved.');
      setAreaModal({ open: false, area: null });
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Save failed.'),
  });

  const removeArea = useMutation({
    mutationFn: (id: string) => api.zones.removeArea(id),
    onSuccess: () => {
      toast.success('Pincode removed.');
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Delete failed.'),
  });

  /** Move a pincode to another zone straight from the table. */
  const reassign = useMutation({
    mutationFn: ({ id, zoneId }: { id: string; zoneId: string }) =>
      api.zones.updateArea(id, { zoneId }),
    onSuccess: (area) => {
      toast.success(`${area.pincode} moved to ${area.zone?.name}.`);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Move failed.'),
  });

  const filteredAreas = useMemo(() => {
    const list = areas.data ?? [];
    const term = debouncedSearch.trim().toLowerCase();
    return list.filter((area) => {
      if (zoneFilter && area.zoneId !== zoneFilter) return false;
      if (!term) return true;
      return (
        area.pincode.includes(term) ||
        area.name.toLowerCase().includes(term) ||
        area.city.toLowerCase().includes(term)
      );
    });
  }, [areas.data, debouncedSearch, zoneFilter]);

  if (zones.isPending) return <LoadingBlock />;

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Zones & serviceability"
        subtitle="Zones are what rate cards are written against. Areas map a pincode to its zone — this table is how the system detects where an order starts and ends."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setAreaModal({ open: true, area: null })}
            >
              Add pincode
            </Button>
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setZoneModal({ open: true, zone: null })}
            >
              New zone
            </Button>
          </>
        }
      />

      {/* ---- zone cards ---- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(zones.data ?? []).map((zone) => (
          <Card key={zone.id} hover className="overflow-hidden">
            <div className="flex items-start justify-between gap-3 p-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-route px-2 py-1 font-mono text-[11px] font-extrabold text-white">
                    {zone.code}
                  </span>
                  {!zone.isActive && <Badge className="bg-ink-100 text-ink-500">Inactive</Badge>}
                </div>
                <h3 className="mt-2 truncate text-base font-bold text-ink-900">{zone.name}</h3>
                <p className="text-sm text-ink-500">
                  {zone.city}
                  {zone.state ? `, ${zone.state}` : ''}
                </p>
                {zone.description && (
                  <p className="mt-2 text-xs leading-relaxed text-ink-500">{zone.description}</p>
                )}
              </div>

              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => setZoneModal({ open: true, zone })}
                  className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
                  aria-label={`Edit ${zone.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Remove ${zone.name}? Zones referenced by orders are deactivated instead.`))
                      removeZone.mutate(zone.id);
                  }}
                  className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`Delete ${zone.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-px border-t border-ink-100 bg-ink-100">
              <Stat label="Pincodes" value={zone._count?.areas ?? 0} />
              <Stat label="Agents" value={zone._count?.agents ?? 0} />
              <Stat
                label="Orders"
                value={(zone._count?.pickupOrders ?? 0) + (zone._count?.dropOrders ?? 0)}
              />
            </div>
          </Card>
        ))}

        {(zones.data ?? []).length === 0 && (
          <Card className="sm:col-span-2 xl:col-span-3">
            <EmptyState
              icon={<MapPinned className="h-8 w-8" />}
              title="No zones configured"
              description="Create your first zone, then assign pincodes to it. Nothing can be priced until at least one zone exists."
              action={
                <Button onClick={() => setZoneModal({ open: true, zone: null })}>
                  <Plus className="h-4 w-4" />
                  New zone
                </Button>
              }
            />
          </Card>
        )}
      </div>

      {/* ---- areas ---- */}
      <Card className="mt-6 overflow-hidden">
        <CardHeader
          title="Serviceable pincodes"
          subtitle="One row per pincode — this is the zone-detection lookup table"
          icon={<MapPin className="h-4.5 w-4.5" />}
          action={
            <Badge className="bg-brand-100 text-brand-700">
              {filteredAreas.length} of {areas.data?.length ?? 0}
            </Badge>
          }
        />

        <div className="grid gap-3 border-b border-ink-100 p-4 sm:grid-cols-2 lg:w-2/3">
          <Input
            placeholder="Search pincode, area or city…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            prefix={<Search className="h-4 w-4" />}
            className="pl-9"
          />
          <Select
            value={zoneFilter}
            onChange={(event) => setZoneFilter(event.target.value)}
            placeholder="All zones"
            options={(zones.data ?? []).map((zone) => ({
              value: zone.id,
              label: `${zone.code} · ${zone.name}`,
            }))}
          />
        </div>

        {areas.isPending ? (
          <LoadingBlock />
        ) : filteredAreas.length === 0 ? (
          <EmptyState
            icon={<MapPin className="h-8 w-8" />}
            title="No pincodes match"
            description="Add a pincode to make that locality serviceable."
            action={
              <Button onClick={() => setAreaModal({ open: true, area: null })}>
                <Plus className="h-4 w-4" />
                Add pincode
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Pincode</th>
                  <th>Area</th>
                  <th>City</th>
                  <th>Zone</th>
                  <th>Coordinates</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {filteredAreas.map((area) => (
                  <tr key={area.id}>
                    <td>
                      <span className="font-mono text-sm font-bold text-ink-900">
                        {area.pincode}
                      </span>
                    </td>
                    <td className="font-medium">{area.name}</td>
                    <td>{area.city}</td>
                    <td>
                      <select
                        value={area.zoneId}
                        onChange={(event) =>
                          reassign.mutate({ id: area.id, zoneId: event.target.value })
                        }
                        className="select py-1.5 text-xs"
                        aria-label={`Zone for ${area.pincode}`}
                      >
                        {(zones.data ?? []).map((zone) => (
                          <option key={zone.id} value={zone.id}>
                            {zone.code} · {zone.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="font-mono text-[11px] text-ink-400">
                      {area.lat !== null && area.lng !== null
                        ? `${area.lat.toFixed(4)}, ${area.lng.toFixed(4)}`
                        : 'not set'}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setAreaModal({ open: true, area })}
                          className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
                          aria-label={`Edit ${area.pincode}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Remove pincode ${area.pincode}? It will stop being serviceable.`))
                              removeArea.mutate(area.id);
                          }}
                          className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                          aria-label={`Delete ${area.pincode}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ZoneModal
        state={zoneModal}
        onClose={() => setZoneModal({ open: false, zone: null })}
        onSave={(payload) => saveZone.mutate(payload)}
        saving={saveZone.isPending}
      />

      <AreaModal
        state={areaModal}
        zones={zones.data ?? []}
        onClose={() => setAreaModal({ open: false, area: null })}
        onSave={(payload) => saveArea.mutate(payload)}
        saving={saveArea.isPending}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white px-4 py-3 text-center">
      <p className="font-mono text-lg font-extrabold text-ink-900">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ZoneModal({
  state,
  onClose,
  onSave,
  saving,
}: {
  state: { open: boolean; zone: Zone | null };
  onClose: () => void;
  onSave: (payload: Partial<Zone> & { id?: string }) => void;
  saving: boolean;
}) {
  const zone = state.zone;
  const [form, setForm] = useState({
    code: '',
    name: '',
    city: '',
    state: '',
    description: '',
    centerLat: '',
    centerLng: '',
  });

  // Re-seed the form each time the modal opens for a different zone.
  const [seededFor, setSeededFor] = useState<string | null | undefined>(undefined);
  if (state.open && seededFor !== (zone?.id ?? null)) {
    setSeededFor(zone?.id ?? null);
    setForm({
      code: zone?.code ?? '',
      name: zone?.name ?? '',
      city: zone?.city ?? '',
      state: zone?.state ?? '',
      description: zone?.description ?? '',
      centerLat: zone?.centerLat?.toString() ?? '',
      centerLng: zone?.centerLng?.toString() ?? '',
    });
  }

  return (
    <Modal
      open={state.open}
      onClose={onClose}
      title={zone ? `Edit ${zone.name}` : 'New zone'}
      subtitle="Zones are the unit rate cards are written against."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            onClick={() =>
              onSave({
                ...(zone ? { id: zone.id } : {}),
                code: form.code.trim().toUpperCase(),
                name: form.name.trim(),
                city: form.city.trim(),
                state: form.state.trim() || null,
                description: form.description.trim() || null,
                centerLat: form.centerLat ? Number(form.centerLat) : null,
                centerLng: form.centerLng ? Number(form.centerLng) : null,
              })
            }
          >
            {zone ? 'Save changes' : 'Create zone'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Zone code"
            required
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
            placeholder="BLR-S"
            hint="Short, unique, uppercase"
          />
          <Input
            label="Zone name"
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="South Bengaluru"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="City"
            required
            value={form.city}
            onChange={(event) => setForm({ ...form, city: event.target.value })}
            placeholder="Bengaluru"
          />
          <Input
            label="State"
            value={form.state}
            onChange={(event) => setForm({ ...form, state: event.target.value })}
            placeholder="Karnataka"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Centre latitude"
            type="number"
            step="any"
            value={form.centerLat}
            onChange={(event) => setForm({ ...form, centerLat: event.target.value })}
            placeholder="12.9279"
            hint="Fallback location for dispatch maths"
          />
          <Input
            label="Centre longitude"
            type="number"
            step="any"
            value={form.centerLng}
            onChange={(event) => setForm({ ...form, centerLng: event.target.value })}
            placeholder="77.6271"
          />
        </div>

        <Textarea
          label="Description"
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
          placeholder="What characterises this zone operationally?"
        />
      </div>
    </Modal>
  );
}

function AreaModal({
  state,
  zones,
  onClose,
  onSave,
  saving,
}: {
  state: { open: boolean; area: Area | null };
  zones: Zone[];
  onClose: () => void;
  onSave: (payload: Partial<Area> & { id?: string }) => void;
  saving: boolean;
}) {
  const area = state.area;
  const [form, setForm] = useState({
    pincode: '',
    name: '',
    city: '',
    state: '',
    zoneId: '',
    lat: '',
    lng: '',
  });

  const [seededFor, setSeededFor] = useState<string | null | undefined>(undefined);
  if (state.open && seededFor !== (area?.id ?? null)) {
    setSeededFor(area?.id ?? null);
    setForm({
      pincode: area?.pincode ?? '',
      name: area?.name ?? '',
      city: area?.city ?? '',
      state: area?.state ?? '',
      zoneId: area?.zoneId ?? zones[0]?.id ?? '',
      lat: area?.lat?.toString() ?? '',
      lng: area?.lng?.toString() ?? '',
    });
  }

  const selectedZone = zones.find((zone) => zone.id === form.zoneId);

  return (
    <Modal
      open={state.open}
      onClose={onClose}
      title={area ? `Edit ${area.pincode}` : 'Add a serviceable pincode'}
      subtitle="This is the row the engine looks up to detect an order's zone."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            onClick={() =>
              onSave({
                ...(area ? { id: area.id } : {}),
                pincode: form.pincode,
                name: form.name.trim(),
                city: form.city.trim() || selectedZone?.city || '',
                state: form.state.trim() || selectedZone?.state || null,
                zoneId: form.zoneId,
                lat: form.lat ? Number(form.lat) : null,
                lng: form.lng ? Number(form.lng) : null,
              })
            }
          >
            {area ? 'Save changes' : 'Add pincode'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Pincode"
            required
            inputMode="numeric"
            maxLength={6}
            value={form.pincode}
            onChange={(event) =>
              setForm({ ...form, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) })
            }
            placeholder="560034"
            hint="Must be unique across the network"
          />
          <Input
            label="Area name"
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Koramangala"
          />
        </div>

        <Select
          label="Assign to zone"
          required
          value={form.zoneId}
          onChange={(event) => setForm({ ...form, zoneId: event.target.value })}
          options={zones.map((zone) => ({
            value: zone.id,
            label: `${zone.code} · ${zone.name} (${zone.city})`,
          }))}
          hint="Changing this re-routes every future order on this pincode"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="City"
            value={form.city}
            onChange={(event) => setForm({ ...form, city: event.target.value })}
            placeholder={selectedZone?.city ?? 'Bengaluru'}
          />
          <Input
            label="State"
            value={form.state}
            onChange={(event) => setForm({ ...form, state: event.target.value })}
            placeholder={selectedZone?.state ?? 'Karnataka'}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Latitude"
            type="number"
            step="any"
            value={form.lat}
            onChange={(event) => setForm({ ...form, lat: event.target.value })}
            placeholder="12.9352"
            hint="Used to place addresses without a GPS fix"
          />
          <Input
            label="Longitude"
            type="number"
            step="any"
            value={form.lng}
            onChange={(event) => setForm({ ...form, lng: event.target.value })}
            placeholder="77.6245"
          />
        </div>
      </div>
    </Modal>
  );
}
