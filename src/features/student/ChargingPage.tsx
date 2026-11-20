import { useEffect, useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, Empty, Input, InputNumber, Modal, Select, Slider, Tabs } from 'antd';
import { BatteryCharging, ChevronLeft, ChevronRight, Plus, Zap } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { SimulationClock } from '../../components/SimulationClock';
import { useSimNow } from '../../hooks/useSimulationClock';
import { useAppStore } from '../../stores/useAppStore';
import { useAuthStore } from '../../stores/useAuthStore';
import {
  VEHICLE_PROFILES,
  buildSlotOptions,
  calculatePriorityScore,
  estimateCharge,
  estimatePrice,
  findAlternativeHubs,
  getPortStateInWindow,
  isConnectorCompatible,
  prioritizeVehicles,
  pickChargingState,
} from '../../services/chargingScheduler';
import {
  MINUTE,
  addMinutes,
  formatDayLabel,
  formatDuration,
  formatHm,
  formatMoney,
  toDateKey,
} from '../../services/clock';
import type { ChargingReservation, PersonalVehicleType } from '../../types/domain';
import {
  DarkField,
  END_REASON_LABEL,
  PORT_STATUS_LABEL,
  PORT_STATUS_STYLE,
  RESERVATION_STATUS,
  SessionProgress,
} from '../charging/chargingUi';

const SLOTS_PER_PAGE = 8;
const PORTS_PER_PAGE = 8;

type VehicleChoice = {
  key: string;
  kind: 'personal' | 'shared';
  id: string;
  label: string;
  type: PersonalVehicleType;
  capacityKwh: number;
  battery?: number;
};

export function ChargingPage() {
  const { message, modal } = AntApp.useApp();
  const user = useAuthStore((state) => state.currentUser);
  const studentId = user?.id ?? 'student-001';
  const studentName = user?.fullName ?? 'Sinh viên';

  const data = useAppStore();
  const {
    hubs,
    chargingPorts,
    chargingReservations,
    chargingSessions,
    chargingConfig,
    personalVehicles,
    bookings,
    vehicles,
    createChargingReservation,
    cancelChargingReservation,
    checkInCharging,
    completeChargingSession,
    addPersonalVehicle,
  } = data;
  const chargingState = pickChargingState(data);
  const now = useSimNow(1000);
  const todayKey = toDateKey(now);

  /* ---------- Lựa chọn của người dùng ---------- */
  const [hubId, setHubId] = useState(hubs[0]?.id ?? '');
  const [dateKey, setDateKey] = useState(todayKey);
  const myPersonal = personalVehicles.filter((item) => item.ownerId === studentId);
  const rented = bookings
    .filter((booking) => booking.status === 'picked_up')
    .map((booking) => vehicles.find((vehicle) => vehicle.id === booking.vehicleId))
    .filter((vehicle): vehicle is NonNullable<typeof vehicle> => Boolean(vehicle));
  const vehicleChoices: VehicleChoice[] = [
    ...myPersonal.map((item) => ({
      key: `p:${item.id}`,
      kind: 'personal' as const,
      id: item.id,
      label: `${item.model} · ${item.licensePlate}`,
      type: item.type,
      capacityKwh: item.batteryCapacityKwh,
    })),
    ...rented.map((item) => ({
      key: `s:${item.id}`,
      kind: 'shared' as const,
      id: item.id,
      label: `${item.code} · ${item.model} (xe đang thuê)`,
      type: item.type,
      capacityKwh: VEHICLE_PROFILES[item.type].capacityKwh,
      battery: item.battery,
    })),
  ];
  const [vehicleKey, setVehicleKey] = useState(vehicleChoices[0]?.key ?? '');
  const vehicle = vehicleChoices.find((item) => item.key === vehicleKey) ?? vehicleChoices[0] ?? null;
  const [currentBattery, setCurrentBattery] = useState(25);
  const [targetBattery, setTargetBattery] = useState(80);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null);
  const [slotPage, setSlotPage] = useState<number | null>(null);
  const [portPage, setPortPage] = useState(0);

  /* ---------- Modal ---------- */
  const [editOpen, setEditOpen] = useState(false);
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [created, setCreated] = useState<ChargingReservation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkInTarget, setCheckInTarget] = useState<ChargingReservation | null>(null);
  const [checkInCode, setCheckInCode] = useState('');
  const [newVehicle, setNewVehicle] = useState({ licensePlate: '', model: '', type: 'motorbike' as PersonalVehicleType, batteryCapacityKwh: 3.5 });

  useEffect(() => {
    if (vehicle?.battery !== undefined) setCurrentBattery(vehicle.battery);
  }, [vehicle?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const hub = hubs.find((item) => item.id === hubId) ?? hubs[0];
  const connectors = vehicle ? VEHICLE_PROFILES[vehicle.type].connectors : undefined;
  const hubPorts = chargingPorts.filter((port) => port.hubId === hub?.id);
  const compatiblePorts = hubPorts.filter((port) => !vehicle || isConnectorCompatible(vehicle.type, port.connector));
  const bestPower = Math.max(0, ...compatiblePorts.map((port) => port.power));
  const batteryValid = currentBattery < targetBattery;

  const estimateFor = (portPower: number) =>
    vehicle
      ? estimateCharge({
          capacityKwh: vehicle.capacityKwh,
          vehicleType: vehicle.type,
          currentBattery,
          targetBattery,
          portPowerKw: portPower,
          slotMinutes: chargingConfig.slotMinutes,
        })
      : null;
  const baseEstimate = estimateFor(bestPower || 60);
  const durationMinutes = baseEstimate?.durationMinutes ?? chargingConfig.slotMinutes;

  const slots = useMemo(
    () =>
      hub
        ? buildSlotOptions(chargingState, { hubId: hub.id, dateKey, durationMinutes, connectors, now })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hub?.id, dateKey, durationMinutes, connectors?.join(), chargingReservations, chargingSessions, chargingPorts, Math.floor(now / MINUTE)],
  );
  const firstOpenIndex = Math.max(0, slots.findIndex((slot) => !slot.disabled));
  const page = slotPage ?? Math.floor(firstOpenIndex / SLOTS_PER_PAGE);
  const pageCount = Math.max(1, Math.ceil(slots.length / SLOTS_PER_PAGE));
  const visibleSlots = slots.slice(page * SLOTS_PER_PAGE, page * SLOTS_PER_PAGE + SLOTS_PER_PAGE);
  const slot =
    slots.find((item) => item.label === selectedSlot && !item.disabled) ??
    slots.find((item) => !item.disabled && item.freePorts > 0) ??
    slots.find((item) => !item.disabled) ??
    null;

  const port = hubPorts.find((item) => item.id === selectedPortId) ?? null;
  const portEstimate = port ? estimateFor(port.power) : baseEstimate;
  const portWindowEnd = slot && portEstimate ? slot.start + portEstimate.durationMinutes * MINUTE : 0;
  const portState = (portId: string) => {
    const item = hubPorts.find((entry) => entry.id === portId)!;
    if (vehicle && !isConnectorCompatible(vehicle.type, item.connector)) return 'incompatible' as const;
    if (!slot) return 'reserved' as const;
    const estimate = estimateFor(item.power);
    return getPortStateInWindow(chargingState, item, slot.start, slot.start + (estimate?.durationMinutes ?? 30) * MINUTE, now);
  };
  const selectedStillFree = port && portState(port.id) === 'free';
  const freeAtSlot = slot ? compatiblePorts.filter((item) => portState(item.id) === 'free').length : 0;
  const queueWaiting = hub ? prioritizeVehicles(chargingState, hub.id, now).filter((item) => item.eligible).length : 0;
  const overloaded =
    slot && freeAtSlot > 0 && (freeAtSlot <= Math.max(1, Math.floor(compatiblePorts.length * 0.25)) || queueWaiting > freeAtSlot);

  const alternativeSlots = slot
    ? slots.filter((item) => !item.disabled && item.freePorts > 0 && item.label !== slot.label && item.start > slot.start - 60 * MINUTE).slice(0, 4)
    : [];
  const alternativeHubs =
    slot && hub
      ? findAlternativeHubs(chargingState, { excludeHubId: hub.id, start: slot.start, end: slot.end, connectors, now }).slice(0, 3)
      : [];

  const priority = calculatePriorityScore({
    battery: currentBattery,
    isShared: vehicle?.kind === 'shared',
    minutesToNextUse: null,
    waitedMinutes: 0,
    config: chargingConfig,
  });

  /* ---------- Lịch của tôi ---------- */
  const mine = chargingReservations.filter((item) => item.studentId === studentId);
  const active = mine
    .filter((item) => item.status === 'CONFIRMED' || item.status === 'CHECKED_IN')
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const history = mine
    .filter((item) => item.status !== 'CONFIRMED' && item.status !== 'CHECKED_IN')
    .sort((a, b) => b.startAt.localeCompare(a.startAt));

  const resetSelection = () => {
    setSelectedPortId(null);
    setSelectedSlot(null);
    setSlotPage(null);
    setPortPage(0);
  };

  const handleConfirm = () => {
    if (!hub || !port || !slot || !vehicle) return;
    const result = createChargingReservation({
      studentId,
      studentName,
      hubId: hub.id,
      portId: port.id,
      vehicleKind: vehicle.kind,
      vehicleId: vehicle.id,
      vehicleLabel: vehicle.label.replace(' (xe đang thuê)', ''),
      vehicleType: vehicle.type,
      batteryCapacityKwh: vehicle.capacityKwh,
      currentBattery,
      targetBattery,
      dateKey,
      startTime: slot.label,
    });
    if (!result.ok || !result.reservation) {
      setError(result.message);
      return;
    }
    setConfirmOpen(false);
    setCreated(result.reservation);
    setSelectedPortId(null);
  };

  const dayOptions = Array.from({ length: 7 }, (_, index) => {
    const key = toDateKey(now + index * 24 * 60 * MINUTE);
    return { value: key, label: index === 0 ? `Hôm nay · ${formatDayLabel(key)}` : formatDayLabel(key) };
  });
  const portTotalPages = Math.max(1, Math.ceil(hubPorts.length / PORTS_PER_PAGE));
  const visiblePorts = hubPorts.slice(portPage * PORTS_PER_PAGE, portPage * PORTS_PER_PAGE + PORTS_PER_PAGE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Đặt lịch sạc"
        subtitle="Đặt trước trạm sạc và khung giờ phù hợp với lịch di chuyển."
        actions={<SimulationClock />}
      />

      {/* Thông tin chung */}
      <div className="card flex flex-wrap items-center justify-between gap-6">
        <div className="grid gap-6 sm:grid-cols-4">
          <div>
            <p className="muted-13">HUB</p>
            <p className="mt-1 text-[15px] font-semibold text-ink dark:text-slate-100">{hub?.name ?? '—'}</p>
          </div>
          <div>
            <p className="muted-13">Ngày</p>
            <p className="mt-1 text-[15px] font-semibold capitalize text-ink dark:text-slate-100">{formatDayLabel(dateKey)}</p>
          </div>
          <div>
            <p className="muted-13">Xe</p>
            <p className="mt-1 text-[15px] font-semibold text-ink dark:text-slate-100">{vehicle?.label ?? 'Chưa có xe'}</p>
          </div>
          <div>
            <p className="muted-13">Mức pin</p>
            <p className="mt-1 text-[15px] font-semibold text-ink dark:text-slate-100">
              {currentBattery}% → {targetBattery}%
            </p>
          </div>
        </div>
        <Button onClick={() => setEditOpen(true)}>Thay đổi</Button>
      </div>

      {!vehicle && (
        <Alert
          type="info"
          showIcon
          message="Bạn chưa có xe để đặt lịch sạc"
          description="Thêm xe cá nhân, hoặc thuê một xe dùng chung trước khi đặt lịch."
          action={<Button onClick={() => setAddVehicleOpen(true)}>Thêm xe cá nhân</Button>}
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {/* Khung giờ */}
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[17px] font-bold text-ink dark:text-slate-100">Khung giờ bắt đầu sạc</h2>
              <span className="muted-13">
                Mỗi khung {chargingConfig.slotMinutes} phút · mở cửa {chargingConfig.openHour}:00–{chargingConfig.closeHour}:00
              </span>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                className="px-1 text-muted disabled:opacity-30"
                aria-label="Trước"
                disabled={page === 0}
                onClick={() => setSlotPage(page - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <div className="grid flex-1 grid-cols-4 gap-2 sm:grid-cols-8">
                {visibleSlots.map((item) => {
                  const active = item.label === slot?.label;
                  const full = !item.disabled && item.freePorts === 0;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      disabled={item.disabled}
                      onClick={() => {
                        setSelectedSlot(item.label);
                        setSelectedPortId(null);
                      }}
                      className={`rounded-lg border px-2 py-2 text-center text-[14px] transition ${
                        active
                          ? 'border-[#176B5B] bg-[#176B5B] font-semibold text-white'
                          : item.disabled
                            ? 'cursor-not-allowed border-line bg-slate-50 text-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600'
                            : full
                              ? 'border-red-200 bg-red-50 text-red-500 dark:border-red-500/30 dark:bg-red-500/10'
                              : 'border-line bg-white text-ink hover:border-accent/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
                      }`}
                    >
                      <span className="block">{item.label}</span>
                      <span className={`block text-[10px] ${active ? 'text-white/80' : 'text-muted'}`}>
                        {item.disabled ? 'Đã qua' : full ? 'Đã đầy' : `${item.freePorts} cổng`}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="px-1 text-muted disabled:opacity-30"
                aria-label="Sau"
                disabled={page >= pageCount - 1}
                onClick={() => setSlotPage(page + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <p className="muted-13 mt-4">
              {baseEstimate && batteryValid
                ? `Thời lượng dự kiến: ${formatDuration(baseEstimate.chargeMinutes)} (giữ cổng ${durationMinutes} phút) • Cần ~${baseEstimate.energyKwh} kWh • Công suất xe nhận tối đa ${VEHICLE_PROFILES[vehicle!.type].maxPowerKw} kW`
                : 'Chọn xe và mức pin hợp lệ để ước tính thời lượng sạc.'}
            </p>
          </section>

          {/* Extension 4.1 & 5.1 */}
          {slot && freeAtSlot === 0 && (
            <Alert
              type="error"
              showIcon
              message={`Khung giờ ${slot.label} đã đầy`}
              description={
                <div className="space-y-2">
                  {alternativeSlots.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span>Khung giờ còn trống:</span>
                      {alternativeSlots.map((item) => (
                        <Button key={item.label} size="small" onClick={() => setSelectedSlot(item.label)}>
                          {item.label} · {item.freePorts} cổng
                        </Button>
                      ))}
                    </div>
                  )}
                  {alternativeHubs.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span>Trạm sạc lân cận:</span>
                      {alternativeHubs.map(({ hub: item, freePorts }) => (
                        <Button
                          key={item.id}
                          size="small"
                          onClick={() => {
                            setHubId(item.id);
                            setSelectedPortId(null);
                          }}
                        >
                          {item.name.split(' - ')[0]} · {freePorts} cổng
                        </Button>
                      ))}
                    </div>
                  )}
                  {alternativeSlots.length === 0 && alternativeHubs.length === 0 && <span>Không còn khung giờ trống trong ngày.</span>}
                </div>
              }
            />
          )}
          {overloaded && (
            <Alert
              type="warning"
              showIcon
              message="Trạm sạc đang cao điểm"
              description={`Chỉ còn ${freeAtSlot}/${compatiblePorts.length} cổng phù hợp${
                queueWaiting ? `, ${queueWaiting} xe dùng chung đang chờ sạc` : ''
              }. Thời gian chờ có thể kéo dài${
                alternativeHubs[0] ? ` — gợi ý: ${alternativeHubs[0].hub.name} còn ${alternativeHubs[0].freePorts} cổng trống` : ''
              }.`}
            />
          )}

          {/* Sơ đồ cổng */}
          <section className="card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[15px] font-semibold text-ink dark:text-slate-100">
                {hubPorts[0]?.zone ?? 'Khu A · Tầng 1'} · {slot ? `${slot.label}` : '—'}
              </p>
              <span className={freeAtSlot ? 'pill-green' : 'pill-orange'}>{freeAtSlot} cổng sạc trống</span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
              {visiblePorts.map((item) => {
                const state = portState(item.id);
                const isSelected = item.id === selectedPortId;
                const clickable = state === 'free';
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!clickable}
                    onClick={() => setSelectedPortId(item.id)}
                    className={`rounded-lg border px-3 py-2.5 text-left transition ${
                      isSelected ? 'border-[#102A43] bg-[#EAF7EF] ring-2 ring-[#102A43]/15' : PORT_STATUS_STYLE[state]
                    } ${clickable ? 'hover:shadow-sm' : 'cursor-not-allowed opacity-90'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="whitespace-nowrap text-[14px] font-semibold">{item.code}</p>
                      <p className="whitespace-nowrap text-[11px]">
                        {item.connector} {item.power}kW
                      </p>
                    </div>
                    <p className="mt-1 text-[12px]">{PORT_STATUS_LABEL[state]}</p>
                  </button>
                );
              })}
            </div>

            {portTotalPages > 1 && (
              <div className="mt-5 flex items-center justify-center gap-2">
                {Array.from({ length: portTotalPages }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setPortPage(index)}
                    className={`h-8 w-8 rounded border text-[13px] ${
                      index === portPage ? 'border-[#176B5B] text-[#176B5B]' : 'border-line text-muted dark:border-slate-800'
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Cổng đã chọn */}
        <aside className="card flex flex-col">
          <h2 className="text-[19px] font-bold text-ink dark:text-slate-100">Cổng sạc đã chọn</h2>
          {port && slot && selectedStillFree && portEstimate ? (
            <>
              <div className="mt-4 rounded-xl bg-[#EAF7EF] p-5 dark:bg-emerald-500/10">
                <p className="text-[24px] font-bold text-[#176B5B] dark:text-emerald-300">{port.code}</p>
                <p className="muted-13 mt-1">
                  {port.connector} {port.power}kW · sạc thực tế {portEstimate.powerKw} kW
                </p>
              </div>
              <p className="mt-5 text-[15px] font-semibold text-ink dark:text-slate-100">Khung giờ sạc đã chọn</p>
              <div className="mt-2 inline-flex w-fit rounded-lg bg-[#EAF7EF] px-4 py-2 text-[22px] font-bold text-[#176B5B] dark:bg-emerald-500/10 dark:text-emerald-300">
                {slot.label} – {formatHm(portWindowEnd)}
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <dt className="text-muted">Điện năng dự kiến</dt>
                  <dd className="font-semibold text-ink dark:text-slate-100">{portEstimate.energyKwh} kWh</dd>
                </div>
                <div>
                  <dt className="text-muted">Điểm ưu tiên</dt>
                  <dd className="font-semibold text-ink dark:text-slate-100">{priority.score}</dd>
                </div>
              </dl>
              <p className="mt-5 text-[13px] text-muted dark:text-slate-400">Phí dịch vụ dự kiến</p>
              <p className="text-[20px] font-bold text-ink dark:text-slate-100">
                {formatMoney(estimatePrice(portEstimate.energyKwh, chargingConfig))}
              </p>
              <p className="muted-13 mt-1">
                Gồm phí giữ chỗ {formatMoney(chargingConfig.bookingFee)} + {formatMoney(chargingConfig.pricePerKwh)}/kWh
              </p>
            </>
          ) : (
            <p className="muted-13 mt-4">Chọn một khung giờ và một cổng sạc còn trống.</p>
          )}

          <div className="mt-auto pt-6">
            <Button
              type="primary"
              size="large"
              block
              disabled={!port || !slot || !selectedStillFree || !vehicle || !batteryValid}
              onClick={() => {
                setError(null);
                setConfirmOpen(true);
              }}
            >
              Xác nhận đặt chỗ sạc
            </Button>
          </div>
        </aside>
      </div>

      {/* Lịch sạc của tôi */}
      <section className="card">
        <h2 className="section-title">Lịch sạc của tôi</h2>
        <Tabs
          items={[
            {
              key: 'active',
              label: `Sắp tới & đang sạc (${active.length})`,
              children:
                active.length === 0 ? (
                  <Empty description="Chưa có lịch sạc nào sắp tới." />
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {active.map((reservation) => {
                      const session = chargingSessions.find((item) => item.id === reservation.sessionId);
                      const start = new Date(reservation.startAt).getTime();
                      const openAt = start - chargingConfig.earlyCheckInMinutes * MINUTE;
                      const expireAt = start + chargingConfig.holdMinutes * MINUTE;
                      const canCheckIn = reservation.status === 'CONFIRMED' && now >= openAt && now < expireAt;
                      const hubName = hubs.find((item) => item.id === reservation.hubId)?.name;
                      return (
                        <div key={reservation.id} className="rounded-xl border border-line p-4 dark:border-slate-800">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-[15px] font-semibold text-ink dark:text-slate-100">
                                {reservation.portCode} · {formatHm(reservation.startAt)}–{formatHm(reservation.endAt)}
                                {toDateKey(reservation.startAt) !== todayKey && (
                                  <span className="font-normal text-muted"> · {formatDayLabel(reservation.date)}</span>
                                )}
                              </p>
                              <p className="muted-13">{hubName}</p>
                              <p className="muted-13">{reservation.vehicleLabel}</p>
                            </div>
                            <span className={RESERVATION_STATUS[reservation.status].className}>
                              {RESERVATION_STATUS[reservation.status].label}
                            </span>
                          </div>

                          {reservation.note && <p className="mt-2 text-[12px] text-amber-600">{reservation.note}</p>}

                          {session ? (
                            <div className="mt-3">
                              <SessionProgress session={session} now={now} />
                              <div className="mt-3 flex justify-end">
                                <Button
                                  type={session.status === 'FULL' ? 'primary' : 'default'}
                                  icon={<BatteryCharging size={15} />}
                                  onClick={() =>
                                    modal.confirm({
                                      title: session.status === 'FULL' ? 'Rút sạc và hoàn tất phiên?' : 'Dừng sạc sớm?',
                                      content:
                                        session.status === 'FULL'
                                          ? 'Phiên sạc sẽ được ghi nhận và cổng được giải phóng cho người khác.'
                                          : 'Xe chưa đạt mức pin mục tiêu. Bạn chỉ trả tiền cho lượng điện đã sạc.',
                                      okText: 'Xác nhận',
                                      cancelText: 'Thoát',
                                      onOk: () => {
                                        const result = completeChargingSession(session.id, 'user_stop');
                                        result.ok ? message.success(result.message) : message.error(result.message);
                                      },
                                    })
                                  }
                                >
                                  {session.status === 'FULL' ? 'Rút sạc & hoàn tất' : 'Dừng sạc'}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                                <span className="text-[13px]">
                                  Mã check-in: <b className="tracking-wider">{reservation.code}</b>
                                </span>
                                <span className="text-[12px] text-muted">
                                  {now < openAt
                                    ? `Check-in từ ${formatHm(openAt)}`
                                    : `Hết hạn giữ chỗ lúc ${formatHm(expireAt)}`}
                                </span>
                              </div>
                              <div className="mt-3 flex justify-end gap-2">
                                <Button
                                  onClick={() =>
                                    modal.confirm({
                                      title: 'Hủy lịch sạc?',
                                      content: `Cổng ${reservation.portCode} lúc ${formatHm(reservation.startAt)} sẽ được giải phóng.`,
                                      okText: 'Hủy lịch',
                                      okButtonProps: { danger: true },
                                      cancelText: 'Giữ lại',
                                      onOk: () => {
                                        const result = cancelChargingReservation(reservation.id);
                                        result.ok ? message.success(result.message) : message.error(result.message);
                                      },
                                    })
                                  }
                                >
                                  Hủy lịch
                                </Button>
                                <Button
                                  type="primary"
                                  icon={<Zap size={15} />}
                                  disabled={!canCheckIn}
                                  onClick={() => {
                                    setCheckInCode('');
                                    setCheckInTarget(reservation);
                                  }}
                                >
                                  Check-in tại cổng
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ),
            },
            {
              key: 'history',
              label: `Lịch sử (${history.length})`,
              children:
                history.length === 0 ? (
                  <Empty description="Chưa có lịch sử sạc." />
                ) : (
                  <div className="divide-y divide-line dark:divide-slate-800">
                    {history.map((reservation) => {
                      const session = chargingSessions.find((item) => item.id === reservation.sessionId);
                      return (
                        <div key={reservation.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                          <div>
                            <p className="text-[14px] font-semibold text-ink dark:text-slate-100">
                              {reservation.portCode} · {formatDayLabel(reservation.date)} · {formatHm(reservation.startAt)}
                            </p>
                            <p className="muted-13">
                              {hubs.find((item) => item.id === reservation.hubId)?.name} · {reservation.vehicleLabel}
                            </p>
                            {reservation.note && <p className="text-[12px] text-amber-600">{reservation.note}</p>}
                          </div>
                          <div className="flex items-center gap-4 text-right">
                            {session?.status === 'COMPLETED' && (
                              <div className="text-[13px]">
                                <p className="font-semibold text-ink dark:text-slate-100">
                                  {session.energyKwh} kWh · {formatMoney(session.cost ?? 0)}
                                </p>
                                <p className="text-muted">
                                  {Math.round(session.startBattery)}% → {Math.round(session.endBattery ?? 0)}% ·{' '}
                                  {session.endReason ? END_REASON_LABEL[session.endReason] : ''}
                                </p>
                              </div>
                            )}
                            <span className={RESERVATION_STATUS[reservation.status].className}>
                              {RESERVATION_STATUS[reservation.status].label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ),
            },
          ]}
        />
      </section>

      {/* Thay đổi thông tin */}
      <Modal open={editOpen} onCancel={() => setEditOpen(false)} footer={null} centered width={540}>
        <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">Thay đổi thông tin đặt lịch</h3>
        <div className="mt-4 space-y-4">
          <div>
            <p className="muted-13 mb-1">HUB</p>
            <Select
              value={hub?.id}
              onChange={(value) => {
                setHubId(value);
                resetSelection();
              }}
              className="w-full"
              options={hubs.map((item) => ({
                value: item.id,
                label: item.name,
                disabled: item.status === 'maintenance',
              }))}
            />
          </div>
          <div>
            <p className="muted-13 mb-1">Ngày sạc</p>
            <Select
              value={dateKey}
              onChange={(value) => {
                setDateKey(value);
                resetSelection();
              }}
              className="w-full capitalize"
              options={dayOptions}
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="muted-13">Xe cần sạc</p>
              <button type="button" className="link-green flex items-center gap-1" onClick={() => setAddVehicleOpen(true)}>
                <Plus size={14} /> Thêm xe cá nhân
              </button>
            </div>
            <Select
              value={vehicle?.key}
              onChange={(value) => {
                setVehicleKey(value);
                setSelectedPortId(null);
              }}
              className="w-full"
              placeholder="Chưa có xe"
              options={vehicleChoices.map((item) => ({
                value: item.key,
                label: `${item.label} — ${VEHICLE_PROFILES[item.type].label}`,
              }))}
            />
          </div>
          <div>
            <p className="muted-13 mb-1">
              Mức pin hiện tại → mục tiêu: <b>{currentBattery}%</b> → <b>{targetBattery}%</b>
            </p>
            <Slider
              range
              min={0}
              max={100}
              value={[currentBattery, targetBattery]}
              onChange={(value) => {
                const [from, to] = value as number[];
                setCurrentBattery(from);
                setTargetBattery(to);
                setSelectedPortId(null);
              }}
            />
            {!batteryValid && <p className="text-[12px] text-red-500">Mức pin mục tiêu phải lớn hơn mức pin hiện tại.</p>}
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <Button type="primary" onClick={() => setEditOpen(false)}>
            Xong
          </Button>
        </div>
      </Modal>

      {/* Thêm xe cá nhân */}
      <Modal open={addVehicleOpen} onCancel={() => setAddVehicleOpen(false)} footer={null} centered width={480}>
        <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">Thêm xe cá nhân</h3>
        <div className="mt-4 space-y-3">
          <Input
            placeholder="Biển số, ví dụ 59X1-123.45"
            value={newVehicle.licensePlate}
            onChange={(event) => setNewVehicle({ ...newVehicle, licensePlate: event.target.value })}
          />
          <Input
            placeholder="Tên xe, ví dụ VinFast Evo"
            value={newVehicle.model}
            onChange={(event) => setNewVehicle({ ...newVehicle, model: event.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              value={newVehicle.type}
              onChange={(type) =>
                setNewVehicle({ ...newVehicle, type, batteryCapacityKwh: VEHICLE_PROFILES[type].capacityKwh })
              }
              options={(Object.keys(VEHICLE_PROFILES) as PersonalVehicleType[]).map((type) => ({
                value: type,
                label: VEHICLE_PROFILES[type].label,
              }))}
            />
            <InputNumber
              className="w-full"
              min={0.1}
              max={200}
              step={0.1}
              suffix="kWh"
              value={newVehicle.batteryCapacityKwh}
              onChange={(value) => setNewVehicle({ ...newVehicle, batteryCapacityKwh: value ?? 1 })}
            />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setAddVehicleOpen(false)}>Thoát</Button>
          <Button
            type="primary"
            onClick={() => {
              const result = addPersonalVehicle({ ...newVehicle, ownerId: studentId });
              if (!result.ok || !result.vehicle) {
                message.error(result.message);
                return;
              }
              message.success(result.message);
              setVehicleKey(`p:${result.vehicle.id}`);
              setAddVehicleOpen(false);
              setNewVehicle({ licensePlate: '', model: '', type: 'motorbike', batteryCapacityKwh: 3.5 });
            }}
          >
            Thêm xe
          </Button>
        </div>
      </Modal>

      {/* Xác nhận đặt */}
      <Modal open={confirmOpen} onCancel={() => setConfirmOpen(false)} footer={null} centered width={560}>
        <h3 className="text-[20px] font-bold text-ink dark:text-slate-100">Xác nhận đặt chỗ sạc xe</h3>
        <div className="mt-4 rounded-2xl bg-[#102A43] p-6 text-white">
          <p className="text-[17px] font-bold">Chi tiết chỗ sạc xe</p>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <DarkField label="HUB">{hub?.name}</DarkField>
            </div>
            <DarkField label="Ngày">{formatDayLabel(dateKey)}</DarkField>
            <DarkField label="Khung giờ">
              {slot?.label} – {portWindowEnd ? formatHm(portWindowEnd) : ''}
            </DarkField>
            <DarkField label="Vị trí sạc xe">
              {port?.code} · {port?.connector} {port?.power}kW
            </DarkField>
            <DarkField label="Xe">{vehicle?.label}</DarkField>
            <DarkField label="Mức pin">
              {currentBattery}% → {targetBattery}%
            </DarkField>
            <DarkField label="Phí dự kiến">
              {portEstimate ? formatMoney(estimatePrice(portEstimate.energyKwh, chargingConfig)) : '—'}
            </DarkField>
          </dl>
        </div>
        <p className="muted-13 mt-3">
          Vui lòng check-in tại cổng trong khoảng {chargingConfig.earlyCheckInMinutes} phút trước đến{' '}
          {chargingConfig.holdMinutes} phút sau giờ bắt đầu. Quá thời gian, lịch sẽ tự động bị hủy.
        </p>
        {error && <p className="mt-3 text-[13px] text-red-500">{error}</p>}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setConfirmOpen(false)}>Thoát</Button>
          <Button type="primary" onClick={handleConfirm}>
            Đặt chỗ sạc xe
          </Button>
        </div>
      </Modal>

      {/* Mã xác nhận */}
      <Modal open={created !== null} onCancel={() => setCreated(null)} footer={null} centered width={560}>
        <h3 className="text-[20px] font-bold text-ink dark:text-slate-100">Mã xác nhận đặt chỗ sạc xe</h3>
        {created && (
          <div className="mt-4 rounded-2xl bg-[#102A43] p-6 text-white">
            <p className="text-[17px] font-bold">Chi tiết chỗ sạc xe</p>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <DarkField label="HUB">{hubs.find((item) => item.id === created.hubId)?.name}</DarkField>
              </div>
              <DarkField label="Khung giờ">
                {formatHm(created.startAt)} – {formatHm(created.endAt)}
              </DarkField>
              <DarkField label="Vị trí sạc xe">{created.portCode}</DarkField>
              <DarkField label="Hạn check-in">{formatHm(addMinutes(created.startAt, chargingConfig.holdMinutes))}</DarkField>
              <DarkField label="Mã xác nhận">
                <span className="text-[20px] tracking-widest">{created.code}</span>
              </DarkField>
            </dl>
          </div>
        )}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setCreated(null)}>Thoát</Button>
          <Button
            type="primary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(created?.code ?? '');
                message.success('Đã lưu mã vào bộ nhớ tạm.');
              } catch {
                message.info(`Mã đặt chỗ sạc: ${created?.code}`);
              }
              setCreated(null);
            }}
          >
            Lưu mã
          </Button>
        </div>
      </Modal>

      {/* Check-in */}
      <Modal open={checkInTarget !== null} onCancel={() => setCheckInTarget(null)} footer={null} centered width={460}>
        <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">Check-in tại cổng {checkInTarget?.portCode}</h3>
        <p className="muted-13 mt-1">Nhập mã xác nhận hiển thị khi đặt lịch (hoặc quét QR tại cổng).</p>
        <Input
          className="mt-4"
          size="large"
          placeholder="Ví dụ SAC123456"
          value={checkInCode}
          onChange={(event) => setCheckInCode(event.target.value.toUpperCase())}
          onPressEnter={() => document.getElementById('checkin-submit')?.click()}
        />
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setCheckInTarget(null)}>Thoát</Button>
          <Button
            id="checkin-submit"
            type="primary"
            onClick={() => {
              const result = checkInCharging(checkInCode, studentId);
              if (!result.ok) {
                message.error(result.message);
                return;
              }
              message.success(result.message);
              setCheckInTarget(null);
            }}
          >
            Bắt đầu sạc
          </Button>
        </div>
      </Modal>
    </div>
  );
}
