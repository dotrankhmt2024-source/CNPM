import { useMemo, useState } from 'react';
import { App as AntApp, Button, Input, Modal, Select } from 'antd';
import { PageHeader } from '@/client/shared/components/PageHeader';
import { useAppStore } from '@/client/api/useAppStore';
import { useAuthStore } from '@/client/api/useAuthStore';
import { useMyChargingBookings } from '@/client/api/useMyData';
import { apiGateway } from '@/gateway';
import { toDateKey } from '@/shared/clock';
import { isConnectorCompatible, VEHICLE_PROFILES } from '@/shared/domain/vehicleProfiles';
import type { ChargingSlotStatus } from '@/contracts/Mobility';
import type { PersonalVehicleType } from '@/shared/types/domain';

const DURATION_MINUTES = 60;

const statusLabel: Record<ChargingSlotStatus, string> = {
  free: 'Trống',
  used: 'Đang dùng',
  reserved: 'Đã đặt',
  maintenance: 'Bảo trì',
};

const statusStyle: Record<ChargingSlotStatus, string> = {
  free: 'border-[#176B5B] bg-[#EAF7EF] text-[#176B5B]',
  used: 'border-[#E2BF8A] bg-[#FDF4E5] text-[#9A6B1F]',
  reserved: 'border-[#9DB8F5] bg-[#EEF4FF] text-[#2563EB]',
  maintenance: 'border-[#F0A8A8] bg-[#FDECEC] text-[#C04343]',
};

const formatDate = (date: Date) =>
  date.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const pad = (value: number) => String(value).padStart(2, '0');
const hm = (minutesOfDay: number) => `${pad(Math.floor(minutesOfDay / 60))}:${pad(minutesOfDay % 60)}`;

/** Khung giờ còn nhận lịch trong hôm nay (bắt đầu từ mốc kế tiếp, đủ thời lượng sạc). */
function buildTimeSlots(config: { openHour: number; closeHour: number; slotMinutes: number }, now: number) {
  const date = new Date(now);
  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  const step = Math.max(5, config.slotMinutes);
  const first = Math.max(config.openHour * 60, Math.ceil((nowMinutes + step) / step) * step);
  const last = config.closeHour * 60 - DURATION_MINUTES;
  const slots: string[] = [];
  for (let minute = first; minute <= last; minute += step) slots.push(hm(minute));
  return slots;
}

export function ChargingPage() {
  const { message, modal } = AntApp.useApp();
  const hubs = useAppStore((state) => state.hubs);
  const config = useAppStore((state) => state.chargingConfig);
  const myChargingBookings = useMyChargingBookings();
  const user = useAuthStore((state) => state.currentUser);
  const bookChargingSlot = useAppStore((state) => state.bookChargingSlot);
  const cancelChargingSlot = useAppStore((state) => state.cancelChargingSlot);

  const [hubId, setHubId] = useState(hubs[0]?.id ?? '');
  const [selectedPort, setSelectedPort] = useState<string | null>(null);
  // Xe cá nhân: người dùng tự nhập tên/biển số, để trống thì mặc định "Xe của <tên>".
  const [vehicleLabel, setVehicleLabel] = useState('');
  const [vehicleType, setVehicleType] = useState<PersonalVehicleType>('motorbike');
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [bookingCode, setBookingCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Hộp thoại nhập mã lấy chỗ / trả chỗ sạc. */
  const [checkOpen, setCheckOpen] = useState<null | 'in' | 'out'>(null);
  const [checkCode, setCheckCode] = useState('');
  const [checkError, setCheckError] = useState<string | null>(null);

  const today = useMemo(() => formatDate(new Date()), []);
  const dateKey = toDateKey(new Date());
  const timeSlots = useMemo(() => buildTimeSlots(config, Date.now()), [config]);
  const [selectedTime, setSelectedTime] = useState(timeSlots[0] ?? '');
  const startTime = timeSlots.includes(selectedTime) ? selectedTime : (timeSlots[0] ?? '');

  const hub = hubs.find((item) => item.id === hubId) ?? null;
  const slots = hub ? apiGateway.student.chargingSlots(hub.id, dateKey, startTime, DURATION_MINUTES) : [];
  const port = slots.find((item) => item.port.id === selectedPort)?.port ?? null;
  const freePorts = slots.filter((item) => item.status === 'free').length;
  const mine = myChargingBookings.filter(
    (booking) => booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN',
  );

  const profile = VEHICLE_PROFILES[vehicleType];
  const displayLabel = vehicleLabel.trim() || `Xe của ${user?.fullName ?? 'bạn'}`;
  const vehicleId = `personal-${user?.id ?? 'guest'}-${displayLabel.toLocaleLowerCase('vi').replace(/\s+/g, '-')}`;
  /** Pin của xe cá nhân chưa khai báo: giả định 30% và sạc tới mức mục tiêu mặc định. */
  const currentBattery = 30;
  const targetBattery = Math.min(100, Math.max(config.defaultTargetBattery, currentBattery + 5));

  const handleConfirm = () => {
    if (!port || !user) return;
    const result = bookChargingSlot({
      hubId,
      portId: port.id,
      dateKey,
      startTime,
      durationMinutes: DURATION_MINUTES,
      vehicleKind: 'personal',
      vehicleId,
      vehicleLabel: displayLabel,
      vehicleType,
      batteryCapacityKwh: profile.capacityKwh,
      currentBattery,
      targetBattery,
    });
    if (!result.ok || !result.booking) {
      setError(result.message);
      return;
    }
    setError(null);
    setConfirmOpen(false);
    setBookingCode(result.booking.code);
    setCodeOpen(true);
  };

  const handleCancel = (bookingId: string, code: string) => {
    modal.confirm({
      title: 'Huỷ lịch sạc?',
      content: `Lịch sạc ${code} sẽ được huỷ và cổng sạc được giải phóng.`,
      okText: 'Huỷ lịch',
      cancelText: 'Giữ lịch',
      okButtonProps: { danger: true },
      onOk: () => {
        const result = cancelChargingSlot(bookingId);
        result.ok ? message.success(result.message) : message.error(result.message);
      },
    });
  };

  /** Nhập mã lấy chỗ / trả chỗ sạc. */
  const handleCheckCode = () => {
    if (!checkOpen) return;
    const result =
      checkOpen === 'in'
        ? apiGateway.student.checkInChargingSlot(checkCode)
        : apiGateway.student.checkOutChargingSlot(checkCode);
    if (!result.ok) {
      setCheckError(result.message);
      return;
    }
    setCheckError(null);
    setCheckOpen(null);
    setCheckCode('');
    message.success(result.message);
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(bookingCode);
      message.success('Đã lưu mã vào bộ nhớ tạm.');
    } catch {
      message.info(`Mã đặt chỗ sạc: ${bookingCode}`);
    }
    setCodeOpen(false);
    setSelectedPort(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Đặt lịch sạc"
        subtitle="Đặt trước trạm sạc và khung giờ phù hợp với lịch di chuyển."
      />

      <div className="card flex flex-wrap items-center justify-between gap-6">
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <p className="muted-13">HUB</p>
            <p className="mt-1 text-[15px] font-semibold text-ink dark:text-slate-100">
              {hub?.name ?? '—'}
            </p>
          </div>
          <div>
            <p className="muted-13">Ngày</p>
            <p className="mt-1 text-[15px] font-semibold capitalize text-ink dark:text-slate-100">
              {today}
            </p>
          </div>
          <div>
            <p className="muted-13">Xe</p>
            <p className="mt-1 text-[15px] font-semibold text-ink dark:text-slate-100">{displayLabel}</p>
          </div>
        </div>
        <Button onClick={() => setEditOpen(true)}>Thay đổi</Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className="card">
            <h2 className="text-[17px] font-bold text-ink dark:text-slate-100">
              Khung giờ bắt đầu sạc
            </h2>

            {timeSlots.length === 0 ? (
              <p className="muted-13 mt-4">
                Hôm nay đã hết khung giờ nhận lịch sạc (Hub nhận lịch từ {config.openHour}:00 đến{' '}
                {config.closeHour}:00).
              </p>
            ) : (
              <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
                {timeSlots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => {
                      setSelectedTime(slot);
                      setSelectedPort(null);
                    }}
                    className={`shrink-0 rounded-lg border px-4 py-2.5 text-[14px] transition ${
                      slot === startTime
                        ? 'border-[#176B5B] bg-[#176B5B] font-semibold text-white'
                        : 'border-line bg-white text-ink hover:border-accent/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}

            <p className="muted-13 mt-4">
              Thời lượng dự kiến: {DURATION_MINUTES} phút • Giá điện{' '}
              {config.pricePerKwh.toLocaleString('vi-VN')} đ/kWh
            </p>
          </section>

          <section className="card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[15px] font-semibold text-ink dark:text-slate-100">
                Cổng sạc · {startTime}
              </p>
              <span className="pill-green">{freePorts} cổng sạc trống</span>
            </div>

            {slots.length === 0 ? (
              <p className="muted-13">Hub này chưa có cổng sạc nào.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {slots.map((item) => {
                  const isSelected = item.port.id === selectedPort;
                  const compatible = isConnectorCompatible(vehicleType, item.port.connector);
                  const clickable = item.status === 'free' && compatible;
                  return (
                    <button
                      key={item.port.id}
                      type="button"
                      disabled={!clickable && !isSelected}
                      onClick={() => setSelectedPort(item.port.id)}
                      className={`rounded-lg border px-3 py-2.5 text-left transition ${
                        isSelected
                          ? 'border-[#102A43] bg-[#EAF7EF] ring-2 ring-[#102A43]/15'
                          : statusStyle[item.status]
                      } ${clickable ? 'hover:shadow-sm' : 'cursor-not-allowed opacity-90'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[14px] font-semibold">{item.port.code}</p>
                        <p className="text-[11px]">
                          {item.port.connector} {item.port.power}kW
                        </p>
                      </div>
                      <p className="mt-1 text-[12px]">
                        {compatible ? statusLabel[item.status] : 'Không tương thích'}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="text-[17px] font-bold text-ink dark:text-slate-100">Lịch sạc của tôi</h2>
            {mine.length === 0 ? (
              <p className="muted-13 mt-2">Bạn chưa có lịch sạc nào đang hiệu lực.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {mine.map((booking) => {
                  const bookingHub = hubs.find((item) => item.id === booking.hubId);
                  return (
                    <li
                      key={booking.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 dark:border-slate-800"
                    >
                      <div>
                        <p className="text-[14px] font-semibold text-ink dark:text-slate-100">
                          {booking.portCode} · {bookingHub?.name.split(' - ')[0] ?? booking.hubId} · {booking.startTime}
                        </p>
                        <p className="muted-13">
                          Mã {booking.code} · {booking.durationMinutes} phút ·{' '}
                          {booking.price.toLocaleString('vi-VN')} đ
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={booking.status === 'CHECKED_IN' ? 'pill-green' : 'pill-blue'}>
                          {booking.status === 'CHECKED_IN' ? 'Đang sạc' : 'Đã đặt'}
                        </span>
                        <Button
                          size="small"
                          type={booking.status === 'CONFIRMED' ? 'primary' : 'default'}
                          onClick={() => {
                            setCheckCode('');
                            setCheckError(null);
                            setCheckOpen(booking.status === 'CHECKED_IN' ? 'out' : 'in');
                          }}
                        >
                          {booking.status === 'CHECKED_IN' ? 'Nhập mã trả chỗ' : 'Nhập mã lấy chỗ'}
                        </Button>
                        {booking.status === 'CONFIRMED' && (
                          <Button size="small" danger onClick={() => handleCancel(booking.id, booking.code)}>
                            Huỷ lịch
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="card flex flex-col">
          <h2 className="text-[19px] font-bold text-ink dark:text-slate-100">Cổng sạc đã chọn</h2>

          {port ? (
            <>
              <div className="mt-4 rounded-xl bg-[#EAF7EF] p-5 dark:bg-emerald-500/10">
                <p className="text-[24px] font-bold text-[#176B5B] dark:text-emerald-300">{port.code}</p>
                <p className="muted-13 mt-1">
                  {port.connector} {port.power}kW · {port.zone}
                </p>
              </div>
              <p className="mt-5 text-[15px] font-semibold text-ink dark:text-slate-100">
                Khung giờ sạc đã chọn
              </p>
              <div className="mt-2 inline-flex w-fit rounded-lg bg-[#EAF7EF] px-4 py-2 text-[22px] font-bold text-[#176B5B] dark:bg-emerald-500/10 dark:text-emerald-300">
                {startTime}
              </div>
              <p className="muted-13 mt-4">Phí giữ chỗ</p>
              <p className="text-[20px] font-bold text-ink dark:text-slate-100">
                {config.bookingFee.toLocaleString('vi-VN')} đ
              </p>
            </>
          ) : (
            <p className="muted-13 mt-4">Chọn một cổng sạc còn trống và khung giờ bắt đầu.</p>
          )}

          <div className="mt-auto pt-6">
            <Button
              type="primary"
              size="large"
              block
              disabled={!port}
              onClick={() => {
                setError(null);
                setConfirmOpen(true);
              }}
            >
              Xác nhận đặt chỗ sạc
            </Button>
            {!port && (
              <p className="mt-2 text-center text-[12px] text-muted dark:text-slate-400">
                Chọn một cổng sạc còn trống ở khung giờ trên để đặt lịch.
              </p>
            )}
          </div>
        </aside>
      </div>

      <Modal open={editOpen} onCancel={() => setEditOpen(false)} footer={null} centered width={520}>
        <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">
          Thay đổi thông tin đặt lịch
        </h3>
        <div className="mt-4 space-y-3">
          <div>
            <p className="muted-13 mb-1">HUB</p>
            <Select
              value={hubId}
              onChange={(value) => {
                setHubId(value);
                setSelectedPort(null);
                setEditOpen(false);
              }}
              className="w-full"
              options={hubs.map((item) => ({ value: item.id, label: item.name }))}
            />
          </div>
          <div>
            <p className="muted-13 mb-1">Xe của bạn</p>
            <Input
              value={vehicleLabel}
              onChange={(event) => setVehicleLabel(event.target.value)}
              placeholder={`Xe của ${user?.fullName ?? 'bạn'}`}
              maxLength={60}
              allowClear
            />
            <p className="muted-13 mt-1">Để trống sẽ dùng tên mặc định “Xe của {user?.fullName ?? 'bạn'}”.</p>
          </div>
          <div>
            <p className="muted-13 mb-1">Loại xe</p>
            <Select
              value={vehicleType}
              onChange={setVehicleType}
              className="w-full"
              options={[
                { value: 'bike', label: 'Xe đạp điện' },
                { value: 'motorbike', label: 'Xe máy điện' },
                { value: 'car', label: 'Ô tô điện' },
              ]}
            />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setEditOpen(false)}>Đóng</Button>
          <Button type="primary" onClick={() => setEditOpen(false)}>
            Lưu thay đổi
          </Button>
        </div>
      </Modal>

      <Modal open={confirmOpen} onCancel={() => setConfirmOpen(false)} footer={null} centered width={560}>
        <h3 className="text-[20px] font-bold text-ink dark:text-slate-100">
          Xác nhận đặt chỗ sạc xe
        </h3>

        <div className="mt-4 rounded-2xl bg-[#102A43] p-6 text-white">
          <p className="text-[17px] font-bold">Chi tiết chỗ sạc xe</p>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">HUB</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{hub?.name}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Xe</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">
                {displayLabel} · {profile.label}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Khung giờ bắt đầu sạc</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">
                {startTime} · {DURATION_MINUTES} phút
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Vị trí sạc xe</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">
                {port?.code} · {port?.connector} {port?.power}kW
              </dd>
            </div>
          </dl>
        </div>

        {error && <p className="mt-3 text-[13px] text-red-500">{error}</p>}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setConfirmOpen(false)}>Thoát</Button>
          <Button type="primary" onClick={handleConfirm}>
            Đặt chỗ sạc xe
          </Button>
        </div>
      </Modal>

      <Modal open={codeOpen} onCancel={() => setCodeOpen(false)} footer={null} centered width={560}>
        <h3 className="text-[20px] font-bold text-ink dark:text-slate-100">
          Mã xác nhận đặt chỗ sạc xe
        </h3>

        <div className="mt-4 rounded-2xl bg-[#102A43] p-6 text-white">
          <p className="text-[17px] font-bold">Chi tiết chỗ sạc xe</p>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">HUB nhận</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{hub?.name}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Khung giờ bắt đầu sạc</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{startTime}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Vị trí sạc xe</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{port?.code}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Mã xác nhận</dt>
              <dd className="mt-0.5 text-[14px] font-semibold tracking-wide">{bookingCode}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button
            onClick={() => {
              setCodeOpen(false);
              setSelectedPort(null);
            }}
          >
            Thoát
          </Button>
          <Button type="primary" onClick={copyCode}>
            Lưu mã
          </Button>
        </div>
      </Modal>

      {/* Nhập mã lấy chỗ / trả chỗ sạc */}
      <Modal
        open={checkOpen !== null}
        onCancel={() => {
          setCheckOpen(null);
          setCheckError(null);
        }}
        footer={null}
        centered
        width={480}
      >
        <h3 className="text-[20px] font-bold text-ink dark:text-slate-100">
          {checkOpen === 'in' ? 'Lấy chỗ sạc' : 'Trả chỗ sạc'}
        </h3>
        <p className="muted-13 mt-1">
          {checkOpen === 'in'
            ? 'Nhập mã đặt lịch sạc (dạng SAC…) để bắt đầu phiên sạc tại cổng.'
            : 'Nhập mã đặt lịch sạc để kết thúc phiên và giải phóng cổng.'}
        </p>

        <input
          value={checkCode}
          onChange={(event) => {
            setCheckCode(event.target.value);
            setCheckError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleCheckCode();
          }}
          placeholder="Nhập mã đặt lịch sạc"
          className="mt-4 w-full rounded-lg border border-line px-4 py-3 text-[15px] uppercase tracking-wide outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          autoFocus
        />
        {checkError && <p className="mt-2 text-[13px] text-red-500">{checkError}</p>}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setCheckOpen(null)}>Thoát</Button>
          <Button type="primary" disabled={!checkCode.trim()} onClick={handleCheckCode}>
            {checkOpen === 'in' ? 'Lấy chỗ' : 'Trả chỗ'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
