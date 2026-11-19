import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as AntApp, Button, Pagination } from 'antd';
import { useAppStore } from '../../../stores/useAppStore';
import { chargerSchedule, chargerStates, freeChargers, hubStatus } from '../../../services/HubService';
import { HubInfoBar, PageHeader, useSelectedHub } from '../components/ui';

const PAGE_SIZE = 12;

export function ChargingPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const data = useAppStore();
  const { hub, select } = useSelectedHub();

  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(1);

  if (!hub) return null;

  const chargers = chargerStates(hub);
  const pageItems = chargers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const current = chargers.find((c) => c.no === selected) ?? chargers[0];
  const schedule = current ? chargerSchedule(data, hub.id, current.no) : [];

  const style = {
    busy: 'border-amber-600 bg-amber-50 text-amber-700',
    free: 'border-emerald-600 bg-emerald-50 text-emerald-700',
    fault: 'border-red-500 bg-red-50 text-red-600',
  } as const;
  const text = { busy: 'Đang dùng', free: 'Trống', fault: 'Đang bảo trì' } as const;

  return (
    <div>
      <PageHeader title="Lập lịch sạc ưu tiên" subtitle="Quản lý trạng thái và tài nguyên của một HUB." />
      <HubInfoBar
        hub={hub}
        status={hubStatus(hub)}
        hubs={data.hubs}
        onPick={(id) => { select(id); setPage(1); setSelected(1); }}
        onRefresh={() => message.success('Đã cập nhật trạng thái sạc')}
        extra={<Button type="primary" onClick={() => navigate('/operator/charging/params')}>Thay đổi tham số sạc</Button>}
      />

      <h2 className="mb-3 mt-8 text-xl font-bold">Sơ đồ cổng sạc</h2>
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <section className="op-card p-6">
          <div className="flex items-center justify-between">
            <p className="font-bold">Khu A · Tầng 1</p>
            <span className="rounded-full bg-emerald-100 px-4 py-1 text-xs font-bold text-emerald-700">{freeChargers(hub)} chỗ trống</span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {pageItems.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setSelected(c.no)}
                className={`rounded-xl border px-4 py-4 text-left ${style[c.state]} ${current?.no === c.no ? 'ring-2 ring-black' : ''}`}
              >
                <p className="font-bold text-ink">{c.code}</p>
                <p className="mt-1 text-xs">{text[c.state]}</p>
              </button>
            ))}
          </div>
          {hub.chargers === 0 && <p className="mt-4 text-sm text-muted">Hub không có cổng sạc.</p>}
          <div className="mt-8 flex justify-center">
            <Pagination current={page} pageSize={PAGE_SIZE} total={chargers.length} onChange={setPage} hideOnSinglePage showSizeChanger={false} size="small" />
          </div>
        </section>

        <section className="op-card p-6">
          <h3 className="text-lg font-bold">Lịch sạc chi tiết</h3>
          {current && (
            <div className="mt-3 inline-flex items-baseline gap-2 rounded-xl bg-accent-soft px-4 py-2">
              <span className="text-xl font-bold text-accent">{current.code}</span>
              <span className="text-xs text-muted">60kW</span>
            </div>
          )}
          <p className="mb-2 mt-4 text-xs font-bold text-muted">Danh sách xe</p>
          <div className="space-y-2">
            {schedule.length === 0 && <p className="text-sm text-muted">Chưa có lịch sạc cho cổng này.</p>}
            {schedule.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs">
                <span className="font-bold">{s.vehicleCode}</span>
                <span className="text-muted">{s.model}</span>
                <span className="font-bold">Pin {s.battery}%</span>
                <span className="rounded-full bg-black px-2 py-0.5 font-bold text-white">{s.start}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
