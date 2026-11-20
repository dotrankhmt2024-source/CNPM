import { useState } from 'react';
import { App as AntApp, Button, Modal, Select } from 'antd';
import { PageHeader } from '@/client/shared/components/PageHeader';
import { useAppStore } from '@/client/api/useAppStore';
import { useMyParkingReservations } from '@/client/api/useMyData';
import { apiGateway } from '@/gateway';

const PAGE_SIZE = 12;

const timeOptions = Array.from({ length: 30 }, (_, index) => {
  const minutes = 6 * 60 + index * 30;
  const label = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return { value: label, label };
});

const vehicleTypes = [
  { value: 'Xe máy điện', label: 'Xe máy điện' },
  { value: 'Xe ô tô (4 chỗ)', label: 'Xe ô tô (4 chỗ)' },
  { value: 'Xe ô tô (7 chỗ)', label: 'Xe ô tô (7 chỗ)' },
];

const statusLabel = {
  free: 'Trống',
  used: 'Đang dùng',
  reserved: 'Đã đặt',
  maintenance: 'Đang bảo trì',
} as const;

const statusStyle = {
  free: 'border-[#176B5B] bg-[#EAF7EF] text-[#176B5B]',
  used: 'border-[#E2BF8A] bg-[#FDF4E5] text-[#9A6B1F]',
  reserved: 'border-[#9DB8F5] bg-[#EEF4FF] text-[#2563EB]',
  maintenance: 'border-[#F0A8A8] bg-[#FDECEC] text-[#C04343]',
} as const;

export function ParkingPage() {
  const { message } = AntApp.useApp();
  const hubs = useAppStore((state) => state.hubs);
  const slots = useAppStore((state) => state.parkingSlots);
  const reservations = useMyParkingReservations();
  const bookParking = useAppStore((state) => state.bookParking);
  const cancelParking = useAppStore((state) => state.cancelParking);

  const [hubId, setHubId] = useState(hubs[0]?.id ?? '');
  const [vehicleType, setVehicleType] = useState('Xe ô tô (4 chỗ)');
  const [startTime, setStartTime] = useState('13:30');
  const [endTime, setEndTime] = useState('17:00');
  const [page, setPage] = useState(1);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [bookingCode, setBookingCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Hộp thoại nhập mã lấy chỗ / trả chỗ. */
  const [checkOpen, setCheckOpen] = useState<null | 'in' | 'out'>(null);
  const [checkCode, setCheckCode] = useState('');
  const [checkError, setCheckError] = useState<string | null>(null);

  const hub = hubs.find((item) => item.id === hubId) ?? null;
  const hubSlots = slots.filter((slot) => slot.hubId === hubId);
  const totalPages = Math.max(1, Math.ceil(hubSlots.length / PAGE_SIZE));
  const pageSlots = hubSlots.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const freeOnPage = pageSlots.filter((slot) => slot.status === 'free').length;
  const freeInHub = hubSlots.filter((slot) => slot.status === 'free').length;
  const selectedSlot = hubSlots.find((slot) => slot.id === selectedSlotId) ?? null;
  const activeReservation =
    reservations.find((item) => item.status === 'reserved' && item.hubId === hubId) ?? null;
  const checkedInReservation =
    reservations.find((item) => item.status === 'checked_in' && item.hubId === hubId) ?? null;
  const holdingSlot = checkedInReservation ?? activeReservation;
  const zone = pageSlots[0]?.zone ?? `Khu A · Tầng ${page}`;

  const changeHub = (nextHubId: string) => {
    setHubId(nextHubId);
    setPage(1);
    setSelectedSlotId(null);
    setEditOpen(false);
  };

  const handleConfirm = () => {
    if (!selectedSlot) return;
    const result = bookParking({
      hubId,
      slotId: selectedSlot.id,
      vehicleType,
      startTime,
      endTime,
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

  /** Huỷ chỗ đang giữ để có thể đặt vị trí khác tại cùng Hub. */
  const handleCancelReservation = () => {
    if (!activeReservation) return;
    const result = cancelParking(activeReservation.id);
    if (!result.ok) {
      message.error(result.message);
      return;
    }
    setSelectedSlotId(null);
    message.success('Đã huỷ chỗ đỗ. Bạn có thể chọn vị trí khác.');
  };

  /** Nhập mã lấy chỗ / trả chỗ đỗ. */
  const handleCheckCode = () => {
    if (!checkOpen) return;
    const result =
      checkOpen === 'in'
        ? apiGateway.student.checkInParking(checkCode)
        : apiGateway.student.checkOutParking(checkCode);
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
      message.info(`Mã đặt chỗ: ${bookingCode}`);
    }
    setCodeOpen(false);
    setSelectedSlotId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Đặt chỗ đỗ"
        subtitle="Giữ trước một vị trí tại HUB để không mất thời gian tìm chỗ."
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
            <p className="muted-13">Thời gian</p>
            <p className="mt-1 text-[15px] font-semibold text-ink dark:text-slate-100">
              Hôm nay · {startTime} – {endTime}
            </p>
          </div>
          <div>
            <p className="muted-13">Loại phương tiện</p>
            <p className="mt-1 text-[15px] font-semibold text-ink dark:text-slate-100">
              {vehicleType}
            </p>
          </div>
        </div>
        <Button onClick={() => setEditOpen(true)}>Thay đổi</Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Sơ đồ bãi đỗ</h2>
            <p className="muted-13">
              Trang này {freeOnPage}/{pageSlots.length} chỗ · toàn Hub còn {freeInHub}/{hubSlots.length} chỗ trống
            </p>
          </div>

          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[15px] font-semibold text-ink dark:text-slate-100">{zone}</p>
              <span className="pill-green">{freeOnPage} chỗ trống</span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {pageSlots.map((slot) => {
                const isSelected = slot.id === selectedSlotId;
                const clickable = slot.status === 'free' || isSelected;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={!clickable}
                    onClick={() => setSelectedSlotId(slot.id)}
                    className={`rounded-lg border px-3 py-2.5 text-left transition ${
                      isSelected
                        ? 'border-[#102A43] bg-[#EAF7EF] ring-2 ring-[#102A43]/15'
                        : statusStyle[slot.status]
                    } ${clickable ? 'hover:shadow-sm' : 'cursor-not-allowed opacity-90'}`}
                  >
                    <p className="text-[14px] font-semibold">{slot.label}</p>
                    <p className="mt-1 text-[12px]">{statusLabel[slot.status]}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className="px-2 text-muted disabled:opacity-40"
              >
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    setPage(index + 1);
                    setSelectedSlotId(null);
                  }}
                  className={`h-8 w-8 rounded border text-[13px] ${
                    page === index + 1
                      ? 'border-[#176B5B] text-[#176B5B]'
                      : 'border-line text-muted dark:border-slate-800'
                  }`}
                >
                  {index + 1}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages}
                className="px-2 text-muted disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        </section>

        <aside className="card flex flex-col">
          <h2 className="text-[19px] font-bold text-ink dark:text-slate-100">
            {checkedInReservation
              ? 'Chỗ đỗ đang sử dụng'
              : activeReservation
                ? 'Vị trí đỗ đã đặt'
                : 'Vị trí đã chọn'}
          </h2>

          {holdingSlot ? (
            <>
              <div className="mt-4 rounded-xl bg-[#EAF7EF] p-5 dark:bg-emerald-500/10">
                <p className="text-[24px] font-bold text-[#176B5B] dark:text-emerald-300">
                  {holdingSlot.slotLabel}
                </p>
                <p className="muted-13 mt-1">
                  {hubSlots.find((slot) => slot.id === holdingSlot.slotId)?.covered
                    ? 'Chỗ đỗ có mái che'
                    : 'Chỗ đỗ thường'}
                  {' · '}
                  {holdingSlot.status === 'checked_in' ? 'Đang sử dụng' : 'Đã giữ chỗ, chưa lấy'}
                </p>
              </div>
              <p className="muted-13 mt-4">Mã xác nhận</p>
              <p className="text-[16px] font-semibold tracking-wide text-ink dark:text-slate-100">
                {holdingSlot.code}
              </p>
              <p className="muted-13 mt-1">
                Hôm nay · {holdingSlot.startAt} – {holdingSlot.endAt}
              </p>
              <p className="mt-4 text-[13px] text-muted dark:text-slate-400">Phí dịch vụ</p>
              <p className="text-[20px] font-bold text-ink dark:text-slate-100">
                {holdingSlot.price.toLocaleString('vi-VN')} đ
              </p>

              {/* Lấy chỗ / trả chỗ bằng mã */}
              <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                <p className="muted-13">
                  {holdingSlot.status === 'checked_in'
                    ? 'Xe đang đỗ. Nhập mã để trả chỗ khi rời bãi.'
                    : 'Đến bãi thì nhập mã để lấy chỗ.'}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => {
                      setCheckCode('');
                      setCheckError(null);
                      setCheckOpen(holdingSlot.status === 'checked_in' ? 'out' : 'in');
                    }}
                  >
                    {holdingSlot.status === 'checked_in' ? 'Nhập mã trả chỗ' : 'Nhập mã lấy chỗ'}
                  </Button>
                  {holdingSlot.status === 'reserved' && (
                    <Button size="small" danger onClick={handleCancelReservation}>
                      Huỷ chỗ
                    </Button>
                  )}
                </div>
              </div>
            </>
          ) : selectedSlot ? (
            <>
              <div className="mt-4 rounded-xl bg-[#EAF7EF] p-5 dark:bg-emerald-500/10">
                <p className="text-[24px] font-bold text-[#176B5B] dark:text-emerald-300">
                  {selectedSlot.label}
                </p>
                <p className="muted-13 mt-1">
                  {selectedSlot.covered ? 'Chỗ đỗ có mái che' : 'Chỗ đỗ thường'}
                </p>
              </div>
              <p className="mt-5 text-[13px] text-muted dark:text-slate-400">Phí dịch vụ</p>
              <p className="text-[20px] font-bold text-ink dark:text-slate-100">5.000 đ</p>
            </>
          ) : (
            <p className="muted-13 mt-4">Chọn một vị trí còn trống trên sơ đồ bãi đỗ.</p>
          )}

          <div className="mt-auto pt-6">
            <Button
              type="primary"
              size="large"
              block
              disabled={!selectedSlot || Boolean(holdingSlot)}
              onClick={() => {
                setError(null);
                setConfirmOpen(true);
              }}
            >
              Xác nhận đặt chỗ
            </Button>
            {holdingSlot ? (
              <p className="mt-2 text-center text-[12px] text-muted dark:text-slate-400">
                {checkedInReservation
                  ? 'Bạn đang dùng một chỗ tại Hub này — trả chỗ trước khi đặt vị trí khác.'
                  : 'Bạn đang giữ một chỗ tại Hub này — lấy chỗ hoặc huỷ nếu muốn đặt vị trí khác.'}
              </p>
            ) : !selectedSlot ? (
              <p className="mt-2 text-center text-[12px] text-muted dark:text-slate-400">
                Chọn một vị trí còn trống trên sơ đồ bãi đỗ để đặt chỗ.
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      {/* Đổi Hub / thời gian / loại xe */}
      <Modal open={editOpen} onCancel={() => setEditOpen(false)} footer={null} centered width={520}>
        <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">
          Thay đổi thông tin đặt chỗ
        </h3>
        <div className="mt-4 space-y-3">
          <div>
            <p className="muted-13 mb-1">HUB</p>
            <Select
              value={hubId}
              onChange={changeHub}
              className="w-full"
              options={hubs.map((item) => ({ value: item.id, label: item.name }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="muted-13 mb-1">Từ</p>
              <Select value={startTime} onChange={setStartTime} options={timeOptions} className="w-full" />
            </div>
            <div>
              <p className="muted-13 mb-1">Đến</p>
              <Select value={endTime} onChange={setEndTime} options={timeOptions} className="w-full" />
            </div>
          </div>
          <div>
            <p className="muted-13 mb-1">Loại phương tiện</p>
            <Select
              value={vehicleType}
              onChange={setVehicleType}
              options={vehicleTypes}
              className="w-full"
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

      {/* Xác nhận đặt chỗ */}
      <Modal
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        footer={null}
        centered
        width={560}
      >
        <h3 className="text-[20px] font-bold text-ink dark:text-slate-100">
          Xác nhận đặt chỗ đỗ xe
        </h3>

        <div className="mt-4 rounded-2xl bg-[#102A43] p-6 text-white">
          <p className="text-[17px] font-bold">Chi tiết chỗ đỗ xe</p>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">HUB</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{hub?.name}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Phương tiện</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{vehicleType}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Vị trí đỗ xe</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{selectedSlot?.label}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Tình trạng</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">
                {selectedSlot?.covered ? 'Chỗ đỗ có mái che' : 'Chỗ đỗ thường'}
              </dd>
            </div>
          </dl>
        </div>

        {error && <p className="mt-3 text-[13px] text-red-500">{error}</p>}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setConfirmOpen(false)}>Thoát</Button>
          <Button type="primary" onClick={handleConfirm}>
            Đặt chỗ đỗ xe
          </Button>
        </div>
      </Modal>

      {/* Mã xác nhận */}
      <Modal open={codeOpen} onCancel={() => setCodeOpen(false)} footer={null} centered width={560}>
        <h3 className="text-[20px] font-bold text-ink dark:text-slate-100">
          Mã xác nhận đặt chỗ đỗ xe
        </h3>

        <div className="mt-4 rounded-2xl bg-[#102A43] p-6 text-white">
          <p className="text-[17px] font-bold">Chi tiết chỗ đỗ xe</p>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">HUB nhận</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{hub?.name}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Phương tiện</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{vehicleType}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Mã đỗ/lấy xe</dt>
              <dd className="mt-0.5 text-[14px] font-semibold tracking-wide">{bookingCode}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button
            onClick={() => {
              setCodeOpen(false);
              setSelectedSlotId(null);
            }}
          >
            Thoát
          </Button>
          <Button type="primary" onClick={copyCode}>
            Lưu mã
          </Button>
        </div>
      </Modal>

      {/* Nhập mã lấy chỗ / trả chỗ */}
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
          {checkOpen === 'in' ? 'Lấy chỗ đỗ xe' : 'Trả chỗ đỗ xe'}
        </h3>
        <p className="muted-13 mt-1">
          {checkOpen === 'in'
            ? `Nhập mã đặt chỗ (ví dụ ${holdingSlot?.code ?? 'DO000000'}) để xác nhận bạn đã tới bãi.`
            : 'Nhập mã đặt chỗ để trả vị trí và giải phóng chỗ cho người khác.'}
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
          placeholder="Nhập mã đặt chỗ"
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
