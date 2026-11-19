import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App as AntApp, Button, Input, Modal } from 'antd';
import { PageHeader } from '../../components/PageHeader';
import { useAppStore } from '../../stores/useAppStore';
import { hubStatusClass, hubStatusLabel } from './hubStatus';

const portStatusLabel = { free: 'Trống', used: 'Đang dùng', reserved: 'Đã đặt' } as const;
const portStatusStyle = {
  free: 'border-[#176B5B] bg-[#EAF7EF] text-[#176B5B]',
  used: 'border-[#E2BF8A] bg-[#FDF4E5] text-[#9A6B1F]',
  reserved: 'border-[#9DB8F5] bg-[#EEF4FF] text-[#2563EB]',
} as const;

const initialChargeParams = [
  { key: 'threshold', label: 'Ngưỡng pin cần sạc', value: '20%' },
  { key: 'full', label: 'Ngưỡng pin mức đầy mong đợi', value: '80%' },
  { key: 'usage', label: 'Tỉ lệ xe đang sử dụng', value: '60-80' },
  { key: 'duration', label: 'Thời gian diễn ra', value: '30 phút' },
  { key: 'maxSession', label: 'Thời lượng sạc tối đa', value: '4 giờ' },
  { key: 'hold', label: 'Thời gian giữ chỗ sạc', value: '10 phút' },
];

export function ChargingSchedulePage() {
  const { message } = AntApp.useApp();
  const [params, setParams] = useSearchParams();
  const hubs = useAppStore((state) => state.hubs);
  const ports = useAppStore((state) => state.chargingPorts);
  const vehicles = useAppStore((state) => state.vehicles);
  const chargingRequests = useAppStore((state) => state.chargingRequests);
  const updateChargingStatus = useAppStore((state) => state.updateChargingStatus);

  const hubId = params.get('hub') ?? hubs[0]?.id ?? '';
  const hub = hubs.find((item) => item.id === hubId) ?? hubs[0];
  const [selectedPort, setSelectedPort] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [updatedAt] = useState(() => new Date().toLocaleTimeString('vi-VN'));
  const [view, setView] = useState<'map' | 'params'>('map');
  const [chargeParams, setChargeParams] = useState(initialChargeParams);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState('');

  if (!hub) return null;

  const hubPorts = ports.filter((port) => port.hubId === hub.id);
  const requests = chargingRequests.filter((item) => item.hubId === hub.id);
  const activePort = hubPorts.find((port) => port.code === selectedPort) ?? hubPorts[0] ?? null;

  const cycleStatus = () => {
    const first = requests[0];
    if (!first) {
      message.info('Hub này chưa có lịch sạc nào.');
      return;
    }
    const next = first.status === 'queued' ? 'charging' : first.status === 'charging' ? 'completed' : 'queued';
    updateChargingStatus(first.id, next);
    message.success(`Đã cập nhật trạng thái phiên sạc: ${next}`);
  };

  if (view === 'params') {
    const editing = chargeParams.find((param) => param.key === editingKey) ?? null;

    return (
      <div className="space-y-6">
        <PageHeader
          title="Lập lịch sạc ưu tiên"
          subtitle="Quản lý trạng thái và tài nguyên của một HUB."
        />

        <button type="button" onClick={() => setView('map')} className="link-green w-fit">
          ← Quay lại sơ đồ cổng sạc
        </button>

        <div className="card divide-y divide-line dark:divide-slate-800">
          {chargeParams.map((param) => (
            <div key={param.key} className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
              <div className="min-w-[200px]">
                <p className="muted-13">{param.label}</p>
                <p className="mt-1 inline-flex rounded bg-[#FDF4E5] px-3 py-1 text-[13px] font-semibold text-[#9A6B1F]">
                  {param.value}
                </p>
              </div>

              <div>
                <p className="muted-13">Cập nhật cuối</p>
                <p className="text-[13px] text-ink dark:text-slate-200">{updatedAt} · vừa xong</p>
              </div>

              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  type="primary"
                  size="small"
                  onClick={() => {
                    setEditingKey(param.key);
                    setDraftValue(param.value);
                  }}
                >
                  Thay đổi tham số sạc
                </Button>
                <Button
                  size="small"
                  onClick={() => message.success(`Đã cập nhật trạng thái: ${param.label}`)}
                >
                  Cập nhật trạng thái
                </Button>
              </div>
            </div>
          ))}
        </div>

        <Modal open={editingKey !== null} onCancel={() => setEditingKey(null)} footer={null} centered width={460}>
          <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">Thay đổi tham số sạc</h3>
          <p className="muted-13 mt-1">{editing?.label}</p>
          <Input
            className="mt-4"
            size="large"
            value={draftValue}
            onChange={(event) => setDraftValue(event.target.value)}
          />
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button onClick={() => setEditingKey(null)}>Thoát</Button>
            <Button
              type="primary"
              onClick={() => {
                setChargeParams((current) =>
                  current.map((param) =>
                    param.key === editingKey ? { ...param, value: draftValue } : param,
                  ),
                );
                setEditingKey(null);
                message.success('Đã lưu tham số mới.');
              }}
            >
              Gửi
            </Button>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Lập lịch sạc ưu tiên" subtitle="Quản lý trạng thái và tài nguyên của một HUB." />

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
          <Button type="primary" onClick={() => setView('params')}>
            Thay đổi tham số sạc
          </Button>
          <Button onClick={cycleStatus}>Cập nhật trạng thái</Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <h2 className="section-title mb-3">Sơ đồ cổng sạc</h2>
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[15px] font-semibold text-ink dark:text-slate-100">Khu A · Tầng 1</p>
              <span className="pill-green">{hubPorts.filter((port) => port.status === 'free').length} chỗ trống</span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {hubPorts.map((port) => (
                <button
                  key={port.id}
                  type="button"
                  onClick={() => setSelectedPort(port.code)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition ${
                    port.code === activePort?.code
                      ? 'border-[#102A43] bg-[#EAF7EF] ring-2 ring-[#102A43]/15'
                      : portStatusStyle[port.status]
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[14px] font-semibold">{port.code}</p>
                    <p className="text-[11px]">{port.power}kW</p>
                  </div>
                  <p className="mt-1 text-[12px]">{portStatusLabel[port.status]}</p>
                </button>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-center gap-2">
              {[1, 2, 3].map((page) => (
                <span
                  key={page}
                  className={`flex h-8 w-8 items-center justify-center rounded border text-[13px] ${
                    page === 1
                      ? 'border-[#176B5B] text-[#176B5B]'
                      : 'border-line text-muted dark:border-slate-800'
                  }`}
                >
                  {page}
                </span>
              ))}
            </div>
          </div>
        </section>

        <aside className="card">
          <h2 className="text-[19px] font-bold text-ink dark:text-slate-100">Lịch sạc chi tiết</h2>

          <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#EAF7EF] px-4 py-3 dark:bg-emerald-500/10">
            <p className="text-[22px] font-bold text-[#176B5B] dark:text-emerald-300">
              {activePort?.code ?? '—'}
            </p>
            <p className="muted-13">{activePort?.power}kW</p>
          </div>

          <p className="muted-13 mt-4">Danh sách xe</p>
          <div className="mt-2 space-y-2">
            {requests.map((request) => {
              const vehicle = vehicles.find((item) => item.id === request.vehicleId);
              return (
                <div
                  key={request.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 dark:border-slate-800"
                >
                  <span className="text-[13px] font-semibold text-ink dark:text-slate-100">
                    {vehicle?.code}
                  </span>
                  <span className="text-[12px] text-muted dark:text-slate-400">{vehicle?.model}</span>
                  <span className="text-[12px] font-medium text-ink dark:text-slate-100">
                    Pin {vehicle?.battery}%
                  </span>
                  {request.scheduledAt && (
                    <span className="rounded-full bg-[#0B1220] px-2.5 py-1 text-[11px] font-semibold text-white">
                      {request.scheduledAt}
                    </span>
                  )}
                </div>
              );
            })}
            {requests.length === 0 && <p className="muted-13">Chưa có xe nào trong lịch sạc của Hub.</p>}
          </div>
        </aside>
      </div>

      <Modal open={pickerOpen} onCancel={() => setPickerOpen(false)} footer={null} centered width={560}>
        <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">Chọn Hub khác</h3>
        <div className="mt-4 space-y-2">
          {hubs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setParams({ hub: item.id });
                setSelectedPort(null);
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
    </div>
  );
}
