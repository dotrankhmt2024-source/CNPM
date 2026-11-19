import { useState } from 'react';
import { Link } from 'react-router-dom';
import { App as AntApp, Button, Input } from 'antd';
import { useAppStore } from '../../../stores/useAppStore';
import { chargingParamDefs, type ParamDef } from '../../../services/ChargingService';
import { InputModal, PageHeader, ParamCell } from '../components/ui';

/** Frame "Lập lịch sạc ưu tiên" – 6 tham số sạc, mỗi tham số có nút "Thay đổi tham số sạc". */
export function ChargingParamsPage() {
  const { message } = AntApp.useApp();
  const { chargingParams, updateChargingParams } = useAppStore();
  const [stamps, setStamps] = useState<Record<string, Date>>({});
  const [editing, setEditing] = useState<ParamDef | null>(null);
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const stamp = (key: string) => stamps[key] ?? new Date();

  const submit = () => {
    if (!editing) return;
    const parsed = editing.parse(raw);
    if (!parsed.ok) return setError(parsed.error);
    const res = updateChargingParams({ ...chargingParams, [editing.key]: parsed.value });
    if (!res.ok) return setError(res.message);
    setStamps((s) => ({ ...s, [editing.key]: new Date() }));
    message.success(`Đã cập nhật "${editing.label}"`);
    setEditing(null);
  };

  return (
    <div>
      <PageHeader
        title="Lập lịch sạc ưu tiên"
        subtitle="Quản lý trạng thái và tài nguyên của một HUB."
        extra={<Link to="/operator/charging" className="op-link">← Quay lại sơ đồ cổng sạc</Link>}
      />
      <section className="op-card divide-y divide-line px-6">
        {chargingParamDefs.map((def) => (
          <div key={def.key} className="py-6">
            <ParamCell
              label={def.label}
              value={def.format(chargingParams)}
              updatedAt={stamp(def.key)}
              buttonText="Thay đổi tham số sạc"
              onChange={() => { setEditing(def); setRaw(''); setError(null); }}
              extra={<Button size="small" onClick={() => { setStamps((s) => ({ ...s, [def.key]: new Date() })); message.success('Đã cập nhật trạng thái'); }}>Cập nhật trạng thái</Button>}
            />
          </div>
        ))}
      </section>

      <InputModal open={!!editing} title="Vui lòng nhập tham số" error={error} onCancel={() => setEditing(null)} onSubmit={submit}>
        <Input
          autoFocus
          size="large"
          className="!bg-[#F5F7FA] !text-center"
          placeholder={editing ? `${editing.label} (hiện tại: ${editing.format(chargingParams)})` : ''}
          value={raw}
          onChange={(e) => { setRaw(e.target.value); setError(null); }}
          onPressEnter={submit}
        />
      </InputModal>
    </div>
  );
}
