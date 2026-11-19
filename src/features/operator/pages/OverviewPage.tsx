import { Link, useNavigate } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { useAppStore } from '../../../stores/useAppStore';
import { buildAlerts, hubStatus, overviewHubs, summarizeHubs, vehicleCount } from '../../../services/HubService';
import { AlertRow, PageHeader, StatCard } from '../components/ui';
import { HubRows } from '../components/HubRows';

export function OverviewPage() {
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const data = useAppStore();
  const { resolveIncident } = data;
  const hubs = overviewHubs(data);

  const sm = summarizeHubs(hubs);
  const alerts = buildAlerts(data);

  return (
    <div>
      <PageHeader title="Trung tâm vận hành" subtitle="Theo dõi tình trạng HUB, xe, bãi đỗ và trạm sạc theo thời gian thực." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="HUB đang hoạt động" value={`${sm.operating} / ${sm.total}`} sub={`${sm.needCheck} HUB cần kiểm tra`} />
        <StatCard label="Xe khả dụng" value={`${sm.availableVehicles} / ${sm.availableVehicles + sm.inUseVehicles}`} sub={`${sm.inUseVehicles} đang sử dụng`} subClass="text-blue-600" />
        <StatCard label="Chỗ đỗ khả dụng" value={`${sm.freeSlots} / ${sm.totalSlots}`} sub={`${sm.totalSlots - sm.freeSlots} đang sử dụng`} subClass="text-amber-600" />
        <StatCard label="Trạm sạc khả dụng" value={`${sm.freeChargers} / ${sm.totalChargers}`} sub={`${sm.totalChargers - sm.freeChargers} đang sử dụng`} />
      </div>

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-xl font-bold">Tình trạng các HUB</h2>
        <Link to="/operator/simulation" className="op-link mr-24">Mô phỏng kịch bản →</Link>
      </div>
      <HubRows
        to={(h) => `/operator/hubs?hub=${h.id}`}
        rows={hubs.map((hub) => ({
          hub,
          status: hubStatus(hub),
          vehicles: vehicleCount(hub),
          freeSlots: hub.capacity,
          freeChargers: hub.chargers,
        }))}
      />

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-xl font-bold">Cảnh báo vận hành</h2>
        {alerts.length > 0 && <span className="mr-24 text-sm font-semibold text-accent">{alerts.length} cảnh báo mới</span>}
      </div>
      <div className="space-y-3">
        {alerts.length === 0 && <AlertRow tone="ok">Không có cảnh báo nào — mạng lưới hoạt động bình thường.</AlertRow>}
        {alerts.map((a) => (
          <AlertRow
            key={a.id}
            action={
              <button
                type="button"
                className="mr-12 text-sm font-bold text-red-600 hover:underline"
                onClick={() => {
                  if (a.kind === 'overload') navigate(`/operator/hubs?hub=${a.hubId}`);
                  else {
                    resolveIncident(a.refId);
                    message.success('Đã đánh dấu sự cố là đã xử lý');
                  }
                }}
              >
                Xử lý →
              </button>
            }
          >
            {a.text}
          </AlertRow>
        ))}
      </div>
    </div>
  );
}
