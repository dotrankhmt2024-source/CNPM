import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { App as AntApp, Button, Checkbox, Input, Modal, Radio } from 'antd';
import { PageHeader } from '../../components/PageHeader';
import { useAppStore } from '../../stores/useAppStore';
import { freeChargers, freeParking, hubStatusClass, hubStatusLabel } from './hubStatus';

type Scope = 'all' | 'specific';

interface Param {
  key: string;
  label: string;
  value: string;
  scope: Scope;
  hubIds: string[];
}

const initialParams: Param[] = [
  { key: 'demand', label: 'Tỉ lệ gia tăng nhu cầu', value: '20%', scope: 'all', hubIds: [] },
  { key: 'hub', label: 'Hub khởi phát tác nghẽn', value: 'Hub C2', scope: 'all', hubIds: [] },
  { key: 'arrivals', label: 'Lượng sinh viên đến Hub/phút', value: '40', scope: 'all', hubIds: [] },
  { key: 'battery', label: 'Mức pin trung bình của xe', value: '65%', scope: 'all', hubIds: [] },
  { key: 'duration', label: 'Thời gian mô phỏng', value: '30 phút', scope: 'all', hubIds: [] },
  { key: 'threshold', label: 'Ngưỡng pin ưu tiên sạc', value: '20%', scope: 'all', hubIds: [] },
  { key: 'ports', label: 'Số cổng sạc ngừng hoạt động', value: '20', scope: 'all', hubIds: [] },
  { key: 'hold', label: 'Thời gian giữ chỗ tạm thời', value: '10 phút', scope: 'all', hubIds: [] },
  { key: 'capacity', label: 'Sức chứa của Hub bị thu hẹp', value: '10%', scope: 'all', hubIds: [] },
  { key: 'weight', label: 'Trọng số ưu tiên sạc', value: '40%', scope: 'all', hubIds: [] },
];

interface SimResult {
  hubId: string;
  name: string;
  current: number;
  projected: number;
  capacity: number;
  warning: boolean;
}

export function SimulationPage() {
  const { message } = AntApp.useApp();
  const hubs = useAppStore((state) => state.hubs);
  const vehicles = useAppStore((state) => state.vehicles);

  const [view, setView] = useState<'params' | 'results'>('params');
  const [params, setParams] = useState<Param[]>(initialParams);
  const [editedKey, setEditedKey] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [draftScope, setDraftScope] = useState<Scope>('all');
  const [draftHubs, setDraftHubs] = useState<string[]>([]);
  const [results, setResults] = useState<SimResult[] | null>(null);
  const [detail, setDetail] = useState<SimResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [updatedAt] = useState(() => new Date().toLocaleTimeString('vi-VN'));

  const edited = params.find((param) => param.key === editedKey) ?? null;

  useEffect(() => {
    if (!saved) return;
    setCountdown(5);
    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setSaved(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [saved]);

  const openEdit = (param: Param) => {
    setEditedKey(param.key);
    setDraftValue(param.value);
    setDraftScope(param.scope);
    setDraftHubs(param.hubIds);
  };

  const saveEdit = () => {
    setParams((current) =>
      current.map((param) =>
        param.key === editedKey
          ? {
              ...param,
              value: draftValue,
              scope: draftScope,
              hubIds: draftScope === 'specific' ? draftHubs : [],
            }
          : param,
      ),
    );
    setEditedKey(null);
    message.success('Đã lưu tham số mới.');
  };

  const runSimulation = () => {
    const next = hubs.map((hub) => {
      const projected = Math.min(
        hub.capacity,
        Math.round(hub.occupiedParking * 1.2 + 40 / 3),
      );
      return {
        hubId: hub.id,
        name: hub.name,
        current: hub.occupiedParking,
        projected,
        capacity: hub.capacity,
        warning: projected >= hub.capacity * 0.85,
      };
    });
    setResults(next);
    setView('results');
  };

  const availableVehicles = vehicles.filter((vehicle) => vehicle.status === 'available').length;
  const inUse = vehicles.filter((vehicle) => vehicle.status === 'in_use').length;
  const totalParking = hubs.reduce((sum, hub) => sum + hub.capacity, 0);
  const usedParking = hubs.reduce((sum, hub) => sum + hub.occupiedParking, 0);
  const totalChargers = hubs.reduce((sum, hub) => sum + hub.chargers, 0);
  const usedChargers = hubs.reduce((sum, hub) => sum + hub.activeCharging, 0);
  const operatingHubs = hubs.filter((hub) => hub.status === 'normal').length;

  if (view === 'results' && results) {
    const warnings = results.filter((result) => result.warning);

    return (
      <div className="space-y-6">
        <PageHeader
          title="Kết quả mô phỏng kịch bản What-if"
          subtitle="Theo dõi tình trạng HUB, xe, bãi đỗ và trạm sạc theo thời gian thực."
        />

        <button type="button" onClick={() => setView('params')} className="link-green w-fit">
          ← Quay lại tham số mô phỏng
        </button>

        <section className="grid grid-cols-2 gap-5 xl:grid-cols-4">
          <div className="card py-4">
            <p className="text-[13px] text-muted dark:text-slate-400">HUB đang hoạt động</p>
            <p className="mt-2 text-[30px] font-bold leading-none text-ink dark:text-slate-100">
              {operatingHubs} / {hubs.length}
            </p>
            <p className="mt-2 text-xs font-medium text-[#18794E]">
              {hubs.length - operatingHubs} HUB cần kiểm tra
            </p>
          </div>
          <div className="card py-4">
            <p className="text-[13px] text-muted dark:text-slate-400">Xe khả dụng</p>
            <p className="mt-2 text-[30px] font-bold leading-none text-ink dark:text-slate-100">
              {availableVehicles} / {vehicles.length}
            </p>
            <p className="mt-2 text-xs font-medium text-[#2563EB]">{inUse} đang sử dụng</p>
          </div>
          <div className="card py-4">
            <p className="text-[13px] text-muted dark:text-slate-400">Chỗ đỗ khả dụng</p>
            <p className="mt-2 text-[30px] font-bold leading-none text-ink dark:text-slate-100">
              {totalParking - usedParking} / {totalParking}
            </p>
            <p className="mt-2 text-xs font-medium text-[#B45309]">{usedParking} đang sử dụng</p>
          </div>
          <div className="card py-4">
            <p className="text-[13px] text-muted dark:text-slate-400">Trạm sạc khả dụng</p>
            <p className="mt-2 text-[30px] font-bold leading-none text-ink dark:text-slate-100">
              {totalChargers - usedChargers} / {totalChargers}
            </p>
            <p className="mt-2 text-xs font-medium text-[#18794E]">{usedChargers} đang sử dụng</p>
          </div>
        </section>

        <section>
          <h2 className="section-title mb-3">Tình trạng các HUB sau khi chạy mô phỏng</h2>

          <div className="space-y-3">
            {hubs.map((hub, index) => {
              const result = results[index];
              const hubVehicles = vehicles.filter((vehicle) => vehicle.hubId === hub.id).length;
              return (
                <div key={hub.id} className="card-row">
                  <div className="min-w-[230px]">
                    <p className="text-[15px] font-semibold text-ink dark:text-slate-100">
                      {hub.name}
                    </p>
                    <p className="muted-13 mt-0.5">{hub.location}</p>
                  </div>

                  <span className={hubStatusClass[hub.status]}>{hubStatusLabel[hub.status]}</span>

                  <p className="w-[80px] text-[13px] font-medium text-ink dark:text-slate-100">
                    {hubVehicles} xe
                  </p>
                  <p className="w-[80px] text-[13px] font-medium text-ink dark:text-slate-100">
                    {freeParking(hub)} chỗ
                  </p>
                  <p className="w-[80px] text-[13px] font-medium text-ink dark:text-slate-100">
                    {freeChargers(hub)} sạc
                  </p>

                  <button type="button" onClick={() => setDetail(result)} className="link-green">
                    Xem chi tiết →
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Cảnh báo sau khi mô phỏng</h2>
            <p className="muted-13">{warnings.length} cảnh báo</p>
          </div>

          <div className="space-y-2">
            {warnings.length === 0 && (
              <div className="card">
                <p className="muted-13">Không có Hub nào vượt ngưỡng cảnh báo.</p>
              </div>
            )}
            {warnings.map((warning) => (
              <div
                key={warning.hubId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#FDECEC] px-4 py-3 dark:bg-red-500/10"
              >
                <p className="text-[14px] font-medium text-[#C04343] dark:text-red-300">
                  {warning.name}: quá tải — cần điều phối
                </p>
                <Link
                  to={`/operator/hub?hub=${warning.hubId}`}
                  className="text-[13px] font-semibold text-[#C04343] dark:text-red-300"
                >
                  Xem phương án xử lý →
                </Link>
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-end">
          <Button type="primary" size="large" onClick={() => setSaved(true)}>
            Lưu kịch bản và phương án xử lý
          </Button>
        </div>

        <Modal open={detail !== null} onCancel={() => setDetail(null)} footer={null} centered width={520}>
          <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">{detail?.name}</h3>
          <div className="mt-4 space-y-3 text-[14px] text-ink dark:text-slate-200">
            <p>
              Chỗ đỗ hiện tại: <b>{detail?.current}</b> / {detail?.capacity}
            </p>
            <p>
              Dự kiến sau mô phỏng: <b>{detail?.projected}</b> / {detail?.capacity}
            </p>
            <p className="muted-13">
              Khuyến nghị:{' '}
              {detail?.warning
                ? 'điều phối xe hoặc điều hướng người dùng sang Hub lân cận.'
                : 'tiếp tục theo dõi, chưa cần can thiệp.'}
            </p>
          </div>
          <div className="mt-6 flex justify-end">
            <Button type="primary" onClick={() => setDetail(null)}>
              Đóng
            </Button>
          </div>
        </Modal>

        <Modal open={saved} footer={null} closable={false} centered width={480}>
          <h3 className="text-center text-[19px] font-bold text-ink dark:text-slate-100">
            Lưu kịch bản thành công
          </h3>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button onClick={() => setSaved(false)}>Thoát</Button>
            <Button type="primary" onClick={() => setSaved(false)}>
              Tự động đóng ({countdown}s)
            </Button>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mô phỏng kịch bản What-if"
        subtitle="Quản lý trạng thái và tài nguyên của một HUB."
      />

      <div className="card">
        <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
          {params.map((param) => (
            <div key={param.key} className="flex flex-wrap items-center gap-3">
              <div className="min-w-[170px]">
                <p className="muted-13">{param.label}</p>
                <p className="mt-1 inline-flex rounded bg-[#FDF4E5] px-3 py-1 text-[13px] font-semibold text-[#9A6B1F]">
                  {param.value}
                </p>
              </div>

              <div className="text-right">
                <p className="muted-13">Cập nhật cuối</p>
                <p className="text-[13px] text-ink dark:text-slate-200">{updatedAt} · vừa xong</p>
              </div>

              <Button type="primary" size="small" className="ml-auto" onClick={() => openEdit(param)}>
                Thay đổi tham số
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <Button type="primary" size="large" onClick={runSimulation}>
            Chạy mô phỏng
          </Button>
        </div>
      </div>

      <Modal open={editedKey !== null} onCancel={() => setEditedKey(null)} footer={null} centered width={520}>
        <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">
          Vui lòng nhập giá trị tham số
        </h3>
        <p className="muted-13 mt-1">{edited?.label}</p>

        <Input
          className="mt-3"
          size="large"
          value={draftValue}
          onChange={(event) => setDraftValue(event.target.value)}
        />

        <p className="mt-4 text-[13px] font-semibold text-ink dark:text-slate-100">
          Phạm vi áp dụng
        </p>
        <Radio.Group
          value={draftScope}
          onChange={(event) => setDraftScope(event.target.value as Scope)}
          className="mt-2 flex flex-col gap-2"
        >
          <Radio value="all">Toàn hệ thống</Radio>
          <Radio value="specific">Các Hub cụ thể</Radio>
        </Radio.Group>

        {draftScope === 'specific' && (
          <div className="mt-3 max-h-[190px] space-y-2 overflow-y-auto rounded-lg border border-line p-3 dark:border-slate-800">
            {hubs.map((hub) => (
              <label key={hub.id} className="flex items-start gap-2 text-[13px] text-ink dark:text-slate-200">
                <Checkbox
                  checked={draftHubs.includes(hub.id)}
                  onChange={(event) =>
                    setDraftHubs((current) =>
                      event.target.checked
                        ? [...current, hub.id]
                        : current.filter((id) => id !== hub.id),
                    )
                  }
                />
                <span>{hub.name}</span>
              </label>
            ))}
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setEditedKey(null)}>Thoát</Button>
          <Button type="primary" onClick={saveEdit}>
            Gửi
          </Button>
        </div>
      </Modal>
    </div>
  );
}
