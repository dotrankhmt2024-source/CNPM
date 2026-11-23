import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App as AntApp, Button, Input, Modal } from 'antd';
import { PageHeader } from '@/client/shared/components/PageHeader';
import { useAppStore } from '@/client/api/useAppStore';
import { useMyBookings } from '@/client/api/useMyData';
import type { Booking, Vehicle } from '@/shared/types/domain';

const blackPill =
  'rounded-full bg-[#0B1220] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1B2A3D]';

const formatDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} giờ ${rest} phút` : `${rest} phút`;
};

interface DetailProps {
  hubName: string;
  vehicle: Vehicle | null;
  statusText: string;
  pickupCode?: string;
}

/** Khối "Chi tiết xe" nền xanh đậm, dùng lại ở cột phải và trong các hộp thoại. */
function VehicleDetail({ hubName, vehicle, statusText, pickupCode }: DetailProps) {
  return (
    <div className="rounded-2xl bg-[#102A43] p-6 text-white">
      <p className="text-[17px] font-bold">Chi tiết xe</p>
      <dl className="mt-4 space-y-3">
        <div>
          <dt className="text-[12px] text-[#AFC1D4]">HUB nhận</dt>
          <dd className="mt-0.5 text-[14px] font-semibold">{hubName}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-[#AFC1D4]">Phương tiện</dt>
          <dd className="mt-0.5 text-[14px] font-semibold">
            {vehicle ? `${vehicle.code} • ${vehicle.model}` : 'Chưa chọn xe'}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] text-[#AFC1D4]">Mức pin</dt>
          <dd className="mt-0.5 text-[14px] font-semibold">
            {vehicle ? `${vehicle.battery}%` : '—'}
          </dd>
        </div>
        {pickupCode && (
          <div>
            <dt className="text-[12px] text-[#AFC1D4]">Mã nhận/trả xe</dt>
            <dd className="mt-0.5 text-[14px] font-semibold tracking-wide">{pickupCode}</dd>
          </div>
        )}
        <div>
          <dt className="text-[12px] text-[#AFC1D4]">Tình trạng</dt>
          <dd className="mt-0.5 text-[14px] font-semibold leading-snug">{statusText}</dd>
        </div>
      </dl>
    </div>
  );
}

export function VehicleBookingPage() {
  const { message } = AntApp.useApp();
  const [params] = useSearchParams();

  const hubs = useAppStore((state) => state.hubs);
  const vehicles = useAppStore((state) => state.vehicles);
  const bookings = useMyBookings();
  const reserveVehicle = useAppStore((state) => state.reserveVehicle);
  const pickupVehicle = useAppStore((state) => state.pickupVehicle);
  const returnVehicle = useAppStore((state) => state.returnVehicle);

  const activeBooking =
    bookings.find((booking) => 
      (booking.status === 'reserved' || booking.status === 'picked_up') &&
      (booking.status === 'picked_up' || new Date(booking.expiresAt).getTime() > Date.now()),
  ) ?? null;

  const defaultHubId = params.get('hub') ?? hubs[0]?.id ?? '';
  const [hubId, setHubId] = useState(defaultHubId);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [returnHubId, setReturnHubId] = useState(
    () => hubs.find((hub) => hub.id !== defaultHubId)?.id ?? defaultHubId,
  );
  const [showAllVehicles, setShowAllVehicles] = useState(false);

  const [picker, setPicker] = useState<'pickup' | 'return' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [newBooking, setNewBooking] = useState<Booking | null>(null);

  const [pickupOpen, setPickupOpen] = useState(false);
  const [pickupCode, setPickupCode] = useState('');
  const [pickupError, setPickupError] = useState<string | null>(null);
  const [pickupSuccess, setPickupSuccess] = useState(false);
  const [pickupCountdown, setPickupCountdown] = useState(5);

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnCode, setReturnCode] = useState('');
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnSuccess, setReturnSuccess] = useState<{ minutes: number } | null>(null);

  useEffect(() => {
    if (!pickupSuccess) return;
    setPickupCountdown(5);
    const timer = window.setInterval(() => {
      setPickupCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setPickupSuccess(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pickupSuccess]);

  const hub = hubs.find((item) => item.id === hubId) ?? null;
  const returnHub = hubs.find((item) => item.id === returnHubId) ?? null;
  const hubVehicles = vehicles.filter(
    (vehicle) => vehicle.hubId === hubId && vehicle.status === 'available',
  );
  const selectedVehicle = hubVehicles.find((vehicle) => vehicle.id === vehicleId) ?? null;
  const visibleVehicles = showAllVehicles ? hubVehicles : hubVehicles.slice(0, 3);

  const changeHub = (nextHubId: string) => {
    setHubId(nextHubId);
    setVehicleId(null);
    if (returnHubId === nextHubId) {
      //setReturnHubId(hubs.find((item) => item.id !== nextHubId)?.id ?? nextHubId);
    }
    setPicker(null);
  };

  const handleConfirmBooking = async () => {
    if (!selectedVehicle) {
      setConfirmError('Vui lòng chọn xe trước khi đặt.');
      return;
    }
    const result = await reserveVehicle(selectedVehicle.id, returnHubId);
    if (!result.ok || !result.booking) {
      setConfirmError(result.message);
      return;
    }
    setConfirmError(null);
    setConfirmOpen(false);
    setNewBooking(result.booking);
    setCodeOpen(true);
    setVehicleId(null);
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      message.success('Đã lưu mã vào bộ nhớ tạm.');
    } catch {
      message.info(`Mã nhận/trả xe: ${code}`);
    }
    setCodeOpen(false);
  };

  const handlePickup = async () => {
    if (!activeBooking) return;
    const result = await pickupVehicle(activeBooking.id, pickupCode);
    if (!result.ok) {
      setPickupError(result.message);
      return;
    }
    setPickupError(null);
    setPickupOpen(false);
    setPickupCode('');
    setPickupSuccess(true);
  };

  const handleReturn = async () => {
    if (!activeBooking) return;
    const result = await returnVehicle(activeBooking.id, returnCode);
    if (!result.ok) {
      setReturnError(result.message);
      return;
    }
    setReturnError(null);
    setReturnOpen(false);
    setReturnCode('');
    setReturnSuccess({ minutes: result.durationMinutes ?? 1 });
  };

  const detailStatus = activeBooking
    ? activeBooking.status === 'reserved'
      ? `Xe đã được đặt (mã hết hạn trong ${Math.max(
          0,
          Math.ceil((new Date(activeBooking.expiresAt).getTime() - Date.now()) / 60_000),
        )} phút)`
      : 'Xe đang được sử dụng'
    : `Xe sẵn sàng đi tại ${hub?.location ?? 'HUB'}.`;

  const detailVehicle = activeBooking
    ? (vehicles.find((vehicle) => vehicle.id === activeBooking.vehicleId) ?? null)
    : selectedVehicle;

  const detailHubName = activeBooking
    ? (hubs.find((item) => item.id === activeBooking.hubId)?.name ?? '—')
    : (hub?.name ?? '—');

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="Đặt xe điện"
          subtitle={
            //activeBooking
              'Chọn HUB nhận xe, phương tiện.'
              //'Chọn HUB nhận xe, phương tiện và thời gian sử dụng.'
          }
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            {activeBooking ? (
              <>
                <div className="card">
                  <h2 className="text-[19px] font-bold text-ink dark:text-slate-100">
                    Thông tin đặt xe
                  </h2>

                  <p className="muted-13 mt-5">1. Chọn HUB nhận xe</p>
                  <div className="mt-2 flex items-center justify-between rounded-lg border border-line bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                    <span className="text-[14px] font-semibold text-ink dark:text-slate-100">
                      {hubs.find((item) => item.id === activeBooking.hubId)?.name}
                    </span>
                    <span className="text-[13px] text-[#18794E]">
                      {
                        vehicles.filter(
                          (vehicle) =>
                            vehicle.hubId === activeBooking.hubId &&
                            vehicle.status === 'available',
                        ).length
                      }{' '}
                      xe
                    </span>
                  </div>

                  <p className="muted-13 mt-5">Xe đã đặt</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#102A43] bg-[#EAF7EF] px-4 py-3 dark:bg-emerald-500/10">
                    <span className="text-[14px] font-semibold text-ink dark:text-slate-100">
                      {detailVehicle?.code}
                    </span>
                    <span className="muted-13">{detailVehicle?.model}</span>
                    <span className="text-[13px] font-medium text-ink dark:text-slate-100">
                      Pin {detailVehicle?.battery}%
                    </span>
                    {activeBooking.status === 'reserved' ? (
                      <button
                        type="button"
                        className={blackPill}
                        onClick={() => {
                          setPickupCode('');
                          setPickupError(null);
                          setPickupOpen(true);
                        }}
                      >
                        Nhập mã nhận xe
                      </button>
                    ) : (
                      <span className="rounded-full bg-[#0B1220] px-4 py-1.5 text-xs font-semibold text-white">
                        Xe đang di chuyển
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-center text-[13px] text-muted dark:text-slate-400">
                    {activeBooking.pickupCode}
                  </p>
                </div>

                <div className="card">
                  <h2 className="text-[19px] font-bold text-ink dark:text-slate-100">
                    Thông tin trả xe
                  </h2>

                  <p className="muted-13 mt-5">HUB trả xe</p>
                  <div className="mt-2 flex items-center justify-between rounded-lg border border-line bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                    <span className="text-[14px] font-semibold text-ink dark:text-slate-100">
                      {hubs.find((item) => item.id === activeBooking.returnHubId)?.name}
                    </span>
                    <span className="text-[13px] text-[#18794E]">
                      {
                        vehicles.filter(
                          (vehicle) =>
                            vehicle.hubId === activeBooking.returnHubId &&
                            vehicle.status === 'available',
                        ).length
                      }{' '}
                      xe
                    </span>
                  </div>

                  <p className="muted-13 mt-5">Xe đã nhận</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#102A43] bg-[#EAF7EF] px-4 py-3 dark:bg-emerald-500/10">
                    <span className="text-[14px] font-semibold text-ink dark:text-slate-100">
                      {detailVehicle?.code}
                    </span>
                    <span className="muted-13">{detailVehicle?.model}</span>
                    <span className="text-[13px] font-medium text-ink dark:text-slate-100">
                      Pin {detailVehicle?.battery}%
                    </span>
                    {activeBooking.status === 'reserved' ? (
                      <span className="rounded-full bg-[#0B1220] px-4 py-1.5 text-xs font-semibold text-white">
                        Xe chưa được nhận
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={blackPill}
                        onClick={() => {
                          setReturnCode('');
                          setReturnError(null);
                          setReturnOpen(true);
                        }}
                      >
                        Nhập mã trả xe
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="card">
                  <h2 className="text-[19px] font-bold text-ink dark:text-slate-100">
                    Thông tin đặt xe
                  </h2>

                  <p className="muted-13 mt-5">1. Chọn HUB nhận xe</p>
                  <button
                    type="button"
                    onClick={() => setPicker('pickup')}
                    className="mt-2 flex w-full items-center justify-between rounded-lg border border-line bg-white px-4 py-3 text-left transition hover:border-accent/50 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <span className="text-[14px] font-semibold text-ink dark:text-slate-100">
                      {hub?.name ?? 'Chọn HUB nhận xe'}
                    </span>
                    <span className="text-[13px] text-[#18794E]">{hubVehicles.length} xe</span>
                  </button>

                  <p className="muted-13 mt-5">2. Chọn xe</p>
                  <div className="mt-2 space-y-2">
                    {visibleVehicles.map((vehicle) => {
                      const isSelected = vehicle.id === vehicleId;
                      return (
                        <button
                          key={vehicle.id}
                          type="button"
                          onClick={() => setVehicleId(vehicle.id)}
                          className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition ${
                            isSelected
                              ? 'border-[#102A43] bg-[#EAF7EF] dark:bg-emerald-500/10'
                              : 'border-line bg-white hover:border-accent/40 dark:border-slate-800 dark:bg-slate-900'
                          }`}
                        >
                          <span className="text-[14px] font-semibold text-ink dark:text-slate-100">
                            {vehicle.code}
                          </span>
                          <span className="muted-13">{vehicle.model}</span>
                          <span className="text-[13px] font-medium text-ink dark:text-slate-100">
                            Pin {vehicle.battery}%
                          </span>
                          <span
                            className={
                              isSelected
                                ? 'rounded-full bg-[#0B1220] px-3 py-1 text-xs font-semibold text-white'
                                : 'pill-green'
                            }
                          >
                            Sẵn sàng
                          </span>
                        </button>
                      );
                    })}

                    {hubVehicles.length === 0 && (
                      <p className="muted-13">Hub này hiện không còn xe khả dụng.</p>
                    )}
                  </div>

                  {hubVehicles.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setShowAllVehicles((value) => !value)}
                      className="mt-3 text-[13px] font-medium text-muted hover:text-ink dark:text-slate-400"
                    >
                      {showAllVehicles ? 'Thu gọn xe' : 'Xem thêm xe'}
                    </button>
                  )}

                  <p className="muted-13 mt-5">3. Chọn HUB trả xe</p>
                  <button
                    type="button"
                    onClick={() => setPicker('return')}
                    className="mt-2 flex w-full items-center justify-between rounded-lg border border-line bg-white px-4 py-3 text-left transition hover:border-accent/50 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <span className="text-[14px] font-semibold text-ink dark:text-slate-100">
                      {returnHub?.name ?? 'Chọn HUB trả xe'}
                    </span>
                    <span className="text-[13px] text-[#18794E]">
                      {
                        vehicles.filter(
                          (vehicle) =>
                            vehicle.hubId === returnHubId && vehicle.status === 'available',
                        ).length
                      }{' '}
                      xe
                    </span>
                  </button>

                  <Button
                    type="primary"
                    size="large"
                    block
                    className="mt-6"
                    onClick={() => {
                      setConfirmError(null);
                      setConfirmOpen(true);
                    }}
                  >
                    Xác nhận đặt xe
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="xl:pt-1">
            <VehicleDetail
              hubName={detailHubName}
              vehicle={detailVehicle}
              statusText={detailStatus}
              pickupCode={activeBooking?.pickupCode}
            />
          </div>
        </div>
      </div>

      {/* Hộp thoại chọn Hub */}
      <Modal
        open={picker !== null}
        onCancel={() => setPicker(null)}
        footer={null}
        centered
        width={560}
        title={picker === 'pickup' ? 'Chọn HUB nhận xe' : 'Chọn HUB trả xe'}
      >
        <div className="space-y-2">
          {hubs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (picker === 'pickup') changeHub(item.id);
                else {
                  setReturnHubId(item.id);
                  setPicker(null);
                }
              }}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 text-left transition hover:border-accent/50 dark:border-slate-800"
            >
              <span className="text-[14px] font-semibold text-ink dark:text-slate-100">
                {item.name}
              </span>
              <span className="text-[13px] text-[#18794E]">
                {
                  vehicles.filter(
                    (vehicle) => vehicle.hubId === item.id && vehicle.status === 'available',
                  ).length
                }{' '}
                xe
              </span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Hộp thoại xác nhận đặt xe */}
      <Modal open={confirmOpen} onCancel={() => setConfirmOpen(false)} footer={null} centered width={560}>
        <h3 className="text-[20px] font-bold text-ink dark:text-slate-100">Xác nhận đặt xe</h3>
        <div className="mt-4">
          <VehicleDetail
            hubName={hub?.name ?? '—'}
            vehicle={selectedVehicle}
            statusText={detailStatus}
          />
        </div>
        {confirmError && <p className="mt-3 text-[13px] text-red-500">{confirmError}</p>}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setConfirmOpen(false)}>Thoát</Button>
          <Button type="primary" onClick={handleConfirmBooking}>
            Đặt xe
          </Button>
        </div>
      </Modal>

      {/* Hộp thoại mã nhận/trả xe */}
      <Modal open={codeOpen} onCancel={() => setCodeOpen(false)} footer={null} centered width={560}>
        <h3 className="text-[20px] font-bold text-ink dark:text-slate-100">Mã nhận/trả xe</h3>
        <div className="mt-4">
          <VehicleDetail
            hubName={hub?.name ?? '—'}
            vehicle={
              (newBooking && vehicles.find((vehicle) => vehicle.id === newBooking.vehicleId)) ??
              selectedVehicle
            }
            statusText="Xe sẵn sàng đi. Mã có hiệu lực trong 5 phút."
            pickupCode={newBooking?.pickupCode}
          />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setCodeOpen(false)}>Thoát</Button>
          <Button type="primary" onClick={() => newBooking && handleCopyCode(newBooking.pickupCode)}>
            Lưu mã
          </Button>
        </div>
      </Modal>

      {/* Hộp thoại nhập mã nhận xe */}
      <Modal open={pickupOpen} onCancel={() => setPickupOpen(false)} footer={null} centered width={520}>
        <h3 className="text-center text-[20px] font-bold text-ink dark:text-slate-100">
          Vui lòng nhập mã nhận xe
        </h3>
        <Input
          size="large"
          className="mt-5"
          value={pickupCode}
          onChange={(event) => {
            setPickupCode(event.target.value);
            setPickupError(null);
          }}
          placeholder="Nhập mã nhận xe"
        />
        {pickupError && <p className="mt-2 text-[13px] text-red-500">{pickupError}</p>}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setPickupOpen(false)}>Thoát</Button>
          <Button type="primary" onClick={handlePickup}>
            Gửi
          </Button>
        </div>
      </Modal>

      {/* Nhận xe thành công, tự đóng */}
      <Modal open={pickupSuccess} footer={null} closable={false} centered width={520}>
        <div className="py-6 text-center">
          <p className="text-[20px] font-bold text-ink dark:text-slate-100">Nhận xe thành công.</p>
          <p className="mt-6 text-[17px] font-semibold text-ink dark:text-slate-100">
            Chúc bạn di chuyển vui vẻ
          </p>
          <p className="mt-6 text-[15px] text-muted dark:text-slate-400">
            Hộp thoại tự đóng trong ({pickupCountdown}s)
          </p>
        </div>
      </Modal>

      {/* Hộp thoại nhập mã trả xe */}
      <Modal open={returnOpen} onCancel={() => setReturnOpen(false)} footer={null} centered width={520}>
        <h3 className="text-center text-[20px] font-bold text-ink dark:text-slate-100">
          Vui lòng nhập mã trả xe
        </h3>
        <Input
          size="large"
          className="mt-5"
          value={returnCode}
          onChange={(event) => {
            setReturnCode(event.target.value);
            setReturnError(null);
          }}
          placeholder="Nhập mã trả xe"
        />
        {returnError && <p className="mt-2 text-[13px] text-red-500">{returnError}</p>}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setReturnOpen(false)}>Thoát</Button>
          <Button type="primary" onClick={handleReturn}>
            Gửi mã trả xe
          </Button>
        </div>
      </Modal>

      {/* Trả xe thành công */}
      <Modal
        open={returnSuccess !== null}
        onCancel={() => setReturnSuccess(null)}
        footer={null}
        centered
        width={520}
      >
        <h3 className="text-[20px] font-bold text-ink dark:text-slate-100">Trả xe thành công.</h3>
        <p className="mt-4 text-[17px] font-semibold text-ink dark:text-slate-100">
          Thời gian di chuyển của bạn là:
        </p>
        <p className="mt-3 inline-block rounded-lg border border-line px-4 py-2 text-[16px] font-semibold text-ink dark:border-slate-800 dark:text-slate-100">
          {returnSuccess ? formatDuration(returnSuccess.minutes) : ''}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setReturnSuccess(null)}>Thoát</Button>
          <Button type="primary" onClick={() => setReturnSuccess(null)}>
            Thanh toán ngay
          </Button>
        </div>
      </Modal>
    </>
  );
}
