import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, App as AntApp, Button, Empty, Input, Modal, Progress, Segmented, Select, Table, Tabs } from 'antd';
import { AlertTriangle, ArrowRight, Navigation } from 'lucide-react';
import { PageHeader } from '@/client/shared/components/PageHeader';
import { SimulationClock } from '@/client/shared/components/SimulationClock';
import { useSimNow } from '@/client/shared/hooks/useSimulationClock';
import { useAppStore } from '@/client/api/useAppStore';
import {
  REDIRECT_KIND_LABEL,
  collectAffectedBookings,
  detectOverloadRisk,
  findNearbyAlternativeHubs,
  pickRedirectState,
  scanOverloadedHubs,
} from '@/shared/domain/redirectMath';
import { formatDateTime } from '@/shared/clock';
import type { RedirectOfferStatus, RedirectPlan } from '@/shared/types/domain';
import { DarkField } from '@/client/shared/chargingUi';
import { hubStatusClass, hubStatusLabel } from '@/client/operator/hubStatus';

const OFFER_STATUS: Record<RedirectOfferStatus, { label: string; className: string }> = {
  PENDING: { label: 'Chờ phản hồi', className: 'pill-blue' },
  ACCEPTED: { label: 'Đồng ý', className: 'pill-green' },
  REJECTED: { label: 'Bỏ qua', className: 'pill-orange' },
  FAILED: {
    label: 'Không chuyển được',
    className: 'rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-300',
  },
  EXPIRED: {
    label: 'Hết hiệu lực',
    className: 'rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
};

const RADIUS_OPTIONS = [
  { label: '1 km', value: 1 },
  { label: '2 km', value: 2 },
  { label: '3 km', value: 3 },
  { label: 'Tất cả', value: 0 },
];

export function RoutingPage() {
  const { message, modal } = AntApp.useApp();
  const [params] = useSearchParams();
  useSimNow(5000);
  const data = useAppStore();
  const { hubs, redirectPlans, redirectOffers, approveRedirectionPlan, closeRedirectionPlan } = data;
  const state = pickRedirectState(data);

  const risks = scanOverloadedHubs(state);
  const atRisk = risks.filter((item) => item.atRisk);

  const [overloadedId, setOverloadedId] = useState(
    params.get('hub') ?? atRisk[0]?.hub.id ?? hubs[0]?.id ?? '',
  );
  const [targetId, setTargetId] = useState<string | null>(null);
  const [radius, setRadius] = useState<number>(0);
  const [note, setNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState('active');

  const overloaded = hubs.find((hub) => hub.id === overloadedId) ?? null;
  const overloadedRisk = overloaded ? detectOverloadRisk(state, overloaded) : null;
  const alternatives = overloaded ? findNearbyAlternativeHubs(state, overloaded.id, radius || null) : [];
  const target = alternatives.find((item) => item.hub.id === targetId) ?? null;
  const affected = overloaded ? collectAffectedBookings(state, overloaded.id) : [];
  const activePlanForHub = redirectPlans.find((plan) => plan.status === 'ACTIVE' && plan.overloadedHubId === overloadedId);

  const hubName = (id: string) => hubs.find((hub) => hub.id === id)?.name ?? id;
  const shortName = (id: string) => hubName(id).split(' - ')[0];

  const openConfirm = () => {
    if (!target) {
      message.warning('Vui lòng chọn Hub thay thế.');
      return;
    }
    setError(null);
    setConfirmOpen(true);
  };

  const approve = () => {
    if (!overloaded || !target) return;
    const result = approveRedirectionPlan({ overloadedHubId: overloaded.id, targetHubId: target.hub.id, note });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setConfirmOpen(false);
    setSuccess(result.message);
    setNote('');
    setTab('active');
  };

  const planCard = (plan: RedirectPlan) => {
    const offers = redirectOffers.filter((offer) => offer.planId === plan.id);
    const count = (status: RedirectOfferStatus) => offers.filter((offer) => offer.status === status).length;
    return (
      <div key={plan.id} className="rounded-xl border border-line bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[16px] font-bold text-ink dark:text-slate-100">{plan.code}</p>
              <span className={plan.status === 'ACTIVE' ? 'pill-green' : OFFER_STATUS.EXPIRED.className}>
                {plan.status === 'ACTIVE' ? 'Đang hiệu lực' : 'Đã kết thúc'}
              </span>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink dark:text-slate-200">
              <b>{shortName(plan.overloadedHubId)}</b>
              <ArrowRight size={14} className="text-muted" />
              <b>{shortName(plan.targetHubId)}</b>
              <span className="text-muted">
                · {plan.targetSnapshot.distanceKm} km · Hub mới còn {plan.targetSnapshot.freeParking} chỗ, {plan.targetSnapshot.freeChargers} cổng sạc
              </span>
            </p>
            <p className="muted-13 mt-0.5">Lý do: {plan.reasons.join('; ')}</p>
            {plan.note && <p className="muted-13">Ghi chú: {plan.note}</p>}
            <p className="muted-13">
              {plan.operatorName} · duyệt lúc {formatDateTime(plan.createdAt)}
              {plan.closedAt ? ` · kết thúc ${formatDateTime(plan.closedAt)}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            {(['ACCEPTED', 'REJECTED', 'PENDING', 'FAILED', 'EXPIRED'] as RedirectOfferStatus[])
              .filter((status) => count(status) > 0)
              .map((status) => (
                <span key={status} className={OFFER_STATUS[status].className}>
                  {OFFER_STATUS[status].label}: {count(status)}
                </span>
              ))}
            {plan.status === 'ACTIVE' && (
              <Button
                danger
                onClick={() =>
                  modal.confirm({
                    title: `Kết thúc phương án ${plan.code}?`,
                    content: 'Sinh viên sẽ không còn nhận gợi ý; các đề xuất chưa trả lời chuyển sang hết hiệu lực.',
                    okText: 'Kết thúc',
                    okButtonProps: { danger: true },
                    cancelText: 'Thoát',
                    onOk: () => {
                      const result = closeRedirectionPlan(plan.id);
                      result.ok ? message.success(result.message) : message.error(result.message);
                    },
                  })
                }
              >
                Kết thúc điều hướng
              </Button>
            )}
          </div>
        </div>

        {offers.length === 0 ? (
          <p className="muted-13 mt-3">
            Không có lịch đặt nào tại {shortName(plan.overloadedHubId)} lúc duyệt — sinh viên sắp tới nhận thông báo gợi ý chung.
          </p>
        ) : (
          <Table
            className="mt-3"
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={offers}
            scroll={{ x: 720 }}
            columns={[
              { title: 'Sinh viên', dataIndex: 'studentName' },
              { title: 'Loại', render: (_, offer) => REDIRECT_KIND_LABEL[offer.kind] },
              { title: 'Lịch đặt', dataIndex: 'refLabel' },
              { title: 'Phản hồi lúc', render: (_, offer) => (offer.respondedAt ? formatDateTime(offer.respondedAt) : '—') },
              {
                title: 'Trạng thái',
                render: (_, offer) => (
                  <span title={offer.note} className={OFFER_STATUS[offer.status].className}>
                    {OFFER_STATUS[offer.status].label}
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>
    );
  };

  const activePlans = redirectPlans.filter((plan) => plan.status === 'ACTIVE');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Điều hướng người dùng đến các Hub"
        subtitle="Điều hướng người dùng đến Hub thay thế khi Hub hiện tại bị quá tải."
        actions={<SimulationClock />}
      />

      {/* B1: Hub có nguy cơ quá tải */}
      <section>
        <h2 className="section-title mb-3 flex items-center gap-2">
          <AlertTriangle size={17} className="text-amber-500" /> Hub có nguy cơ quá tải ({atRisk.length})
        </h2>
        {atRisk.length === 0 ? (
          <div className="card muted-13">Chưa phát hiện Hub nào có nguy cơ quá tải.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            {atRisk.map(({ hub, snapshot, reasons }) => (
              <button
                key={hub.id}
                type="button"
                onClick={() => {
                  setOverloadedId(hub.id);
                  setTargetId(null);
                }}
                className={`card text-left transition hover:shadow-sm ${hub.id === overloadedId ? 'ring-2 ring-[#176B5B]/40' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[14px] font-semibold text-ink dark:text-slate-100">{hub.name.split(' - ')[0]}</p>
                  <span className={hubStatusClass[hub.status]}>{hubStatusLabel[hub.status]}</span>
                </div>
                <Progress
                  percent={Math.round(snapshot.occupancyRate * 100)}
                  size="small"
                  status={snapshot.occupancyRate >= 0.85 ? 'exception' : 'normal'}
                />
                <p className="text-[12px] text-muted">
                  {snapshot.freeParking} chỗ trống · {snapshot.freeChargers} cổng sạc · {snapshot.availableVehicles} xe
                </p>
                <ul className="mt-1 list-inside list-disc text-[12px] text-amber-700 dark:text-amber-300">
                  {reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* B2–B4: chọn Hub quá tải, xem Hub thay thế, gửi lệnh */}
      <div className="card">
        <p className="muted-13">Chọn Hub quá tải / Danh sách Hub thay thế</p>

        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-line bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <span className="w-24 shrink-0 text-[13px] text-muted dark:text-slate-400">Hub quá tải</span>
          <span className="h-8 w-px bg-line dark:bg-slate-700" />
          <Select
            value={overloadedId}
            onChange={(value) => {
              setOverloadedId(value);
              setTargetId(null);
            }}
            variant="borderless"
            className="min-w-[320px] text-[14px] font-semibold"
            options={hubs.map((hub) => ({ value: hub.id, label: hub.name }))}
          />
          {overloaded && <span className={`${hubStatusClass[overloaded.status]} ml-auto`}>{hubStatusLabel[overloaded.status]}</span>}
        </div>

        {overloadedRisk && (
          <p className="muted-13 mt-2">
            Hiện tại: bãi đỗ {Math.round(overloadedRisk.snapshot.occupancyRate * 100)}% · {overloadedRisk.snapshot.freeParking} chỗ trống ·{' '}
            {overloadedRisk.snapshot.freeChargers} cổng sạc trống · {overloadedRisk.snapshot.availableVehicles} xe khả dụng
            {overloadedRisk.atRisk ? '' : ' — Hub chưa có dấu hiệu quá tải, vẫn có thể chủ động điều hướng.'}
          </p>
        )}
        {activePlanForHub && (
          <Alert
            className="mt-3"
            type="info"
            showIcon
            message={`Hub này đang có phương án ${activePlanForHub.code} điều hướng sang ${shortName(activePlanForHub.targetHubId)}.`}
          />
        )}

        <div className="mt-5 rounded-xl border border-line p-4 dark:border-slate-800">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="muted-13">Các Hub thay thế gần Hub hiện tại (xếp theo mức phù hợp)</p>
            <Segmented size="small" options={RADIUS_OPTIONS} value={radius} onChange={(value) => setRadius(value as number)} />
          </div>
          <div className="space-y-2">
            {alternatives.map((item, index) => (
              <button
                key={item.hub.id}
                type="button"
                onClick={() => setTargetId(item.hub.id)}
                className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition ${
                  item.hub.id === targetId
                    ? 'border-[#102A43] bg-[#EAF7EF] dark:bg-emerald-500/10'
                    : 'border-line bg-white hover:border-accent/50 dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <span className="flex items-center gap-2 text-[14px] font-semibold text-ink dark:text-slate-100">
                  {item.hub.name}
                  {index === 0 && <span className="pill-green">Đề xuất</span>}
                </span>
                <span className="flex flex-wrap gap-x-4 text-[13px] text-muted">
                  <span>{item.distanceKm} km</span>
                  <span className="font-semibold text-[#18794E]">{item.snapshot.freeParking} chỗ</span>
                  <span>{item.snapshot.freeChargers} cổng sạc</span>
                  <span>{item.snapshot.availableVehicles} xe</span>
                  <span>Phù hợp {item.score}/100</span>
                </span>
              </button>
            ))}
            {alternatives.length === 0 && <p className="muted-13">Không có Hub nào trong bán kính còn chỗ đỗ, cổng sạc hoặc xe.</p>}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="muted-13">
            {affected.length
              ? `Sẽ gửi đề xuất tới ${affected.length} lịch đặt tại Hub này (${Object.entries(
                  affected.reduce<Record<string, number>>((acc, item) => {
                    acc[REDIRECT_KIND_LABEL[item.kind]] = (acc[REDIRECT_KIND_LABEL[item.kind]] ?? 0) + 1;
                    return acc;
                  }, {}),
                )
                  .map(([kind, total]) => `${total} ${kind.toLowerCase()}`)
                  .join(', ')}).`
              : 'Chưa có lịch đặt nào tại Hub này — sinh viên sắp tới sẽ nhận thông báo gợi ý chung.'}
          </p>
          <Button type="primary" size="large" icon={<Navigation size={16} />} onClick={openConfirm}>
            Gửi lệnh điều hướng
          </Button>
        </div>
      </div>

      {/* Phương án & lịch sử */}
      <section className="card">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'active',
              label: `Đang hiệu lực (${activePlans.length})`,
              children: activePlans.length ? (
                <div className="space-y-3">{activePlans.map(planCard)}</div>
              ) : (
                <Empty description="Chưa có phương án điều hướng nào đang hiệu lực." />
              ),
            },
            {
              key: 'history',
              label: `Lịch sử điều hướng (${redirectPlans.length})`,
              children: redirectPlans.length ? (
                <div className="space-y-3">{redirectPlans.map(planCard)}</div>
              ) : (
                <Empty description="Chưa có phương án điều hướng nào." />
              ),
            },
          ]}
        />
      </section>

      <Modal open={confirmOpen} onCancel={() => setConfirmOpen(false)} footer={null} centered width={560}>
        <h3 className="text-[20px] font-bold text-ink dark:text-slate-100">Xác nhận điều hướng người dùng</h3>
        <div className="mt-4 rounded-2xl bg-[#102A43] p-6 text-white">
          <p className="text-[17px] font-bold">Chi tiết điều hướng</p>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <DarkField label="Hub quá tải">{overloaded?.name}</DarkField>
            </div>
            <div className="col-span-2">
              <DarkField label="Hub thay thế">{target?.hub.name}</DarkField>
            </div>
            <DarkField label="Khoảng cách">{target?.distanceKm} km</DarkField>
            <DarkField label="Chỗ đỗ còn trống">{target?.snapshot.freeParking} chỗ</DarkField>
            <DarkField label="Cổng sạc / xe trống">
              {target?.snapshot.freeChargers} cổng · {target?.snapshot.availableVehicles} xe
            </DarkField>
            <DarkField label="Đề xuất gửi tới">{affected.length} lịch đặt</DarkField>
          </dl>
        </div>
        <Input.TextArea className="mt-4" rows={2} placeholder="Ghi chú cho sinh viên (tuỳ chọn)" value={note} onChange={(event) => setNote(event.target.value)} />
        {error && <Alert className="mt-3" type="error" showIcon message={error} />}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setConfirmOpen(false)}>Thoát</Button>
          <Button type="primary" onClick={approve}>
            Điều hướng
          </Button>
        </div>
      </Modal>

      <Modal open={success !== null} onCancel={() => setSuccess(null)} footer={null} centered width={480}>
        <h3 className="text-[20px] font-bold text-[#18794E]">Điều hướng thành công</h3>
        <p className="mt-3 text-[14px] text-ink dark:text-slate-200">{success}</p>
        <div className="mt-6 flex justify-end">
          <Button type="primary" onClick={() => setSuccess(null)}>
            Đóng
          </Button>
        </div>
      </Modal>
    </div>
  );
}
