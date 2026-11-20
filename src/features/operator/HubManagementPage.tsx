import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { App as AntApp, Button, Modal, Select } from 'antd';
import { PageHeader } from '../../components/PageHeader';
import { useAppStore } from '../../stores/useAppStore';
import { freeChargers, freeParking, hubStatusClass, hubStatusLabel } from './hubStatus';

export function HubManagementPage() {
  const { message } = AntApp.useApp();
  const [params, setParams] = useSearchParams();
  const hubs = useAppStore((state) => state.hubs);
  const vehicles = useAppStore((state) => state.vehicles);
  const chargingRequests = useAppStore((state) => state.chargingRequests);
  const updateHubStatus = useAppStore((state) => state.updateHubStatus);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Xe tại HUB</h2>
          <p className="muted-13">{availableHere} xe khả dụng</p>
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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Bãi đỗ</h2>
          <p className="muted-13">{freeParking(hub)} / {hub.capacity} chỗ trống</p>
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
    </div>
  );
}
