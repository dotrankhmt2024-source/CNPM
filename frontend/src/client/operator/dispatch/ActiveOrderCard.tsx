import { useState } from 'react';
import { App as AntApp, Button, Input, Modal, Progress, Select } from 'antd';
import { ArrowRight, Truck } from 'lucide-react';
import type { DispatchOrder } from '@/shared/types/domain';
import { transitProgress } from '@/shared/domain/dispatchMath';
import { formatDuration, formatHm } from '@/shared/clock';
import { useAppStore } from '@/client/api/useAppStore';
import { DispatchStatusPill, DispatchSteps } from '@/client/operator/dispatch/dispatchUi';

/** Thẻ một lệnh điều phối đang thực hiện, kèm các thao tác theo trạng thái. */
export function ActiveOrderCard({ order, now }: { order: DispatchOrder; now: number }) {
  const { message } = AntApp.useApp();
  const hubs = useAppStore((state) => state.hubs);
  const staff = useAppStore((state) => state.dispatchStaff);
  const vehicles = useAppStore((state) => state.vehicles);
  const assignDispatchStaff = useAppStore((state) => state.assignDispatchStaff);
  const startDispatchTransport = useAppStore((state) => state.startDispatchTransport);
  const completeDispatchOrder = useAppStore((state) => state.completeDispatchOrder);
  const cancelDispatchOrder = useAppStore((state) => state.cancelDispatchOrder);

  const [staffId, setStaffId] = useState<string | undefined>(order.staffId);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const source = hubs.find((hub) => hub.id === order.sourceHubId);
  const dest = hubs.find((hub) => hub.id === order.destHubId);
  const transit = transitProgress(order, now);
  const notify = async (result: Promise<{ ok: boolean; message: string }>) => {
    const resolved = await result;
    resolved.ok ? message.success(resolved.message) : message.error(resolved.message);
  };

  return (
    <div className="rounded-xl border border-line bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[16px] font-bold text-ink dark:text-slate-100">{order.code}</p>
            <DispatchStatusPill status={order.status} />
            {transit.lateMinutes > 0 && <span className="pill-orange !bg-red-50 !text-red-600">Trễ {transit.lateMinutes} phút</span>}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-ink dark:text-slate-200">
            <b>{source?.name.split(' - ')[0]}</b>
            <ArrowRight size={14} className="text-muted" />
            <b>{dest?.name.split(' - ')[0]}</b>
            <span className="text-muted">
              · {order.quantity} xe · {order.distanceKm} km · ~{order.etaMinutes} phút
            </span>
          </p>
          {order.note && <p className="muted-13 mt-0.5">Ghi chú: {order.note}</p>}
        </div>
        <p className="muted-13 text-right">
          {order.staffName ? (
            <>
              Nhân viên: <b className="text-ink dark:text-slate-200">{order.staffName}</b>
            </>
          ) : (
            'Chưa phân công'
          )}
        </p>
      </div>

      <div className="mt-3 overflow-x-auto pb-1">
        <DispatchSteps order={order} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {order.vehicleIds.map((id, index) => {
          const vehicle = vehicles.find((item) => item.id === id);
          return (
            <span key={id} className="rounded-md bg-slate-100 px-2 py-1 text-[12px] font-medium text-ink dark:bg-slate-800 dark:text-slate-200">
              {vehicle?.code ?? order.vehicleCodes[index]}
              {vehicle && <span className="text-muted"> · {vehicle.battery}%</span>}
            </span>
          );
        })}
      </div>

      {order.status === 'IN_TRANSIT' && (
        <div className="mt-3 rounded-lg bg-amber-50/60 px-3 py-2 dark:bg-amber-500/5">
          <div className="flex items-center justify-between text-[12px] text-muted">
            <span className="flex items-center gap-1">
              <Truck size={14} /> Xuất phát {formatHm(order.startedAt!)}
            </span>
            <span>
              {transit.remainingMinutes > 0
                ? `Còn ~${formatDuration(transit.remainingMinutes)} · dự kiến tới ${formatHm(order.expectedArrivalAt!)}`
                : `Đã tới giờ dự kiến (${formatHm(order.expectedArrivalAt!)}) — chờ xác nhận giao`}
            </span>
          </div>
          <Progress
            percent={Math.round(transit.progress * 100)}
            size="small"
            showInfo={false}
            status={transit.lateMinutes > 0 ? 'exception' : 'active'}
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {(order.status === 'PENDING' || order.status === 'ASSIGNED') && (
          <>
            <Select
              size="middle"
              placeholder="Chọn nhân viên"
              style={{ minWidth: 190 }}
              value={staffId}
              onChange={setStaffId}
              options={staff.map((item) => ({ value: item.id, label: `${item.name} · ${item.phone}` }))}
            />
            <Button
              disabled={!staffId || staffId === order.staffId}
              onClick={() => void notify(assignDispatchStaff(order.id, staffId!))}
            >
              {order.staffId ? 'Đổi phân công' : 'Phân công'}
            </Button>
            <Button danger onClick={() => setCancelOpen(true)}>
              Hủy lệnh
            </Button>
            <Button type="primary" disabled={order.status !== 'ASSIGNED'} onClick={() => void notify(startDispatchTransport(order.id))}>
              Bắt đầu vận chuyển
            </Button>
          </>
        )}
        {order.status === 'IN_TRANSIT' && (
          <Button type="primary" onClick={() => void notify(completeDispatchOrder(order.id))}>
            Xác nhận đã giao tới Hub đích
          </Button>
        )}
      </div>

      <Modal open={cancelOpen} onCancel={() => setCancelOpen(false)} footer={null} centered width={460}>
        <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">Hủy lệnh {order.code}?</h3>
        <p className="muted-13 mt-1">{order.quantity} xe sẽ được mở khóa và tiếp tục phục vụ tại Hub nguồn.</p>
        <Input.TextArea
          className="mt-4"
          rows={3}
          placeholder="Lý do hủy lệnh"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setCancelOpen(false)}>Thoát</Button>
          <Button
            type="primary"
            danger
            disabled={!reason.trim()}
            onClick={() => {
              void notify(cancelDispatchOrder(order.id, reason));
              setCancelOpen(false);
            }}
          >
            Hủy lệnh
          </Button>
        </div>
      </Modal>
    </div>
  );
}
