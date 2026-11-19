import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App as AntApp, Button, Select } from 'antd';
import { useAppStore } from '../../../stores/useAppStore';
import { useAuthStore } from '../../../stores/useAuthStore';
import { freeSlots, hubLabel, hubStatus, replacementHubs } from '../../../services/HubService';
import { DetailModal, FieldRow, PageHeader } from '../components/ui';

type Dialog = { kind: 'confirm' | 'success' | 'fail'; reason?: string } | null;

export function RedirectPage() {
  const { message } = AntApp.useApp();
  const [params] = useSearchParams();
  const data = useAppStore();
  const { hubs, redirectUsers } = data;
  const operatorName = useAuthStore((s) => s.currentUser?.fullName ?? 'Operator');

  const defaultSource = params.get('src') ?? hubs.find((h) => hubStatus(h) === 'warning')?.id ?? hubs[0]?.id;
  const [source, setSource] = useState<string | undefined>(defaultSource);
  const [dialog, setDialog] = useState<Dialog>(null);

  const sourceHub = hubs.find((h) => h.id === source);
  const alternatives = replacementHubs(data, sourceHub);

  const fields = [
    { label: 'HUB quá tải', value: sourceHub ? `HUB ${sourceHub.code} - ${sourceHub.location}` : '—' },
    {
      label: 'HUB thay thế',
      value: <div>{alternatives.map((h) => <div key={h.id}>HUB {h.code} - {h.location}</div>)}</div>,
    },
  ];

  const open = () => {
    if (!source) return message.warning('Vui lòng chọn Hub quá tải');
    if (alternatives.length === 0) return setDialog({ kind: 'fail', reason: 'Không có Hub thay thế nào còn chỗ trống' });
    setDialog({ kind: 'confirm' });
  };

  const confirm = () => {
    if (!source) return;
    const r = redirectUsers(source, alternatives.map((h) => h.id), operatorName);
    setDialog(r.ok ? { kind: 'success' } : { kind: 'fail', reason: r.message });
  };

  return (
    <div>
      <PageHeader title="Điều hướng người dùng đến các Hub" subtitle="Điều hướng người dùng đến Hub thay thế khi Hub hiện tại bị quá tải" />
      <section className="op-card p-6">
        <p className="mb-3 text-xs font-bold text-muted">Chọn Hub quá tải / Danh sách Hub thay thế</p>
        <FieldRow label="Hub quá tải">
          <Select className="w-full" variant="borderless" value={source} onChange={setSource} options={hubs.map((h) => ({ value: h.id, label: hubLabel(h) }))} />
        </FieldRow>

        <div className="mt-5 grid items-end gap-5 lg:grid-cols-[minmax(0,2fr)_1fr]">
          <div className="rounded-2xl border border-line p-6">
            <p className="mb-4 text-xs font-bold text-muted">Các Hub còn chỗ đỗ gần Hub đích</p>
            <div className="space-y-3">
              {alternatives.length === 0 && <p className="text-sm text-muted">Không có Hub nào còn chỗ trống.</p>}
              {alternatives.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-xl bg-[#F5F7FA] px-4 py-3 text-sm font-bold">
                  <span>HUB {h.code} - {h.location}</span>
                  <span className="text-xs font-semibold text-accent">{freeSlots(h)} chỗ</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="primary" size="large" onClick={open}>Gửi lệnh điều hướng</Button>
          </div>
        </div>
      </section>

      <DetailModal open={dialog?.kind === 'confirm'} title="Điều hướng người dùng" cardTitle="Chi tiết điều hướng" fields={fields} okText="Điều hướng" onOk={confirm} onCancel={() => setDialog(null)} />
      <DetailModal open={dialog?.kind === 'success'} title="Điều hướng người dùng thành công" cardTitle="Chi tiết điều hướng" fields={fields} autoCloseSeconds={5} onCancel={() => setDialog(null)} />
      <DetailModal
        open={dialog?.kind === 'fail'}
        title="Điều hướng người dùng thất bại"
        cardTitle="Chi tiết điều hướng"
        fields={[fields[0], { label: 'Nguyên nhân', value: dialog?.reason ?? '' }]}
        autoCloseSeconds={5}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}
