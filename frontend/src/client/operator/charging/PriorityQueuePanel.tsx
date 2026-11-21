import { useState } from 'react';
import { Alert, App as AntApp, Button, Empty, InputNumber, Modal, Select, Table, TimePicker } from 'antd';
import type { Dayjs } from 'dayjs';
import { ListPlus, Zap } from 'lucide-react';
import type { ChargingState, RankedChargingRequest } from '@/contracts/NetworkOperations';
import { apiGateway } from '@/gateway';
import { MINUTE, formatDuration, formatHm } from '@/shared/clock';
import { useAppStore } from '@/client/api/useAppStore';
import { BatteryPill, PriorityScore, SOURCE_LABEL } from '@/client/shared/chargingUi';

interface Props {
  hubId: string;
  state: ChargingState;
  now: number;
}

/** Hàng đợi sạc ưu tiên của một Hub (PriorityChargingQueue + SmartChargingScreen.displayPriorityQueue). */
export function PriorityQueuePanel({ hubId, state, now }: Props) {
  const { message } = AntApp.useApp();
  const requestCharging = useAppStore((store) => store.requestCharging);
  const cancelChargingRequest = useAppStore((store) => store.cancelChargingRequest);
  const allocateChargingPower = useAppStore((store) => store.allocateChargingPower);
  const config = state.chargingConfig;

  // Hàng đợi ưu tiên, cổng trống và danh sách tràn đều lấy qua APIGateway.
  const ranked = apiGateway.operator.priorityQueue(hubId);
  const freePorts = apiGateway.operator.freePorts(hubId);
  const overflowInfo = apiGateway.operator.chargingOverflow(hubId);
  const overflowIds = new Set(overflowInfo.items.map((item) => item.request.id));
  const charging = state.chargingRequests.filter((item) => item.hubId === hubId && item.status === 'charging');

  const [addOpen, setAddOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState<string | undefined>();
  const [target, setTarget] = useState(config.defaultTargetBattery);
  const [neededBy, setNeededBy] = useState<Dayjs | null>(null);

  const queuedIds = new Set(
    state.chargingRequests.filter((item) => item.status === 'queued' || item.status === 'charging').map((item) => item.vehicleId),
  );
  const candidates = state.vehicles
    .filter((vehicle) => vehicle.hubId === hubId && vehicle.status === 'available' && !queuedIds.has(vehicle.id))
    .sort((a, b) => a.battery - b.battery);

  let eligibleRank = 0;
  const rows = ranked.map((item) => ({ ...item, rank: item.eligible ? ++eligibleRank : null }));

  const statusCell = (item: RankedChargingRequest & { rank: number | null }) => {
    if (!item.eligible) return <span className="text-[12px] text-slate-400">{item.reason}</span>;
    if (overflowIds.has(item.request.id)) {
      const wait = overflowInfo.items.find((entry) => entry.request.id === item.request.id)?.waitMinutes;
      return (
        <span className="pill-orange">
          Tràn hàng đợi{wait !== null && wait !== undefined ? ` · chờ ~${formatDuration(wait)}` : ''}
        </span>
      );
    }
    return <span className="pill-green">Sẵn sàng cấp điện</span>;
  };

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">Hàng đợi sạc ưu tiên</h2>
          <p className="muted-13">
            {ranked.filter((item) => item.eligible).length} xe đang chờ · {charging.length} xe đang sạc · {freePorts.length} cổng có thể
            cấp điện ngay
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<ListPlus size={15} />} onClick={() => setAddOpen(true)}>
            Thêm xe vào hàng đợi
          </Button>
          <Button
            type="primary"
            icon={<Zap size={15} />}
            onClick={async () => {
              const result = await allocateChargingPower(hubId);
              result.ok ? message.success(result.message) : message.warning(result.message);
            }}
          >
            Cấp điện theo ưu tiên
          </Button>
        </div>
      </div>

      {overflowInfo.hasOverflow && (
        <Alert
          className="mb-4"
          type="warning"
          showIcon
          message={`${overflowInfo.items.length} xe vượt quá công suất sạc hiện tại`}
          description={
            <div className="space-y-1 text-[13px]">
              <p>
                Các xe {overflowInfo.items.map((item) => `${item.vehicle?.code} (${Math.round(item.battery)}%)`).join(', ')} được giữ
                lại trong hàng đợi, không bị mất khỏi danh sách và sẽ tự động được cấp điện khi có cổng trống.
              </p>
              {overflowInfo.alternatives.length > 0 && (
                <p>
                  Hub thay thế còn cổng trống:{' '}
                  {overflowInfo.alternatives.map((item) => `${item.hub.name.split(' - ')[0]} (${item.freePorts} cổng)`).join(', ')}.
                </p>
              )}
            </div>
          }
        />
      )}

      {rows.length === 0 ? (
        <Empty description="Hàng đợi trống. Bấm “Lập lịch sạc ưu tiên” để quét các xe pin thấp." />
      ) : (
        <Table
          size="small"
          rowKey={(item) => item.request.id}
          pagination={false}
          dataSource={rows}
          scroll={{ x: 820 }}
          rowClassName={(item) => (item.eligible ? '' : 'opacity-60')}
          columns={[
            { title: '#', width: 48, render: (_, item) => (item.rank ? <b>{item.rank}</b> : '—') },
            {
              title: 'Xe',
              render: (_, item) => (
                <div>
                  <p className="font-semibold">{item.vehicle?.code ?? item.request.vehicleId}</p>
                  <p className="text-[12px] text-muted">{item.vehicle?.model}</p>
                </div>
              ),
            },
            { title: 'Pin', width: 90, render: (_, item) => <BatteryPill value={item.battery} /> },
            {
              title: 'Điểm ưu tiên',
              width: 110,
              sorter: (a, b) => a.score - b.score,
              render: (_, item) => <PriorityScore score={item.score} breakdown={item.breakdown} />,
            },
            {
              title: 'Cần dùng lúc',
              width: 110,
              render: (_, item) =>
                item.request.neededBy ? (
                  <span className={item.minutesToNextUse !== null && item.minutesToNextUse <= config.timeWindowMinutes ? 'font-semibold text-red-600' : ''}>
                    {formatHm(item.request.neededBy)}
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                ),
            },
            { title: 'Đã chờ', width: 90, render: (_, item) => formatDuration(item.waitedMinutes) },
            { title: 'Nguồn', width: 150, render: (_, item) => <span className="text-[12px]">{SOURCE_LABEL[item.request.source]}</span> },
            { title: 'Trạng thái', render: (_, item) => statusCell(item) },
            {
              title: '',
              width: 70,
              render: (_, item) => (
                <Button
                  size="small"
                  type="text"
                  danger
                  onClick={async () => {
                    const result = await cancelChargingRequest(item.request.id);
                    result.ok ? message.success(result.message) : message.error(result.message);
                  }}
                >
                  Gỡ
                </Button>
              ),
            },
          ]}
        />
      )}

      <Modal open={addOpen} onCancel={() => setAddOpen(false)} footer={null} centered width={480}>
        <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">Thêm xe vào hàng đợi sạc</h3>
        <div className="mt-4 space-y-3">
          <div>
            <p className="muted-13 mb-1">Xe dùng chung tại Hub</p>
            <Select
              className="w-full"
              placeholder={candidates.length ? 'Chọn xe' : 'Không còn xe khả dụng'}
              value={vehicleId}
              onChange={setVehicleId}
              options={candidates.map((vehicle) => ({
                value: vehicle.id,
                label: `${vehicle.code} · ${vehicle.model} · pin ${vehicle.battery}%`,
              }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="muted-13 mb-1">Sạc tới</p>
              <InputNumber className="w-full" min={10} max={100} suffix="%" value={target} onChange={(value) => setTarget(value ?? 80)} />
            </div>
            <div>
              <p className="muted-13 mb-1">Cần dùng lúc (tuỳ chọn)</p>
              <TimePicker className="w-full" format="HH:mm" minuteStep={5} value={neededBy} onChange={setNeededBy} />
            </div>
          </div>
          <p className="muted-13">
            Xe có lịch sử dụng trong vòng {config.timeWindowMinutes} phút tới được cộng thêm điểm ưu tiên.
          </p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setAddOpen(false)}>Thoát</Button>
          <Button
            type="primary"
            disabled={!vehicleId}
            onClick={async () => {
              let neededIso: string | undefined;
              if (neededBy) {
                const date = new Date(now);
                date.setHours(neededBy.hour(), neededBy.minute(), 0, 0);
                if (date.getTime() < now) date.setTime(date.getTime() + 24 * 60 * MINUTE);
                neededIso = date.toISOString();
              }
              const result = await requestCharging(vehicleId!, { source: 'operator', targetBattery: target, neededBy: neededIso });
              if (!result.ok) {
                message.error(result.message);
                return;
              }
              message.success(result.message);
              setAddOpen(false);
              setVehicleId(undefined);
              setNeededBy(null);
            }}
          >
            Thêm vào hàng đợi
          </Button>
        </div>
      </Modal>
    </section>
  );
}
