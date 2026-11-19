import { Link } from 'react-router-dom';
import { StatusPill } from './ui';
import type { Hub } from '../../../types/domain';
import type { HubStatus } from '../../../services/HubService';

export interface HubRowData {
  hub: Hub;
  status: HubStatus;
  vehicles: number;
  freeSlots: number;
  freeChargers: number;
}

/** Danh sách "Tình trạng các HUB" dùng chung cho Tổng quan và Kết quả mô phỏng. */
export function HubRows({ rows, to, onDetail }: { rows: HubRowData[]; to?: (hub: Hub) => string; onDetail?: (hub: Hub) => void }) {
  return (
    <div className="space-y-3">
      {rows.map(({ hub, status, vehicles, freeSlots, freeChargers }) => (
        <div key={hub.id} className="op-card grid items-center gap-3 px-6 py-4 md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1fr]">
          <div>
            <p className="font-bold">HUB {hub.code ?? hub.name}</p>
            <p className="text-xs text-muted">{hub.location}</p>
          </div>
          <div>
            <StatusPill status={status} />
          </div>
          <p className="font-bold">{vehicles} xe</p>
          <p className="font-bold">{freeSlots} chỗ</p>
          <p className="font-bold">{freeChargers} sạc</p>
          {to ? (
            <Link to={to(hub)} className="op-link">Xem chi tiết →</Link>
          ) : (
            <button type="button" onClick={() => onDetail?.(hub)} className="op-link text-left">Xem chi tiết →</button>
          )}
        </div>
      ))}
    </div>
  );
}
