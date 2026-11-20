import { useMemo, useState } from 'react';
import { Empty, Input, Select, Table } from 'antd';
import type { DispatchOrder, DispatchStatus } from '../../../types/domain';
import { DISPATCH_STATUS_LABEL, actualTransitMinutes } from '../../../services/dispatchService';
import { formatDateTime, formatDuration } from '../../../services/clock';
import { useAppStore } from '../../../stores/useAppStore';
import { DispatchHistoryTimeline, DispatchStatusPill, DispatchSteps } from './dispatchUi';

/** Lịch sử toàn bộ lệnh điều phối: lọc theo trạng thái / Hub / mã, xem nhật ký từng lệnh. */
export function DispatchHistory({ orders }: { orders: DispatchOrder[] }) {
  const hubs = useAppStore((state) => state.hubs);
  const [status, setStatus] = useState<DispatchStatus | 'ALL'>('ALL');
  const [hubId, setHubId] = useState<string>('ALL');
  const [keyword, setKeyword] = useState('');
  const hubName = (id: string) => hubs.find((hub) => hub.id === id)?.name.split(' - ')[0] ?? id;

  const rows = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return orders
      .filter((order) => status === 'ALL' || order.status === status)
      .filter((order) => hubId === 'ALL' || order.sourceHubId === hubId || order.destHubId === hubId)
      .filter(
        (order) =>
          !text ||
          order.code.toLowerCase().includes(text) ||
          order.vehicleCodes.some((code) => code.toLowerCase().includes(text)) ||
          (order.staffName ?? '').toLowerCase().includes(text),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [orders, status, hubId, keyword]);

  const completed = orders.filter((order) => order.status === 'COMPLETED');
  const movedVehicles = completed.reduce((sum, order) => sum + order.quantity, 0);
  const durations = completed.map(actualTransitMinutes).filter((value): value is number => value !== null);
  const avgMinutes = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  const onTime = completed.filter(
    (order) => order.completedAt && order.expectedArrivalAt && order.completedAt <= order.expectedArrivalAt,
  ).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Lệnh đã hoàn thành', value: completed.length },
          { label: 'Xe đã điều chuyển', value: movedVehicles },
          { label: 'Thời gian vận chuyển TB', value: avgMinutes === null ? '—' : formatDuration(avgMinutes) },
          { label: 'Đúng giờ', value: completed.length ? `${Math.round((onTime / completed.length) * 100)}%` : '—' },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-line p-3 dark:border-slate-800">
            <p className="muted-13">{item.label}</p>
            <p className="text-[22px] font-bold text-ink dark:text-slate-100">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          value={status}
          onChange={setStatus}
          style={{ minWidth: 170 }}
          options={[
            { value: 'ALL', label: 'Tất cả trạng thái' },
            ...(Object.keys(DISPATCH_STATUS_LABEL) as DispatchStatus[]).map((value) => ({
              value,
              label: DISPATCH_STATUS_LABEL[value],
            })),
          ]}
        />
        <Select
          value={hubId}
          onChange={setHubId}
          style={{ minWidth: 220 }}
          options={[{ value: 'ALL', label: 'Tất cả Hub' }, ...hubs.map((hub) => ({ value: hub.id, label: hub.name }))]}
        />
        <Input.Search
          allowClear
          placeholder="Tìm mã lệnh, mã xe, nhân viên"
          style={{ maxWidth: 280 }}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </div>

      <Table
        size="small"
        rowKey="id"
        dataSource={rows}
        pagination={{ pageSize: 8, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty description="Không có lệnh phù hợp." /> }}
        scroll={{ x: 900 }}
        expandable={{
          expandedRowRender: (order) => (
            <div className="grid gap-4 py-2 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <DispatchSteps order={order} />
                </div>
                <p className="text-[13px]">
                  <b>Xe:</b> {order.vehicleCodes.join(', ')}
                </p>
                {order.note && (
                  <p className="text-[13px]">
                    <b>Ghi chú:</b> {order.note}
                  </p>
                )}
                {order.cancelReason && (
                  <p className="text-[13px] text-red-600">
                    <b>Lý do hủy:</b> {order.cancelReason}
                  </p>
                )}
              </div>
              <DispatchHistoryTimeline order={order} />
            </div>
          ),
        }}
        columns={[
          { title: 'Mã lệnh', dataIndex: 'code', render: (code: string) => <b>{code}</b> },
          {
            title: 'Tuyến',
            render: (_, order) => `${hubName(order.sourceHubId)} → ${hubName(order.destHubId)}`,
          },
          { title: 'Số xe', dataIndex: 'quantity', width: 70 },
          { title: 'Nhân viên', render: (_, order) => order.staffName ?? '—' },
          { title: 'Tạo lúc', render: (_, order) => formatDateTime(order.createdAt) },
          {
            title: 'Kết thúc',
            render: (_, order) =>
              order.completedAt ? formatDateTime(order.completedAt) : order.cancelledAt ? formatDateTime(order.cancelledAt) : '—',
          },
          {
            title: 'Thời gian VC',
            render: (_, order) => {
              const minutes = actualTransitMinutes(order);
              if (minutes === null) return '—';
              const late = minutes - order.etaMinutes;
              return (
                <span className={late > 0 ? 'text-red-600' : ''}>
                  {formatDuration(minutes)}
                  {late > 0 ? ` (+${late}′)` : ''}
                </span>
              );
            },
          },
          { title: 'Trạng thái', render: (_, order) => <DispatchStatusPill status={order.status} /> },
        ]}
      />
    </div>
  );
}
