import { useMemo, useState } from 'react';
import { App as AntApp, Button, Checkbox, Input, Radio, Select } from 'antd';
import { useAppStore } from '../../../stores/useAppStore';
import {
  defaultWhatIf,
  formatWhatIf,
  parseWhatIfNumber,
  runWhatIf,
  summarizeSim,
  validateWhatIf,
  whatIfDefs,
  type Scope,
  type SimHub,
  type WhatIfDef,
  type WhatIfScopes,
  type WhatIfValues,
} from '../../../services/SimulationService';
import { AlertRow, HubInfoBar, InputModal, NoticeModal, PageHeader, ParamCell, StatCard } from '../components/ui';
import { HubRows } from '../components/HubRows';
import type { Hub } from '../../../types/domain';

type View = { name: 'config' } | { name: 'result' } | { name: 'detail'; hubId: string };

export function SimulationPage() {
  const { message } = AntApp.useApp();
  const data = useAppStore();
  const { hubs, saveSimulationReport } = data;

  const [values, setValues] = useState<WhatIfValues>(() => defaultWhatIf(data));
  const [scopes, setScopes] = useState<WhatIfScopes>({});
  const [stamps, setStamps] = useState<Record<string, Date>>({});
  const [view, setView] = useState<View>({ name: 'config' });
  const [result, setResult] = useState<SimHub[]>([]);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState(false);

  // hộp thoại sửa tham số
  const [editing, setEditing] = useState<WhatIfDef | null>(null);
  const [raw, setRaw] = useState('');
  const [hubChoice, setHubChoice] = useState('');
  const [scopeMode, setScopeMode] = useState<'all' | 'some'>('all');
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const stamp = (k: string) => stamps[k] ?? new Date();

  const openEdit = (def: WhatIfDef) => {
    setEditing(def);
    setRaw('');
    setHubChoice(String(values[def.key]));
    const sc: Scope = scopes[def.key] ?? 'all';
    setScopeMode(sc === 'all' ? 'all' : 'some');
    setScopeIds(sc === 'all' ? [] : sc);
    setError(null);
  };

  const submitEdit = () => {
    if (!editing) return;
    let next: number | string;
    if (editing.kind === 'hub') {
      if (!hubs.some((h) => h.id === hubChoice)) return setError('Vui lòng chọn một Hub');
      next = hubChoice;
    } else {
      const parsed = parseWhatIfNumber(editing, raw);
      if (!parsed.ok) return setError(parsed.error);
      next = parsed.value;
    }
    if (editing.scoped && scopeMode === 'some' && scopeIds.length === 0) return setError('Vui lòng chọn ít nhất một Hub trong phạm vi áp dụng');
    setValues((v) => ({ ...v, [editing.key]: next }));
    if (editing.scoped) setScopes((s) => ({ ...s, [editing.key]: scopeMode === 'all' ? 'all' : scopeIds }));
    setStamps((s) => ({ ...s, [editing.key]: new Date() }));
    setEditing(null);
  };

  const run = () => {
    const err = validateWhatIf(data, values);
    if (err) return message.error(err); // test case 4.18: không chạy mô phỏng khi tham số sai
    setResult(runWhatIf(data, values, scopes));
    setSaved(false);
    setView({ name: 'result' });
  };

  const sm = useMemo(() => summarizeSim(result), [result]);
  const warnings = sm.warnings;

  const save = () => {
    saveSimulationReport({
      scenarioLabel: `What-if · ${hubs.find((h) => h.id === values.originHubId)?.name ?? ''} · +${values.demandGrowthPct}% nhu cầu`,
      summary: `${warnings.length} Hub cảnh báo sau ${values.durationMinutes} phút`,
      overloadedHubs: warnings.length,
    });
    setSaved(true);
    setNotice(true);
  };

  /* ---------------- 1) cấu hình tham số ---------------- */
  if (view.name === 'config') {
    return (
      <div>
        <PageHeader title="Mô phỏng kịch bản What-if" subtitle="Quản lý trạng thái và tài nguyên của một HUB." />
        <section className="op-card p-6">
          <div className="grid gap-x-10 gap-y-8 xl:grid-cols-2">
            {whatIfDefs.map((def) => (
              <ParamCell
                key={def.key}
                label={def.label}
                value={formatWhatIf(def, values, hubs)}
                updatedAt={stamp(def.key)}
                onChange={() => openEdit(def)}
              />
            ))}
          </div>
          <div className="mt-8 flex justify-end">
            <Button type="primary" size="large" onClick={run}>Chạy mô phỏng</Button>
          </div>
        </section>

        <InputModal open={!!editing} title="Vui lòng nhập giá trị tham số" error={error} onCancel={() => setEditing(null)} onSubmit={submitEdit}>
          {editing?.kind === 'hub' ? (
            <Select
              className="w-full"
              size="large"
              value={hubChoice}
              onChange={setHubChoice}
              options={hubs.map((h) => ({ value: h.id, label: `${h.name} - ${h.location}` }))}
            />
          ) : (
            <Input
              autoFocus
              size="large"
              className="!bg-[#F5F7FA]"
              placeholder={editing ? `${editing.label} (hiện tại: ${formatWhatIf(editing, values, hubs)})` : ''}
              value={raw}
              onChange={(e) => { setRaw(e.target.value); setError(null); }}
            />
          )}
          {editing?.scoped && (
            <div className="mt-6">
              <h3 className="mb-3 text-xl font-bold">Phạm vi áp dụng</h3>
              <Radio.Group value={scopeMode} onChange={(e) => setScopeMode(e.target.value)} className="flex flex-col gap-2">
                <Radio value="all">Toàn bộ hệ thống</Radio>
                <Radio value="some">Các Hub cụ thể</Radio>
              </Radio.Group>
              {scopeMode === 'some' && (
                <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-black bg-[#F5F7FA] p-3">
                  <Checkbox.Group value={scopeIds} onChange={(v) => setScopeIds(v as string[])} className="flex flex-col gap-2">
                    {hubs.map((h: Hub) => (
                      <Checkbox key={h.id} value={h.id}><span className="font-bold">{h.name} - {h.location}</span></Checkbox>
                    ))}
                  </Checkbox.Group>
                </div>
              )}
            </div>
          )}
        </InputModal>
      </div>
    );
  }

  /* ---------------- 3) chi tiết một Hub sau mô phỏng ---------------- */
  if (view.name === 'detail') {
    const sim = result.find((r) => r.hub.id === view.hubId) ?? result[0];
    const lines = (items: string[]) => items.map((t) => <div key={t}>{t}</div>);
    const noAdvice = 'chưa tìm được Hub phù hợp để hỗ trợ.';
    return (
      <div>
        <PageHeader
          title="Kết quả mô phỏng kịch bản What-if"
          subtitle="Quản lý trạng thái và tài nguyên của một HUB."
          extra={<button type="button" className="op-link" onClick={() => setView({ name: 'result' })}>← Quay lại kết quả</button>}
        />
        <HubInfoBar compact hub={sim.hub} status={sim.status} hubs={hubs} onPick={(id) => setView({ name: 'detail', hubId: id })} />

        <h2 className="mb-3 mt-8 text-xl font-bold">Xe tại HUB</h2>
        {sim.status === 'maintenance' ? (
          <AlertRow tone="warning">Hub đang bảo trì trong suốt kịch bản mô phỏng.</AlertRow>
        ) : sim.vehicles > 0 && sim.vehicleAdvice.length === 0 ? (
          <AlertRow tone="ok">Sau mô phỏng Hub còn {sim.vehicles} xe, chưa cần điều phối.</AlertRow>
        ) : (
          <AlertRow>
            <div>Hiện tại Hub không còn xe, gợi ý:</div>
            {sim.vehicleAdvice.length ? lines(sim.vehicleAdvice) : <div>{noAdvice}</div>}
          </AlertRow>
        )}

        <h2 className="mb-3 mt-8 text-xl font-bold">Bãi đỗ</h2>
        {sim.status === 'maintenance' ? (
          <AlertRow tone="warning">Bãi đỗ tạm đóng do Hub bảo trì.</AlertRow>
        ) : sim.freeSlots > 0 && sim.parkingAdvice.length === 0 ? (
          <AlertRow tone="ok">Sau mô phỏng bãi đỗ còn {sim.freeSlots} chỗ trống.</AlertRow>
        ) : (
          <AlertRow>
            <div>Hiện tại Hub không còn chỗ đỗ xe, gợi ý:</div>
            {sim.parkingAdvice.length ? lines(sim.parkingAdvice) : <div>{noAdvice}</div>}
          </AlertRow>
        )}

        <h2 className="mb-3 mt-8 text-xl font-bold">Lịch sạc</h2>
        {sim.status === 'maintenance' ? (
          <AlertRow tone="warning">Các cổng sạc tạm ngừng do Hub bảo trì.</AlertRow>
        ) : sim.freeChargers > 0 && sim.chargingAdvice.length === 0 ? (
          <AlertRow tone="ok">Sau mô phỏng còn {sim.freeChargers} cổng sạc trống.</AlertRow>
        ) : (
          <AlertRow>
            <div>Hiện tại Hub không còn chỗ sạc xe, gợi ý:</div>
            {sim.chargingAdvice.length ? lines(sim.chargingAdvice) : <div>{noAdvice}</div>}
          </AlertRow>
        )}
      </div>
    );
  }

  /* ---------------- 2) kết quả tổng quan ---------------- */
  return (
    <div>
      <PageHeader
        title="Kết quả mô phỏng kịch bản What-if"
        subtitle="Theo dõi tình trạng HUB, xe, bãi đỗ và trạm sạc theo thời gian thực."
        extra={<button type="button" className="op-link" onClick={() => setView({ name: 'config' })}>← Chỉnh tham số / chạy lại</button>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="HUB đang hoạt động" value={`${sm.operating} / ${sm.total}`} sub={`${warnings.length} HUB cần kiểm tra`} />
        <StatCard label="Xe khả dụng" value={`${sm.vehicles} / ${values.initialVehicles}`} sub={`${Math.max(0, values.initialVehicles - sm.vehicles)} đang sử dụng`} subClass="text-blue-600" />
        <StatCard label="Chỗ đỗ khả dụng" value={`${sm.freeSlots} / ${sm.totalSlots}`} sub={`${sm.totalSlots - sm.freeSlots} đang sử dụng`} subClass="text-amber-600" />
        <StatCard label="Trạm sạc khả dụng" value={`${sm.freeChargers} / ${sm.totalChargers}`} sub={`${sm.totalChargers - sm.freeChargers} đang sử dụng`} />
      </div>

      <h2 className="mb-3 mt-8 text-xl font-bold">Tình trạng các HUB sau khi chạy mô phỏng</h2>
      <div className="max-h-[280px] overflow-y-auto rounded-2xl border border-black p-2">
        <HubRows
          rows={sm.shown.map((r) => ({ hub: r.hub, status: r.status, vehicles: r.vehicles, freeSlots: r.freeSlots, freeChargers: r.freeChargers }))}
          onDetail={(h) => setView({ name: 'detail', hubId: h.id })}
        />
      </div>

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-xl font-bold">Cảnh báo sau khi mô phỏng</h2>
        <span className="mr-24 text-sm font-semibold text-accent">{warnings.length} cảnh báo</span>
      </div>
      <div className="max-h-[260px] space-y-3 overflow-y-auto rounded-2xl border border-black p-2">
        {warnings.length === 0 && <AlertRow tone="ok">Không có Hub nào cảnh báo sau khi mô phỏng.</AlertRow>}
        {warnings.map((w) => (
          <AlertRow
            key={w.hub.id}
            action={<button type="button" className="text-sm font-bold text-red-600 hover:underline" onClick={() => setView({ name: 'detail', hubId: w.hub.id })}>Xem phương án xử lý →</button>}
          >
            HUB {w.hub.code} · Quá tải — cần điều phối
          </AlertRow>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <Button type="primary" size="large" disabled={saved} onClick={save}>
          {saved ? 'Đã lưu kịch bản' : 'Lưu kịch bản và phương án xử lý'}
        </Button>
      </div>
      <NoticeModal open={notice} title="Lưu kịch bản thành công" onClose={() => setNotice(false)} />
    </div>
  );
}
