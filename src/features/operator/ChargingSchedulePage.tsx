import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App as AntApp, Button, DatePicker, Empty, Modal, Switch, Table, Tabs } from 'antd';
import dayjs from 'dayjs';
import { CalendarClock, Wrench } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { SimulationClock } from '../../components/SimulationClock';
import { useSimNow } from '../../hooks/useSimulationClock';
import { useAppStore } from '../../stores/useAppStore';
import { pickChargingState, prioritizeVehicles, sessionBatteryAt } from '../../services/chargingScheduler';
import { formatDateTime, formatHm, formatMoney, toDateKey } from '../../services/clock';
import type { ChargingSession } from '../../types/domain';
import {
  END_REASON_LABEL,
  PORT_STATUS_LABEL,
  PORT_STATUS_STYLE,
  RESERVATION_STATUS,
  SessionProgress,
} from '../charging/chargingUi';
import { ChargingParamsForm } from './charging/ChargingParamsForm';
import { ChargingTimeline, TimelineLegend } from './charging/ChargingTimeline';
import { PriorityQueuePanel } from './charging/PriorityQueuePanel';
import { hubStatusClass, hubStatusLabel } from './hubStatus';

export function ChargingSchedulePage() {
  const { message, modal } = AntApp.useApp();
  const [params, setParams] = useSearchParams();
  const data = useAppStore();
  const { hubs, chargingPorts, chargingReservations, chargingSessions, chargingConfig } = data;
  const createSmartChargingSchedule = useAppStore((state) => state.createSmartChargingSchedule);
  const completeChargingSession = useAppStore((state) => state.completeChargingSession);
  const setPortMaintenance = useAppStore((state) => state.setPortMaintenance);
  const now = useSimNow(1000);
  const chargingState = pickChargingState(data);

  const hubId = params.get('hub') ?? hubs[0]?.id ?? '';
  const hub = hubs.find((item) => item.id === hubId) ?? hubs[0];
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [view, setView] = useState<'map' | 'params'>('map');
  const [timelineDate, setTimelineDate] = useState(() => toDateKey(now));
  const [lastRun, setLastRun] = useState<number | null>(null);

  if (!hub) return null;

  const hubPorts = chargingPorts.filter((port) => port.hubId === hub.id);
  const activePort = hubPorts.find((port) => port.id === selectedPortId) ?? hubPorts[0] ?? null;
  const liveSessions = chargingSessions.filter(
    (session) => session.hubId === hub.id && (session.status === 'CHARGING' || session.status === 'FULL'),
  );
  const queueCount = prioritizeVehicles(chargingState, hub.id, now).filter((item) => item.eligible).length;
  const todayKey = toDateKey(now);
  const todaysReservations = chargingReservations.filter(
    (item) => item.hubId === hub.id && item.date === todayKey && item.status !== 'CANCELLED',
  );

  const runSchedule = () => {
    const result = createSmartChargingSchedule(hub.id);
    setLastRun(now);
    if (!result.ok) {
      message.info(result.message);
      return;
    }
    message.success(result.message);
  };

  const finishSession = (session: ChargingSession) =>
    modal.confirm({
      title: session.status === 'FULL' ? 'Hoàn tất phiên sạc?' : 'Kết thúc phiên sạc sớm?',
      content: `${session.vehicleLabel} tại ${session.portCode} — pin hiện tại ${Math.round(sessionBatteryAt(session, now))}%.`,
      okText: 'Hoàn tất',
      cancelText: 'Thoát',
      onOk: () => {
        const result = completeChargingSession(session.id, session.status === 'FULL' ? 'full' : 'operator_stop');
        result.ok ? message.success(result.message) : message.error(result.message);
      },
    });

  /* Lịch chi tiết của cổng đang chọn (mockup: "Lịch sạc chi tiết") */
  const portSchedule = activePort
    ? [
        ...chargingSessions
          .filter((session) => session.portId === activePort.id && (session.status !== 'COMPLETED' || toDateKey(session.startedAt) === todayKey))
          .map((session) => ({
            key: session.id,
            time: Date.parse(session.startedAt),
            label: session.vehicleLabel,
            battery: Math.round(sessionBatteryAt(session, now)),
            tag: session.status === 'COMPLETED' ? 'Đã sạc' : session.status === 'FULL' ? 'Đã đầy' : 'Đang sạc',
          })),
        ...chargingReservations
          .filter(
            (item) => item.portId === activePort.id && item.status === 'CONFIRMED',
          )
          .map((item) => ({
            key: item.id,
            time: Date.parse(item.startAt),
            label: item.vehicleLabel,
            battery: item.currentBattery,
            tag: formatHm(item.startAt),
          })),
      ].sort((a, b) => a.time - b.time)
    : [];
  const activeSession = activePort ? liveSessions.find((session) => session.portId === activePort.id) : undefined;

  const historyRows = chargingSessions
    .filter((session) => session.hubId === hub.id && session.status === 'COMPLETED')
    .sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lập lịch sạc ưu tiên"
        subtitle="Quản lý trạng thái và tài nguyên sạc của một HUB."
        actions={<SimulationClock />}
      />

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
            <p className="muted-13">Lập lịch gần nhất</p>
            <p className="mt-1 text-[15px] font-semibold text-ink dark:text-slate-100">
              {lastRun ? `${formatHm(lastRun)} · ${Math.round((now - lastRun) / 60000)} phút trước` : 'Chưa chạy'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setPickerOpen(true)}>Chọn Hub khác</Button>
          <Button onClick={() => setView(view === 'params' ? 'map' : 'params')}>Thay đổi tham số sạc</Button>
          <Button type="primary" icon={<CalendarClock size={15} />} onClick={runSchedule}>
            Lập lịch sạc ưu tiên
          </Button>
        </div>
      </div>

      {view === 'params' ? (
        <ChargingParamsForm onBack={() => setView('map')} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Cổng trống', value: `${hubPorts.filter((port) => port.status === 'free').length}/${hubPorts.length}` },
              { label: 'Đang sạc / đã đầy', value: `${liveSessions.filter((s) => s.status === 'CHARGING').length} / ${liveSessions.filter((s) => s.status === 'FULL').length}` },
              { label: 'Xe chờ trong hàng đợi', value: queueCount },
              { label: 'Lịch đặt hôm nay', value: todaysReservations.length },
            ].map((item) => (
              <div key={item.label} className="card">
                <p className="muted-13">{item.label}</p>
                <p className="mt-1 text-[26px] font-bold text-ink dark:text-slate-100">{item.value}</p>
              </div>
            ))}
          </div>

          <Tabs
            items={[
              {
                key: 'map',
                label: 'Sơ đồ cổng & hàng đợi',
                children: (
                  <div className="space-y-6">
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                      <section>
                        <h2 className="section-title mb-3">Sơ đồ cổng sạc</h2>
                        <div className="card">
                          <div className="mb-4 flex items-center justify-between">
                            <p className="text-[15px] font-semibold text-ink dark:text-slate-100">{hubPorts[0]?.zone ?? 'Khu A · Tầng 1'}</p>
                            <span className="pill-green">{hubPorts.filter((port) => port.status === 'free').length} cổng trống</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
                            {hubPorts.map((port) => {
                              const session = liveSessions.find((item) => item.portId === port.id);
                              return (
                                <button
                                  key={port.id}
                                  type="button"
                                  onClick={() => setSelectedPortId(port.id)}
                                  className={`rounded-lg border px-3 py-2.5 text-left transition ${
                                    port.id === activePort?.id ? 'ring-2 ring-[#102A43]/40' : ''
                                  } ${PORT_STATUS_STYLE[port.status]}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="whitespace-nowrap text-[14px] font-semibold">{port.code}</p>
                                    <p className="whitespace-nowrap text-[11px]">
                                      {port.connector} {port.power}kW
                                    </p>
                                  </div>
                                  <p className="mt-1 text-[12px]">{PORT_STATUS_LABEL[port.status]}</p>
                                  {session && (
                                    <p className="mt-0.5 truncate text-[11px] opacity-80">
                                      {session.vehicleLabel.split(' · ')[0]} · {Math.round(sessionBatteryAt(session, now))}%
                                    </p>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </section>

                      <aside className="card">
                        <h2 className="text-[19px] font-bold text-ink dark:text-slate-100">Lịch sạc chi tiết</h2>
                        {activePort ? (
                          <>
                            <div className="mt-4 flex items-center justify-between gap-2">
                              <div className="inline-flex items-center gap-2 rounded-xl bg-[#EAF7EF] px-4 py-3 dark:bg-emerald-500/10">
                                <p className="text-[22px] font-bold text-[#176B5B] dark:text-emerald-300">{activePort.code}</p>
                                <p className="muted-13">
                                  {activePort.connector} {activePort.power}kW
                                </p>
                              </div>
                              <label className="flex items-center gap-2 text-[12px] text-muted">
                                <Wrench size={14} /> Bảo trì
                                <Switch
                                  size="small"
                                  checked={activePort.underMaintenance}
                                  onChange={(checked) => {
                                    const run = () => {
                                      const result = setPortMaintenance(activePort.id, checked);
                                      result.ok ? message.success(result.message) : message.error(result.message);
                                    };
                                    if (checked && (activeSession || portSchedule.length)) {
                                      modal.confirm({
                                        title: `Chuyển ${activePort.code} sang bảo trì?`,
                                        content:
                                          'Phiên sạc đang chạy sẽ bị ngắt; các lịch đặt sắp tới được chuyển sang cổng khác cùng loại nếu còn trống, nếu không sẽ bị hủy.',
                                        okText: 'Chuyển bảo trì',
                                        okButtonProps: { danger: true },
                                        cancelText: 'Thoát',
                                        onOk: run,
                                      });
                                    } else run();
                                  }}
                                />
                              </label>
                            </div>

                            {activeSession && (
                              <div className="mt-4 rounded-xl border border-line p-3 dark:border-slate-800">
                                <p className="text-[13px] font-semibold text-ink dark:text-slate-100">{activeSession.vehicleLabel}</p>
                                <p className="muted-13 mb-2">
                                  {activeSession.ownerName} · từ {formatHm(activeSession.startedAt)}
                                </p>
                                <SessionProgress session={activeSession} now={now} />
                                <Button
                                  className="mt-2"
                                  block
                                  type={activeSession.status === 'FULL' ? 'primary' : 'default'}
                                  onClick={() => finishSession(activeSession)}
                                >
                                  {activeSession.status === 'FULL' ? 'Rút sạc & hoàn tất phiên' : 'Kết thúc phiên sạc'}
                                </Button>
                              </div>
                            )}

                            <p className="muted-13 mt-4">Danh sách xe</p>
                            <div className="mt-2 space-y-2">
                              {portSchedule.map((item) => (
                                <div
                                  key={item.key}
                                  className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 dark:border-slate-800"
                                >
                                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink dark:text-slate-100">
                                    {item.label.split(' · ')[0]}
                                    <span className="ml-1 font-normal text-muted">{item.label.split(' · ')[1]}</span>
                                  </span>
                                  <span className="text-[12px] font-medium text-ink dark:text-slate-100">Pin {item.battery}%</span>
                                  <span className="rounded-full bg-[#0B1220] px-2.5 py-1 text-[11px] font-semibold text-white">{item.tag}</span>
                                </div>
                              ))}
                              {portSchedule.length === 0 && <p className="muted-13">Cổng chưa có lịch sạc nào.</p>}
                            </div>
                          </>
                        ) : (
                          <p className="muted-13 mt-4">Hub chưa có cổng sạc.</p>
                        )}
                      </aside>
                    </div>

                    <PriorityQueuePanel hubId={hub.id} state={chargingState} now={now} />
                  </div>
                ),
              },
              {
                key: 'timeline',
                label: 'Lịch theo khung giờ',
                children: (
                  <section className="card space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="section-title">Lịch sạc theo khung giờ</h2>
                        <p className="muted-13">Mỗi ô {chargingConfig.slotMinutes} phút · rê chuột vào thanh để xem chi tiết.</p>
                      </div>
                      <DatePicker
                        allowClear={false}
                        format="DD/MM/YYYY"
                        value={dayjs(timelineDate)}
                        onChange={(value) => value && setTimelineDate(value.format('YYYY-MM-DD'))}
                      />
                    </div>
                    <TimelineLegend />
                    <ChargingTimeline
                      ports={hubPorts}
                      reservations={chargingReservations.filter((item) => item.hubId === hub.id)}
                      sessions={chargingSessions.filter((item) => item.hubId === hub.id)}
                      dateKey={timelineDate}
                      openHour={chargingConfig.openHour}
                      closeHour={chargingConfig.closeHour}
                      slotMinutes={chargingConfig.slotMinutes}
                      now={now}
                    />
                    <div>
                      <h3 className="mb-2 text-[15px] font-semibold text-ink dark:text-slate-100">Danh sách lịch đặt trong ngày</h3>
                      <Table
                        size="small"
                        rowKey="id"
                        pagination={{ pageSize: 6, hideOnSinglePage: true }}
                        dataSource={chargingReservations
                          .filter((item) => item.hubId === hub.id && item.date === timelineDate)
                          .sort((a, b) => a.startAt.localeCompare(b.startAt))}
                        locale={{ emptyText: <Empty description="Không có lịch đặt trong ngày." /> }}
                        scroll={{ x: 760 }}
                        columns={[
                          { title: 'Giờ', render: (_, item) => `${formatHm(item.startAt)}–${formatHm(item.endAt)}` },
                          { title: 'Cổng', dataIndex: 'portCode' },
                          { title: 'Sinh viên', dataIndex: 'studentName' },
                          { title: 'Xe', dataIndex: 'vehicleLabel' },
                          { title: 'Pin', render: (_, item) => `${item.currentBattery}% → ${item.targetBattery}%` },
                          { title: 'Ưu tiên', dataIndex: 'priorityScore' },
                          { title: 'Mã', dataIndex: 'code' },
                          {
                            title: 'Trạng thái',
                            render: (_, item) => (
                              <span className={RESERVATION_STATUS[item.status].className}>{RESERVATION_STATUS[item.status].label}</span>
                            ),
                          },
                        ]}
                      />
                    </div>
                  </section>
                ),
              },
              {
                key: 'history',
                label: `Lịch sử phiên sạc (${historyRows.length})`,
                children: (
                  <section className="card">
                    <Table
                      size="small"
                      rowKey="id"
                      dataSource={historyRows}
                      pagination={{ pageSize: 8, hideOnSinglePage: true }}
                      locale={{ emptyText: <Empty description="Chưa có phiên sạc nào hoàn tất tại Hub này." /> }}
                      scroll={{ x: 900 }}
                      summary={(rows) => {
                        const energy = rows.reduce((sum, row) => sum + (row.energyKwh ?? 0), 0);
                        const cost = rows.reduce((sum, row) => sum + (row.cost ?? 0), 0);
                        return rows.length ? (
                          <Table.Summary.Row>
                            <Table.Summary.Cell index={0} colSpan={5}>
                              <b>Tổng</b>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={5}>
                              <b>{Math.round(energy * 100) / 100} kWh</b>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={6}>
                              <b>{formatMoney(cost)}</b>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={7} />
                          </Table.Summary.Row>
                        ) : null;
                      }}
                      columns={[
                        {
                          title: 'Xe',
                          render: (_, item) => (
                            <div>
                              <p className="font-semibold">{item.vehicleLabel}</p>
                              <p className="text-[12px] text-muted">{item.ownerName}</p>
                            </div>
                          ),
                        },
                        { title: 'Cổng', dataIndex: 'portCode' },
                        { title: 'Bắt đầu', render: (_, item) => formatDateTime(item.startedAt) },
                        { title: 'Kết thúc', render: (_, item) => (item.endedAt ? formatDateTime(item.endedAt) : '—') },
                        { title: 'Pin', render: (_, item) => `${Math.round(item.startBattery)}% → ${Math.round(item.endBattery ?? 0)}%` },
                        { title: 'Điện năng', render: (_, item) => `${item.energyKwh ?? 0} kWh` },
                        { title: 'Chi phí', render: (_, item) => formatMoney(item.cost ?? 0) },
                        { title: 'Lý do kết thúc', render: (_, item) => (item.endReason ? END_REASON_LABEL[item.endReason] : '—') },
                      ]}
                    />
                  </section>
                ),
              },
            ]}
          />
        </>
      )}

      <Modal open={pickerOpen} onCancel={() => setPickerOpen(false)} footer={null} centered width={560}>
        <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">Chọn Hub khác</h3>
        <div className="mt-4 space-y-2">
          {hubs.map((item) => {
            const ports = chargingPorts.filter((port) => port.hubId === item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setParams({ hub: item.id });
                  setSelectedPortId(null);
                  setPickerOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 text-left transition hover:border-accent/50 dark:border-slate-800"
              >
                <span>
                  <span className="block text-[14px] font-semibold text-ink dark:text-slate-100">{item.name}</span>
                  <span className="muted-13">
                    {ports.filter((port) => port.status === 'free').length}/{ports.length} cổng trống ·{' '}
                    {prioritizeVehicles(chargingState, item.id, now).filter((entry) => entry.eligible).length} xe chờ sạc
                  </span>
                </span>
                <span className={`${hubStatusClass[item.status]} shrink-0`}>{hubStatusLabel[item.status]}</span>
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
