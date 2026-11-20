import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, App as AntApp, Button, Checkbox, Empty, Input, InputNumber, Modal, Select, Tabs } from 'antd';
import { ArrowRight, Lightbulb } from 'lucide-react';
import { PageHeader } from '@/client/shared/components/PageHeader';
import { SimulationClock } from '@/client/shared/components/SimulationClock';
import { useSimNow } from '@/client/shared/hooks/useSimulationClock';
import { useAppStore } from '@/client/api/useAppStore';
import {
  ACTIVE_DISPATCH,
  capacityWarning,
  destinationFreeSlots,
  dispatchableVehicles,
  estimateEtaMinutes,
  hubDistanceKm,
  inboundReserved,
  suggestRebalancing,
  vehiclesInTransit,
} from '@/shared/domain/dispatchMath';
import { formatHm } from '@/shared/clock';
import type { DispatchOrder } from '@/shared/types/domain';
import { DarkField } from '@/client/shared/chargingUi';
import { ActiveOrderCard } from '@/client/operator/dispatch/ActiveOrderCard';
import { DispatchHistory } from '@/client/operator/dispatch/DispatchHistory';

export function DispatchPage() {
  const { message } = AntApp.useApp();
  const [params] = useSearchParams();
  const now = useSimNow(1000);
  const hubs = useAppStore((state) => state.hubs);
  const vehicles = useAppStore((state) => state.vehicles);
  const orders = useAppStore((state) => state.dispatchOrders);
  const staff = useAppStore((state) => state.dispatchStaff);
  const chargingRequests = useAppStore((state) => state.chargingRequests);
  const createDispatchOrder = useAppStore((state) => state.createDispatchOrder);

  const [needId, setNeedId] = useState(params.get('to') ?? hubs[0]?.id ?? '');
  const [supplyId, setSupplyId] = useState(params.get('from') ?? '');
  const [quantity, setQuantity] = useState(1);
  const [pickManually, setPickManually] = useState(false);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState<string | undefined>();
  const [note, setNote] = useState('');
  const [picker, setPicker] = useState<'need' | 'supply' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ order: DispatchOrder; warning?: string | null } | null>(null);
  const [tab, setTab] = useState('active');

  const state = { hubs, vehicles, dispatchOrders: orders, dispatchStaff: staff, chargingRequests };
  const need = hubs.find((hub) => hub.id === needId) ?? null;
  const supply = hubs.find((hub) => hub.id === supplyId) ?? null;
  const availableAt = (hubId: string) => dispatchableVehicles(state, hubId).length;
  const supplyVehicles = supply ? dispatchableVehicles(state, supply.id) : [];
  const effectiveQty = pickManually ? pickedIds.length : quantity;
  const chosen = pickManually
    ? supplyVehicles.filter((vehicle) => pickedIds.includes(vehicle.id))
    : supplyVehicles.slice(0, quantity);
  const distance = need && supply ? hubDistanceKm(supply.id, need.id) : 0;
  const eta = estimateEtaMinutes(distance, Math.max(1, effectiveQty));
  const warning = need ? capacityWarning(state, need.id, effectiveQty) : null;

  const suggestions = useMemo(
    () =>
      hubs
        .filter((hub) => hub.id !== needId && availableAt(hub.id) > 0)
        .sort((a, b) => availableAt(b.id) - availableAt(a.id))
        .slice(0, 4),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hubs, vehicles, needId],
  );
  const rebalancing = suggestRebalancing(state);
  const activeOrders = orders
    .filter((order) => ACTIVE_DISPATCH.includes(order.status))
    .sort((a, b) => ACTIVE_DISPATCH.indexOf(b.status) - ACTIVE_DISPATCH.indexOf(a.status) || b.createdAt.localeCompare(a.createdAt));
  const inTransitCount = orders.filter((order) => order.status === 'IN_TRANSIT').reduce((sum, order) => sum + order.quantity, 0);

  const openConfirm = () => {
    if (!need) return message.warning('Vui lòng chọn Hub cần xe.');
    if (!supply) return message.warning('Vui lòng chọn Hub cung cấp xe.');
    if (effectiveQty <= 0) return message.warning('Chọn ít nhất 1 xe để điều phối.');
    setError(null);
    setConfirmOpen(true);
  };

  const handleDispatch = () => {
    const result = createDispatchOrder({
      sourceHubId: supplyId,
      destHubId: needId,
      quantity: effectiveQty,
      vehicleIds: pickManually ? pickedIds : undefined,
      staffId,
      note,
    });
    if (!result.ok || !result.order) {
      setError(result.message);
      return;
    }
    setConfirmOpen(false);
    setCreated({ order: result.order, warning: result.warning });
    setPickedIds([]);
    setNote('');
    setTab('active');
  };

  const rowButton = (label: string, value: string | undefined, placeholder: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-lg border border-line bg-white px-4 py-3 text-left dark:border-slate-800 dark:bg-slate-900"
    >
      <span className="w-32 shrink-0 whitespace-nowrap text-[13px] text-muted dark:text-slate-400">{label}</span>
      <span className="h-8 w-px bg-line dark:bg-slate-700" />
      <span className={`text-[14px] font-semibold ${value ? 'text-ink dark:text-slate-100' : 'text-muted dark:text-slate-400'}`}>
        {value ?? placeholder}
      </span>
    </button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Điều phối xe giữa các Hub"
        subtitle="Điều phối xe qua lại giữa các Hub để tránh hết xe tại các Hub."
        actions={<SimulationClock />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Lệnh chờ phân công / chờ xuất phát', value: `${orders.filter((o) => o.status === 'PENDING').length} / ${orders.filter((o) => o.status === 'ASSIGNED').length}` },
          { label: 'Xe đang vận chuyển', value: inTransitCount },
          { label: 'Hoàn thành hôm nay', value: orders.filter((o) => o.status === 'COMPLETED' && o.completedAt && new Date(o.completedAt).toDateString() === new Date(now).toDateString()).length },
          { label: 'Tổng lệnh đã tạo', value: orders.length },
        ].map((item) => (
          <div key={item.label} className="card">
            <p className="muted-13">{item.label}</p>
            <p className="mt-1 text-[26px] font-bold text-ink dark:text-slate-100">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="card">
          <p className="muted-13">Chọn Hub cần xe / Hub cung cấp xe / Số lượng xe điều phối giữa 2 Hub</p>
          <div className="mt-4 space-y-3">
            {rowButton('Hub cần xe', need?.name, 'Chọn Hub cần xe', () => setPicker('need'))}
            {rowButton('Hub cung cấp xe', supply?.name, 'Chọn Hub cung cấp xe', () => setPicker('supply'))}
            <div className="flex items-center gap-4 rounded-lg border border-line bg-white px-4 py-1.5 dark:border-slate-800 dark:bg-slate-900">
              <span className="w-32 shrink-0 text-[13px] text-muted dark:text-slate-400">Số lượng xe</span>
              <span className="h-8 w-px bg-line dark:bg-slate-700" />
              <InputNumber
                min={1}
                max={Math.max(1, supplyVehicles.length)}
                value={effectiveQty}
                disabled={pickManually}
                onChange={(value) => setQuantity(value ?? 1)}
                variant="borderless"
                className="text-[14px] font-semibold"
              />
              <Checkbox
                className="ml-auto"
                checked={pickManually}
                disabled={!supply}
                onChange={(event) => {
                  setPickManually(event.target.checked);
                  setPickedIds(event.target.checked ? supplyVehicles.slice(0, quantity).map((vehicle) => vehicle.id) : []);
                }}
              >
                Chọn xe cụ thể
              </Checkbox>
            </div>

            {pickManually && supply && (
              <div className="rounded-lg border border-dashed border-line p-3 dark:border-slate-700">
                {supplyVehicles.length === 0 ? (
                  <p className="muted-13">Hub cung cấp không còn xe khả dụng.</p>
                ) : (
                  <Checkbox.Group value={pickedIds} onChange={(value) => setPickedIds(value as string[])} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {supplyVehicles.map((vehicle) => (
                      <Checkbox key={vehicle.id} value={vehicle.id}>
                        <span className="text-[13px]">
                          <b>{vehicle.code}</b> · {vehicle.battery}%
                        </span>
                      </Checkbox>
                    ))}
                  </Checkbox.Group>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                allowClear
                placeholder="Phân công nhân viên (có thể để sau)"
                value={staffId}
                onChange={setStaffId}
                options={staff.map((item) => ({ value: item.id, label: `${item.name} · ${item.phone}` }))}
              />
              <Input placeholder="Ghi chú (tuỳ chọn)" value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
          </div>

          {need && supply && need.id !== supply.id && (
            <p className="muted-13 mt-3">
              Quãng đường ~{distance} km · thời gian vận chuyển dự kiến ~{eta} phút · Hub cần xe còn{' '}
              {destinationFreeSlots(state, need.id)} chỗ trống (đã trừ {inboundReserved(orders, need.id)} chỗ giữ cho xe đang đến).
            </p>
          )}
          {warning && <Alert className="mt-3" type={warning.includes('không đủ') ? 'error' : 'warning'} showIcon message={warning} />}

          <div className="mt-4 flex justify-end">
            <Button type="primary" size="large" onClick={openConfirm}>
              Gửi lệnh điều phối
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <p className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink dark:text-slate-100">
              <Lightbulb size={16} className="text-amber-500" /> Gợi ý cân bằng xe
            </p>
            {rebalancing.length === 0 ? (
              <p className="muted-13">Các Hub đang đủ xe, chưa cần điều phối.</p>
            ) : (
              <div className="space-y-2">
                {rebalancing.map((item) => (
                  <button
                    key={`${item.from.id}-${item.to.id}`}
                    type="button"
                    onClick={() => {
                      setNeedId(item.to.id);
                      setSupplyId(item.from.id);
                      setQuantity(item.quantity);
                      setPickManually(false);
                    }}
                    className="w-full rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-left transition hover:border-amber-400 dark:border-amber-500/30 dark:bg-amber-500/5"
                  >
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink dark:text-slate-100">
                      {item.from.name.split(' - ')[0]} <ArrowRight size={13} /> {item.to.name.split(' - ')[0]} · {item.quantity} xe
                    </p>
                    <p className="text-[12px] text-muted">{item.reason}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <p className="muted-13 mb-3">Các Hub còn xe gần Hub cần xe</p>
            <div className="space-y-2">
              {suggestions.map((hub) => (
                <button
                  key={hub.id}
                  type="button"
                  onClick={() => setSupplyId(hub.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition ${
                    hub.id === supplyId
                      ? 'border-[#102A43] bg-[#EAF7EF] dark:bg-emerald-500/10'
                      : 'border-line bg-white hover:border-accent/50 dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <span className="text-[14px] font-semibold text-ink dark:text-slate-100">{hub.name}</span>
                  <span className="shrink-0 text-[13px] text-[#18794E]">
                    {availableAt(hub.id)} xe · {needId ? `${hubDistanceKm(hub.id, needId)} km` : ''}
                  </span>
                </button>
              ))}
              {suggestions.length === 0 && <p className="muted-13">Không có Hub nào còn xe để điều phối.</p>}
            </div>
          </div>
        </div>
      </div>

      <section className="card">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'active',
              label: `Lệnh đang thực hiện (${activeOrders.length})`,
              children:
                activeOrders.length === 0 ? (
                  <Empty description="Không có lệnh điều phối nào đang thực hiện." />
                ) : (
                  <div className="space-y-3">
                    {activeOrders.map((order) => (
                      <ActiveOrderCard key={order.id} order={order} now={now} />
                    ))}
                  </div>
                ),
            },
            { key: 'history', label: `Lịch sử điều phối (${orders.length})`, children: <DispatchHistory orders={orders} /> },
          ]}
        />
      </section>

      <Modal open={picker !== null} onCancel={() => setPicker(null)} footer={null} centered width={600}>
        <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">
          {picker === 'need' ? 'Chọn Hub cần xe' : 'Chọn Hub cung cấp xe'}
        </h3>
        <div className="mt-4 space-y-2">
          {hubs.map((hub) => (
            <button
              key={hub.id}
              type="button"
              onClick={() => {
                if (picker === 'need') setNeedId(hub.id);
                else {
                  setSupplyId(hub.id);
                  setPickedIds([]);
                }
                setPicker(null);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 text-left transition hover:border-accent/50 dark:border-slate-800"
            >
              <span className="text-[14px] font-semibold text-ink dark:text-slate-100">{hub.name}</span>
              <span className="shrink-0 text-right text-[12px] text-muted">
                <span className="text-[13px] font-semibold text-[#18794E]">{availableAt(hub.id)} xe</span> ·{' '}
                {destinationFreeSlots(state, hub.id)} chỗ trống
                {vehiclesInTransit(orders, hub.id, 'in') > 0 && ` · ${vehiclesInTransit(orders, hub.id, 'in')} xe đang đến`}
              </span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={confirmOpen} onCancel={() => setConfirmOpen(false)} footer={null} centered width={580}>
        <h3 className="text-[20px] font-bold text-ink dark:text-slate-100">Xác nhận điều phối xe</h3>
        <div className="mt-4 rounded-2xl bg-[#102A43] p-6 text-white">
          <p className="text-[17px] font-bold">Chi tiết điều phối</p>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <DarkField label="Hub cung cấp xe">{supply?.name}</DarkField>
            <DarkField label="Hub cần xe">{need?.name}</DarkField>
            <DarkField label="Số lượng xe">{effectiveQty} xe</DarkField>
            <DarkField label="Dự kiến">
              ~{distance} km · {eta} phút
            </DarkField>
            <div className="col-span-2">
              <DarkField label="Xe được điều phối">
                {chosen.length ? chosen.map((vehicle) => `${vehicle.code} (${vehicle.battery}%)`).join(', ') : '—'}
              </DarkField>
            </div>
            <DarkField label="Nhân viên">{staff.find((item) => item.id === staffId)?.name ?? 'Phân công sau'}</DarkField>
          </dl>
        </div>
        {warning && !error && <Alert className="mt-3" type="warning" showIcon message={warning} />}
        {error && <Alert className="mt-3" type="error" showIcon message={error} />}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setConfirmOpen(false)}>Thoát</Button>
          <Button type="primary" onClick={handleDispatch}>
            Điều phối
          </Button>
        </div>
      </Modal>

      <Modal open={created !== null} onCancel={() => setCreated(null)} footer={null} centered width={500}>
        <h3 className="text-[20px] font-bold text-[#18794E]">Đã tạo lệnh điều phối</h3>
        {created && (
          <div className="mt-3 space-y-2 text-[14px] text-ink dark:text-slate-200">
            <p>
              Lệnh <b>{created.order.code}</b>: {created.order.quantity} xe ({created.order.vehicleCodes.join(', ')}).
            </p>
            <p className="muted-13">
              Trạng thái: {created.order.status === 'ASSIGNED' ? `đã phân công ${created.order.staffName}` : 'chờ phân công nhân viên'} · tạo
              lúc {formatHm(created.order.createdAt)}. Theo dõi tiến độ trong mục “Lệnh đang thực hiện”.
            </p>
            {created.warning && <Alert type="warning" showIcon message={created.warning} />}
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <Button type="primary" onClick={() => setCreated(null)}>
            Đóng
          </Button>
        </div>
      </Modal>
    </div>
  );
}
