import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App as AntApp, Button, InputNumber, Select } from 'antd';
import { useAppStore } from '../../../stores/useAppStore';
import { useAuthStore } from '../../../stores/useAuthStore';
import { freeSlots, hubLabel, vehicleSources } from '../../../services/HubService';
import { DetailModal, FieldRow, PageHeader, type DetailField } from '../components/ui';

type Dialog = { kind: 'confirm' | 'success' | 'fail'; reason?: string } | null;

export function DispatchPage() {
  const { message } = AntApp.useApp();
  const [params] = useSearchParams();
  const data = useAppStore();
  const { hubs, dispatchNow } = data;
  const operatorName = useAuthStore((s) => s.currentUser?.fullName ?? 'Operator');

  const [source, setSource] = useState<string | undefined>(params.get('src') ?? undefined);
  const [dest, setDest] = useState<string | undefined>(params.get('dest') ?? undefined);
  const [quantity, setQuantity] = useState<number | null>(1);
  const [dialog, setDialog] = useState<Dialog>(null);

  const hubById = (id?: string) => hubs.find((h) => h.id === id);
  const label = (id?: string) => {
    const h = hubById(id);
    return h ? hubLabel(h) : '—';
  };
  const hubOptions = hubs.map((h) => ({ value: h.id, label: hubLabel(h) }));
  const destHub = hubById(dest);
  const nearby = vehicleSources(data, destHub);

  const baseFields: DetailField[] = [
    { label: 'HUB nguồn', value: label(source) },
    { label: 'HUB đích', value: label(dest) },
    { label: 'Số lượng xe', value: quantity ?? '—' },
  ];

  const openConfirm = () => {
    if (!source || !dest) return message.warning('Vui lòng chọn Hub nguồn và Hub đích');
    if (!quantity || quantity < 1) return message.warning('Số lượng xe phải ≥ 1');
    setDialog({ kind: 'confirm' });
  };

  const confirm = () => {
    if (!source || !dest) return;
    const r = dispatchNow(source, dest, quantity ?? 0, operatorName);
    setDialog(r.ok ? { kind: 'success' } : { kind: 'fail', reason: r.message });
  };

  return (
    <div>
      <PageHeader title="Điều phối xe giữa các Hub" subtitle="Điều phối xe qua lại giữa các Hub để tránh hết xe tại các Hub" />

      <section className="op-card p-6">
        <p className="mb-4 text-xs font-bold text-muted">Chọn Hub nguồn / Hub đích / Số lượng xe điều phối giữa 2 Hub</p>
        <div className="space-y-5">
          <FieldRow label="Hub nguồn">
            <Select className="w-full" variant="borderless" placeholder="Chọn Hub nguồn" value={source} onChange={setSource} options={hubOptions} />
          </FieldRow>
          <FieldRow label="Hub đích">
            <Select className="w-full" variant="borderless" placeholder="Chọn Hub đích" value={dest} onChange={setDest} options={hubOptions} />
          </FieldRow>
          <FieldRow label="Số lượng xe">
            <InputNumber className="!w-full" variant="borderless" min={1} precision={0} value={quantity} onChange={setQuantity} />
          </FieldRow>
        </div>
        {destHub && freeSlots(destHub) <= 3 && (
          <p className="mt-3 text-sm font-bold text-amber-600">Cảnh báo: {destHub.name} sắp hết chỗ trống (còn {freeSlots(destHub)} chỗ).</p>
        )}
        <div className="mt-6 flex justify-end">
          <Button type="primary" size="large" onClick={openConfirm}>Gửi lệnh điều phối</Button>
        </div>
      </section>

      <section className="op-card mt-6 max-w-2xl p-6">
        <p className="mb-4 text-xs font-bold text-muted">Các Hub còn xe gần Hub đích</p>
        <div className="space-y-3">
          {nearby.length === 0 && <p className="text-sm text-muted">Không có Hub nào còn xe khả dụng.</p>}
          {nearby.map(({ hub, count }) => (
            <button
              key={hub.id}
              type="button"
              onClick={() => setSource(hub.id)}
              className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-bold ${source === hub.id ? 'bg-accent-soft ring-1 ring-accent' : 'bg-[#F5F7FA] hover:bg-accent-soft'}`}
            >
              <span>HUB {hub.code} - {hub.location}</span>
              <span className="text-xs font-semibold text-accent">{count} xe</span>
            </button>
          ))}
        </div>
      </section>

      <DetailModal
        open={dialog?.kind === 'confirm'}
        title="Điều phối xe"
        cardTitle="Chi tiết điều phối"
        fields={[...baseFields, { label: 'Tình trạng', value: 'Các xe sẵn sàng thực hiện lệnh trong 5 phút tới' }]}
        okText="Điều phối"
        onOk={confirm}
        onCancel={() => setDialog(null)}
      />
      <DetailModal
        open={dialog?.kind === 'success'}
        title="Điều phối xe thành công"
        cardTitle="Chi tiết điều phối"
        fields={[...baseFields, { label: 'Tình trạng', value: 'Các xe sẵn sàng thực hiện lệnh trong 5 phút tới' }]}
        autoCloseSeconds={5}
        onCancel={() => setDialog(null)}
      />
      <DetailModal
        open={dialog?.kind === 'fail'}
        title="Điều phối xe thất bại"
        cardTitle="Chi tiết điều phối"
        fields={[...baseFields, { label: 'Nguyên nhân', value: dialog?.reason ?? '' }]}
        autoCloseSeconds={5}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}
