import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { App as AntApp, Button, Modal, Select } from 'antd';
import { PageHeader } from '@/client/shared/components/PageHeader';
import { useAppStore } from '@/client/api/useAppStore';
import { freeChargers, freeParking, hubStatusClass, hubStatusLabel } from '@/client/operator/hubStatus';
import { formatHm } from '@/shared/clock';
import {
  parkingSlotClass,
  parkingSlotLabel,
  vehicleStatusClass,
  vehicleStatusLabel,
} from '@/client/operator/resourceStatus';

export function HubManagementPage() {
  const { message } = AntApp.useApp();
  const [params, setParams] = useSearchParams();
  const hubs = useAppStore((state) => state.hubs);
  const vehicles = useAppStore((state) => state.vehicles);
  const parkingSlots = useAppStore((state) => state.parkingSlots);
  const parkingReservations = useAppStore((state) => state.parkingReservations);
  const chargingRequests = useAppStore((state) => state.chargingRequests);
  const updateHubStatus = useAppStore((state) => state.updateHubStatus);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [vehiclesOpen, setVehiclesOpen] = useState(false);
  const [parkingOpen, setParkingOpen] = useState(false);
  const [slotDetailId, setSlotDetailId] = useState<string | null>(null);
  const [updatedAt] = useState(() => new Date().toLocaleTimeString('vi-VN'));

  const hubId = params.get('hub') ?? hubs[0]?.id ?? '';
  const hub = hubs.find((item) => item.id === hubId) ?? hubs[0];
  if (!hub) return null;

  const hubVehicles = vehicles.filter((vehicle) => vehicle.hubId === hub.id);
  const availableHere = hubVehicles.filter((vehicle) => vehicle.status === 'available').length;
  const suggestion = hubs
    .filter((item) => item.id !== hub.id)
    .sort(
      (a, b) =>
        vehicles.filter((v) => v.hubId === b.id && v.status === 'available').length -
        vehicles.filter((v) => v.hubId === a.id && v.status === 'available').length,
    )[0];

  const chargingCount = chargingRequests.filter((item) => item.hubId === hub.id).length;

  const hubSlots = parkingSlots.filter((slot) => slot.hubId === hub.id);
  const slotCount = (status: 'free' | 'used' | 'reserved' | 'maintenance') =>
    hubSlots.filter((slot) => slot.status === status).length;
  const zones = [...new Set(hubSlots.map((slot) => slot.zone))];
  /** Lượt đặt đang giữ / đang dùng của một vị trí (nếu có). */
  const reservationOfSlot = (slotId: string) =>
    parkingReservations.find(
      (item) => item.slotId === slotId && (item.status === 'reserved' || item.status === 'checked_in'),
    ) ?? null;

  const cycleStatus = () => {
    const next = hub.status === 'normal' ? 'warning' : hub.status === 'warning' ? 'maintenance' : 'normal';
    updateHubStatus(hub.id, next);
    message.success(`Đã cập nhật trạng thái: ${hubStatusLabel[next]}`);
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Quản lý Hub" subtitle="Quản lý trạng thái và tài nguyên của một Hub." />

      <div className="card flex flex-wrap items-center justify-between gap-5">
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <p className="muted-13">Tên Hub</p>
            <p className="mt-1 text-[15px] font-semibold text-ink dark:text-slate-100">{hub.name}</p>
          </div>
          <div>
            <p className="muted-13">Trạng thái HUB</p>
            <p className="mt-2">
              <span className={hubStatusClass[hub.status]}>{hubStatusLabel[hub.status]}</span>
            </p>
          </div>
          <div>
            <p className="muted-13">Cập nhật cuối</p>
            <p className="mt-1 text-[15px] font-semibold text-ink dark:text-slate-100">
              {updatedAt} · vừa xong
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setPickerOpen(true)}>Chọn Hub khác</Button>
          <Button onClick={cycleStatus}>Cập nhật trạng thái</Button>
        </div>
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Xe tại HUB</h2>
          <div className="flex items-center gap-3">
            <p className="muted-13">{availableHere} xe khả dụng</p>
            <Button size="small" onClick={() => setVehiclesOpen(true)} disabled={hubVehicles.length === 0}>
              Xem chi tiết ({hubVehicles.length})
            </Button>
          </div>
        </div>

        {availableHere === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#FDECEC] px-4 py-3 dark:bg-red-500/10">
            <p className="text-[14px] font-medium text-[#C04343] dark:text-red-300">
              Hiện tại Hub không còn xe, gợi ý: điều phối xe từ {suggestion?.name ?? 'Hub khác'}
            </p>
            <Link to={`/operator/dieu-phoi?to=${hub.id}&from=${suggestion?.id ?? ''}`}>
              <span className="rounded-full bg-[#0B1220] px-4 py-1.5 text-xs font-semibold text-white">
                Điều phối ngay
              </span>
            </Link>
          </div>
        ) : (
          <div className="card">
            <p className="muted-13">
              {hubVehicles.length} xe đang thuộc Hub, trong đó {availableHere} xe sẵn sàng phục vụ.
            </p>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Bãi đỗ</h2>
          <div className="flex items-center gap-3">
            <p className="muted-13">
              {freeParking(hub)} / {hub.capacity} chỗ trống
            </p>
            <Button size="small" onClick={() => setParkingOpen(true)} disabled={hubSlots.length === 0}>
              Xem chi tiết ({hubSlots.length})
            </Button>
          </div>
        </div>

        {freeParking(hub) === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#FDECEC] px-4 py-3 dark:bg-red-500/10">
            <p className="text-[14px] font-medium text-[#C04343] dark:text-red-300">
              Hiện tại Hub không còn chỗ đỗ xe, gợi ý: điều hướng người dùng tới các Hub lân cận
            </p>
            <Link to={`/operator/dieu-huong?hub=${hub.id}`}>
              <span className="rounded-full bg-[#0B1220] px-4 py-1.5 text-xs font-semibold text-white">
                Điều hướng ngay
              </span>
            </Link>
          </div>
        ) : (
          <div className="card">
            <p className="muted-13">
              Bãi đỗ còn {freeParking(hub)} chỗ trống trên tổng {hub.capacity} chỗ.
            </p>
          </div>
        )}
      </section>

      <section>
        <h2 className="section-title mb-3">Lịch sạc</h2>
        <div className="card max-w-[520px] border-[#0B1220] dark:border-slate-600">
          <p className="text-[14px] font-medium text-[#C04343] dark:text-red-300">
            Hiện tại Hub có {chargingCount} xe đang trong lịch sạc
          </p>
          <div className="mt-4 flex gap-2">
            <Link to={`/operator/lich-sac?hub=${hub.id}`}>
              <span className="rounded-full bg-[#0B1220] px-4 py-1.5 text-xs font-semibold text-white">
                Xem chi tiết
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setParamsOpen(true)}
              className="rounded-full bg-[#0B1220] px-4 py-1.5 text-xs font-semibold text-white"
            >
              Thay đổi tham số
            </button>
          </div>
        </div>
      </section>

      <Modal open={pickerOpen} onCancel={() => setPickerOpen(false)} footer={null} centered width={560}>
        <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">Chọn Hub khác</h3>
        <div className="mt-4 space-y-2">
          {hubs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setParams({ hub: item.id });
                setPickerOpen(false);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 text-left transition hover:border-accent/50 dark:border-slate-800"
            >
              <span className="text-[14px] font-semibold text-ink dark:text-slate-100">{item.name}</span>
              <span className={`${hubStatusClass[item.status]} shrink-0`}>{hubStatusLabel[item.status]}</span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={paramsOpen} onCancel={() => setParamsOpen(false)} footer={null} centered width={480}>
        <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">Tham số sạc</h3>
        <div className="mt-4 space-y-3">
          <div>
            <p className="muted-13 mb-1">Số cổng sạc hoạt động</p>
            <Select
              defaultValue={freeChargers(hub) || 0}
              className="w-full"
              options={Array.from({ length: hub.chargers + 1 }, (_, index) => ({ value: index, label: `${index} cổng` }))}
            />
          </div>
          <div>
            <p className="muted-13 mb-1">Thời gian giữ chỗ tạm thời</p>
            <Select
              defaultValue={10}
              className="w-full"
              options={[5, 10, 15, 20].map((value) => ({ value, label: `${value} phút` }))}
            />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setParamsOpen(false)}>Thoát</Button>
          <Button
            type="primary"
            onClick={() => {
              setParamsOpen(false);
              message.success('Đã lưu tham số sạc mới.');
            }}
          >
            Lưu tham số
          </Button>
        </div>
      </Modal>

      {/* Chi tiết xe tại Hub */}
      <Modal open={vehiclesOpen} onCancel={() => setVehiclesOpen(false)} footer={null} centered width={760}>
        <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">Chi tiết xe tại Hub</h3>
        <p className="muted-13 mt-1">
          {hub.name} · {hubVehicles.length} xe, trong đó {availableHere} xe sẵn sàng phục vụ.
        </p>

        <div className="mt-4 max-h-[55vh] overflow-y-auto rounded-xl border border-line dark:border-slate-800">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-slate-50 text-[12px] uppercase tracking-wide text-muted dark:bg-slate-800/70 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Mã xe</th>
                <th className="px-4 py-2.5 font-semibold">Dòng xe</th>
                <th className="px-4 py-2.5 font-semibold">Loại</th>
                <th className="px-4 py-2.5 font-semibold">Pin</th>
                <th className="px-4 py-2.5 font-semibold">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {hubVehicles.map((vehicle) => (
                <tr key={vehicle.id} className="border-t border-line dark:border-slate-800">
                  <td className="px-4 py-2.5 font-semibold text-ink dark:text-slate-100">{vehicle.code}</td>
                  <td className="px-4 py-2.5 text-muted dark:text-slate-300">{vehicle.model}</td>
                  <td className="px-4 py-2.5 text-muted dark:text-slate-300">
                    {vehicle.type === 'bike' ? 'Xe đạp điện' : 'Xe máy điện'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        vehicle.battery < 20
                          ? 'font-semibold text-[#C04343]'
                          : vehicle.battery < 50
                            ? 'font-semibold text-[#9A6B1F]'
                            : 'font-semibold text-[#176B5B]'
                      }
                    >
                      {vehicle.battery}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={vehicleStatusClass[vehicle.status]}>{vehicleStatusLabel[vehicle.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6">
          <Button onClick={() => setVehiclesOpen(false)}>Đóng</Button>
        </div>
      </Modal>

      {/* Chi tiết bãi đỗ */}
      <Modal open={parkingOpen} onCancel={() => setParkingOpen(false)} footer={null} centered width={820}>
        <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">Chi tiết bãi đỗ</h3>
        <p className="muted-13 mt-1">
          {hub.name} · {hubSlots.length} vị trí, còn {slotCount('free')} chỗ trống.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
          <span className="pill-green">Trống {slotCount('free')}</span>
          <span className="pill-blue">Đã đặt {slotCount('reserved')}</span>
          <span className="pill-orange">Đang dùng {slotCount('used')}</span>
          <span className="rounded-full bg-red-50 px-3 py-1 font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-300">
            Bảo trì {slotCount('maintenance')}
          </span>
          <span className="muted-13 ml-auto">Bấm vào một ô để xem ai đặt / ai đang đỗ</span>
        </div>

        <div className="mt-4 max-h-[55vh] space-y-5 overflow-y-auto pr-1">
          {zones.map((zone) => (
            <div key={zone}>
              <p className="mb-2 text-[13px] font-semibold text-ink dark:text-slate-100">{zone}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                {hubSlots
                  .filter((slot) => slot.zone === zone)
                  .map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => setSlotDetailId(slot.id)}
                      className={`rounded-lg border px-2.5 py-2 text-center transition hover:shadow-sm ${parkingSlotClass[slot.status]}`}
                    >
                      <p className="text-[13px] font-semibold">{slot.label}</p>
                      <p className="mt-0.5 text-[11px]">{parkingSlotLabel[slot.status]}</p>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Link to={`/operator/dieu-huong?hub=${hub.id}`} className="link-green text-[13px]">
            Điều hướng người dùng khi hết chỗ →
          </Link>
          <Button onClick={() => setParkingOpen(false)}>Đóng</Button>
        </div>
      </Modal>

      {/* Chi tiết một vị trí đỗ: ai đặt / ai đang đỗ */}
      <Modal open={slotDetailId !== null} onCancel={() => setSlotDetailId(null)} footer={null} centered width={480}>
        {(() => {
          const slot = hubSlots.find((item) => item.id === slotDetailId);
          if (!slot) return null;
          const reservation = reservationOfSlot(slot.id);
          return (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">Vị trí {slot.label}</h3>
                  <p className="muted-13 mt-1">
                    {slot.zone} · {slot.covered ? 'Có mái che' : 'Không mái che'}
                  </p>
                </div>
                <span className={parkingSlotClass[slot.status]}>{parkingSlotLabel[slot.status]}</span>
              </div>

              {reservation ? (
                <div className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
                  <DetailRow label="Người đặt" value={reservation.studentName} />
                  <DetailRow label="Mã đặt chỗ" value={reservation.code} />
                  <DetailRow
                    label="Khung giờ"
                    value={`Hôm nay · ${formatHm(reservation.startAt)} – ${formatHm(reservation.endAt)}`}
                  />
                  <DetailRow label="Loại xe" value={reservation.vehicleType} />
                  <DetailRow label="Phí dịch vụ" value={`${reservation.price.toLocaleString('vi-VN')} đ`} />
                  <DetailRow
                    label="Tình trạng"
                    value={
                      reservation.status === 'checked_in'
                        ? 'Đang sử dụng (đã lấy chỗ)'
                        : 'Đã giữ chỗ, chưa lấy'
                    }
                  />
                </div>
              ) : (
                <p className="muted-13 mt-5">
                  {slot.status === 'used'
                    ? 'Có xe đang đỗ tại vị trí này nhưng không có lượt đặt trước (xe vừa được trả hoặc điều phối tới Hub).'
                    : slot.status === 'free'
                      ? 'Vị trí đang trống, chưa có ai đặt.'
                      : 'Vị trí đang bảo trì, tạm không nhận xe.'}
                </p>
              )}

              <div className="mt-6">
                <Button onClick={() => setSlotDetailId(null)}>Đóng</Button>
              </div>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}

/** Một dòng nhãn – giá trị trong hộp thoại chi tiết. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[13px] text-muted dark:text-slate-400">{label}</span>
      <span className="text-right text-[14px] font-semibold text-ink dark:text-slate-100">{value}</span>
    </div>
  );
}
