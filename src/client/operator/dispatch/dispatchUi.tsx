import { Steps, Timeline } from 'antd';
import type { DispatchOrder, DispatchStatus } from '@/shared/types/domain';
import { DISPATCH_STATUS_LABEL } from '@/shared/domain/dispatchMath';
import { formatDateTime } from '@/shared/clock';

export const DISPATCH_STATUS_CLASS: Record<DispatchStatus, string> = {
  PENDING: 'rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  ASSIGNED: 'pill-blue',
  IN_TRANSIT: 'pill-orange',
  COMPLETED: 'pill-green',
  CANCELLED: 'rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-300',
};

export function DispatchStatusPill({ status }: { status: DispatchStatus }) {
  return <span className={DISPATCH_STATUS_CLASS[status]}>{DISPATCH_STATUS_LABEL[status]}</span>;
}

const FLOW: DispatchStatus[] = ['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED'];

/** Thanh tiến trình theo state-chart: Khởi tạo → Đã phân công → Đang vận chuyển → Hoàn thành. */
export function DispatchSteps({ order }: { order: DispatchOrder }) {
  const reached = order.history.map((event) => event.status);
  const lastFlowIndex = Math.max(...FLOW.map((status, index) => (reached.includes(status) ? index : -1)));
  const cancelled = order.status === 'CANCELLED';
  const timeOf = (status: DispatchStatus) => order.history.find((event) => event.status === status)?.at;
  return (
    <Steps
      size="small"
      responsive={false}
      current={cancelled ? lastFlowIndex + 1 : FLOW.indexOf(order.status)}
      status={cancelled ? 'error' : order.status === 'COMPLETED' ? 'finish' : 'process'}
      items={[
        ...FLOW.slice(0, cancelled ? lastFlowIndex + 1 : FLOW.length).map((status) => ({
          title: DISPATCH_STATUS_LABEL[status],
          description: timeOf(status) ? formatDateTime(timeOf(status)!) : undefined,
        })),
        ...(cancelled ? [{ title: 'Đã hủy', description: order.cancelledAt ? formatDateTime(order.cancelledAt) : undefined }] : []),
      ]}
    />
  );
}

const TIMELINE_COLOR: Record<DispatchStatus, string> = {
  PENDING: 'gray',
  ASSIGNED: 'blue',
  IN_TRANSIT: 'orange',
  COMPLETED: 'green',
  CANCELLED: 'red',
};

/** Nhật ký thay đổi trạng thái của lệnh. */
export function DispatchHistoryTimeline({ order }: { order: DispatchOrder }) {
  return (
    <Timeline
      className="!mt-2"
      items={order.history.map((event) => ({
        color: TIMELINE_COLOR[event.status],
        children: (
          <div className="text-[13px]">
            <p className="font-semibold text-ink dark:text-slate-100">
              {DISPATCH_STATUS_LABEL[event.status]} <span className="font-normal text-muted">· {formatDateTime(event.at)}</span>
            </p>
            <p className="text-muted">
              {event.actor}
              {event.note ? ` — ${event.note}` : ''}
            </p>
          </div>
        ),
      }))}
    />
  );
}
