import { useMemo, useState } from 'react';
import { App as AntApp, Button, Modal, Select } from 'antd';
import { PageHeader } from '@/client/shared/components/PageHeader';
import { useAppStore } from '@/client/api/useAppStore';

const timeSlots = ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];

const statusLabel = {
  free: 'Trống',
  used: 'Đang dùng',
  reserved: 'Đã đặt',
} as const;

const statusStyle = {
  free: 'border-[#176B5B] bg-[#EAF7EF] text-[#176B5B]',
  used: 'border-[#E2BF8A] bg-[#FDF4E5] text-[#9A6B1F]',
  reserved: 'border-[#9DB8F5] bg-[#EEF4FF] text-[#2563EB]',
} as const;

const formatDate = (date: Date) =>
  date.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

export function ChargingPage() {
  const { message } = AntApp.useApp();
  const hubs = useAppStore((state) => state.hubs);
  const ports = useAppStore((state) => state.chargingPorts);
  const vehicles = useAppStore((state) => state.vehicles);
  const reservations = useAppStore((state) => state.chargingReservations);
  const bookCharging = useAppStore((state) => state.bookCharging);

  const [hubId, setHubId] = useState(hubs[0]?.id ?? '');
  const [selectedTime, setSelectedTime] = useState('15:00');
  const [selectedPort, setSelectedPort] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [bookingCode, setBookingCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => formatDate(new Date()), []);
  const hub = hubs.find((item) => item.id === hubId) ?? null;
  const hubPorts = ports.filter((port) => port.hubId === hubId);
  const freePorts = hubPorts.filter((port) => port.status === 'free').length;
  const port = hubPorts.find((item) => item.code === selectedPort) ?? null;
  const vehicle = vehicles.find((item) => item.status === 'available') ?? vehicles[0] ?? null;
  const activeReservation =
    reservations.find((item) => item.status === 'reserved' && item.hubId === hubId) ?? null;

  const handleConfirm = () => {
    if (!port) return;
    const result = bookCharging({
      hubId,
      portCode: port.code,
      date: today,
      startTime: selectedTime,
      durationMinutes: 60,
      power: port.power,
    });
    if (!result.ok || !result.reservation) {
      setError(result.message);
      return;
    }
    setError(null);
    setConfirmOpen(false);
    setBookingCode(result.reservation.code);
    setCodeOpen(true);
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
            <p className="mt-1 text-[15px] font-semibold text-ink dark:text-slate-100">
              {vehicle?.model ?? '—'}
            </p>
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

            <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
              <button type="button" className="px-1 text-muted" aria-label="Trước">
                ‹
              </button>
              {timeSlots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setSelectedTime(slot)}
                  className={`shrink-0 rounded-lg border px-4 py-2.5 text-[14px] transition ${
                    slot === selectedTime
                      ? 'border-[#176B5B] bg-[#176B5B] font-semibold text-white'
                      : 'border-line bg-white text-ink hover:border-accent/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
                  }`}
                >
                  {slot}
                </button>
              ))}
              <button type="button" className="px-1 text-muted" aria-label="Sau">
                ›
              </button>
            </div>

            <p className="muted-13 mt-4">
              Thời lượng dự kiến: 60 phút • Công suất tối đa: 120kW
            </p>
          </section>

          <section className="card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[15px] font-semibold text-ink dark:text-slate-100">
                Khu A · Tầng 1 · {selectedTime}
              </p>
              <span className="pill-green">{freePorts} cổng sạc trống</span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {hubPorts.map((item) => {
                const isSelected = item.code === selectedPort;
                const clickable = item.status === 'free' || isSelected;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!clickable}
                    onClick={() => setSelectedPort(item.code)}
                    className={`rounded-lg border px-3 py-2.5 text-left transition ${
                      isSelected
                        ? 'border-[#102A43] bg-[#EAF7EF] ring-2 ring-[#102A43]/15'
                        : statusStyle[item.status]
                    } ${clickable ? 'hover:shadow-sm' : 'cursor-not-allowed opacity-90'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[14px] font-semibold">{item.code}</p>
                      <p className="text-[11px]">AC {item.power}kW</p>
                    </div>
                    <p className="mt-1 text-[12px]">{statusLabel[item.status]}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-center gap-2">
              <button type="button" className="px-2 text-muted" aria-label="Trang trước">
                ‹
              </button>
              {[1, 2, 3].map((page) => (
                <button
                  key={page}
                  type="button"
                  className={`h-8 w-8 rounded border text-[13px] ${
                    page === 1
                      ? 'border-[#176B5B] text-[#176B5B]'
                      : 'border-line text-muted dark:border-slate-800'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button type="button" className="px-2 text-muted" aria-label="Trang sau">
                ›
              </button>
            </div>
          </section>
        </div>

        <aside className="card flex flex-col">
          <h2 className="text-[19px] font-bold text-ink dark:text-slate-100">
            {activeReservation ? 'Cổng sạc đã đặt' : 'Cổng sạc đã chọn'}
          </h2>

          {activeReservation ? (
            <>
              <div className="mt-4 rounded-xl bg-[#EAF7EF] p-5 dark:bg-emerald-500/10">
                <p className="text-[24px] font-bold text-[#176B5B] dark:text-emerald-300">
                  {activeReservation.portCode}
                </p>
                <p className="muted-13 mt-1">AC {activeReservation.power}kW</p>
              </div>
              <p className="mt-5 text-[15px] font-semibold text-ink dark:text-slate-100">
                Khung giờ sạc đã chọn
              </p>
              <div className="mt-2 inline-flex w-fit rounded-lg bg-[#EAF7EF] px-4 py-2 text-[22px] font-bold text-[#176B5B] dark:bg-emerald-500/10 dark:text-emerald-300">
                {activeReservation.startTime}
              </div>
              <p className="muted-13 mt-4">Mã xác nhận</p>
              <p className="text-[16px] font-semibold tracking-wide text-ink dark:text-slate-100">
                {activeReservation.code}
              </p>
              <p className="mt-4 text-[13px] text-muted dark:text-slate-400">Phí dịch vụ</p>
              <p className="text-[20px] font-bold text-ink dark:text-slate-100">
                {activeReservation.price.toLocaleString('vi-VN')} đ
              </p>
            </>
          ) : port ? (
            <>
              <div className="mt-4 rounded-xl bg-[#EAF7EF] p-5 dark:bg-emerald-500/10">
                <p className="text-[24px] font-bold text-[#176B5B] dark:text-emerald-300">
                  {port.code}
                </p>
                <p className="muted-13 mt-1">AC {port.power}kW</p>
              </div>
              <p className="mt-5 text-[15px] font-semibold text-ink dark:text-slate-100">
                Khung giờ sạc đã chọn
              </p>
              <div className="mt-2 inline-flex w-fit rounded-lg bg-[#EAF7EF] px-4 py-2 text-[22px] font-bold text-[#176B5B] dark:bg-emerald-500/10 dark:text-emerald-300">
                {selectedTime}
              </div>
              <p className="mt-5 text-[13px] text-muted dark:text-slate-400">Phí dịch vụ</p>
              <p className="text-[20px] font-bold text-ink dark:text-slate-100">
                {(port.power >= 120 ? 90000 : 50000).toLocaleString('vi-VN')} đ
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
              disabled={!port || Boolean(activeReservation)}
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
            <p className="muted-13 mb-1">Xe</p>
            <Select
              value={vehicle?.id}
              className="w-full"
              options={vehicles.slice(0, 5).map((item) => ({
                value: item.id,
                label: `${item.code} · ${item.model}`,
              }))}
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

      <Modal
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        footer={null}
        centered
        width={560}
      >
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
              <dt className="text-[12px] text-[#AFC1D4]">Khung giờ bắt đầu sạc</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{selectedTime}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Vị trí sạc xe</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{port?.code}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Tình trạng</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{port?.power}kW</dd>
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
              <dt className="text-[12px] text-[#AFC1D4]">HUB</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{hub?.name}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Khung giờ bắt đầu sạc</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{selectedTime}</dd>
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
    </div>
  );
}
