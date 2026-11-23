import { createElement as h, useEffect, useState } from 'react';
import { getToken } from '../../api/http';
import { useAppStore } from '../../api/useAppStore';
import type { SavedScenario, WhatIfResult, WhatIfScenario } from '@/shared/types/simulation';

async function request(path: string, body?: unknown) {
  const response = await fetch(`/api/simulation/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.message ?? 'Không thể kết nối dịch vụ mô phỏng.');
  return data;
}
const defaults: WhatIfScenario = { name: 'Kịch bản Metro', hubIds: [], durationMinutes: 30,
  demandGrowthPercent: 20, arrivalsPerMinute: 1, departuresPerMinute: 0, disabledChargers: 0,
  capacityReductionPercent: 0, chargingDemand: 0, averageSessionMinutes: 30, energyPerSessionKwh: 2 };
const fields: [keyof WhatIfScenario, string][] = [
  ['durationMinutes', 'Thời gian mô phỏng (phút)'], ['demandGrowthPercent', 'Tăng nhu cầu (%)'],
  ['arrivalsPerMinute', 'Xe đến mỗi phút / Hub'], ['departuresPerMinute', 'Nhu cầu thuê xe mỗi phút / Hub'],
  ['disabledChargers', 'Số cổng hỏng / Hub'], ['capacityReductionPercent', 'Giảm sức chứa (%)'],
  ['chargingDemand', 'Số lượt sạc mới / Hub'], ['averageSessionMinutes', 'Thời lượng một lượt sạc (phút)'],
  ['energyPerSessionKwh', 'Điện năng một lượt sạc (kWh)'],
];

/** Plain .ts React component: createElement is equivalent to JSX. */
export { FigmaWhatIfPage as WhatIfPage } from './FigmaWhatIfPage';

export function LegacyWhatIfPage() {
  const hubs = useAppStore(s => s.hubs);
  const [scenario, setScenario] = useState<WhatIfScenario>(defaults);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [runId, setRunId] = useState('');
  const [saved, setSaved] = useState<SavedScenario[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const refresh = async () => setSaved((await request('saved')).items);
  useEffect(() => { void refresh().catch(e => setNotice(String(e.message))); }, []);
  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setNotice('');
    try { await action(); } catch (e) { setNotice(e instanceof Error ? e.message : 'Có lỗi xảy ra.'); }
    finally { setBusy(false); }
  };
  const inputClass = 'w-full rounded border border-slate-300 p-2 bg-white text-slate-900';
  const buttonClass = 'rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-50';
  return h('div', { className: 'space-y-6' },
    h('h1', { className: 'text-2xl font-bold' }, 'Mô phỏng What-if'),
    h('p', {}, 'Thử thay đổi nhu cầu, sức chứa và cổng sạc. Các tham số áp dụng cho từng Hub đã chọn; kết quả không thay đổi hoạt động thật.'),
    notice && h('p', { role: 'status', className: 'rounded border p-3' }, notice),
    h('form', { className: 'card space-y-4', onSubmit: (e: React.FormEvent) => {
      e.preventDefault(); void perform(async () => {
        const data = await request('run', { scenario }); setResult(data.result); setRunId(data.runId);
      });
    } },
      h('label', { className: 'block' }, 'Tên kịch bản', h('input', { required: true, className: inputClass, value: scenario.name,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setScenario({ ...scenario, name: e.target.value }) })),
      h('fieldset', {}, h('legend', {}, 'Hub chịu tác động'), ...hubs.map(hub => h('label', { key: hub.id, className: 'mr-4 inline-flex gap-2' },
        h('input', { type: 'checkbox', checked: scenario.hubIds.includes(hub.id), onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          setScenario({ ...scenario, hubIds: e.target.checked ? [...scenario.hubIds, hub.id] : scenario.hubIds.filter(id => id !== hub.id) }) }), hub.name))),
      h('div', { className: 'grid gap-4 md:grid-cols-2' }, ...fields.map(([key, label]) => h('label', { key }, label,
        h('input', { className: inputClass, type: 'number', required: true, min: 0, step: 'any', value: scenario[key] as number,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setScenario({ ...scenario, [key]: e.target.value === '' ? '' : Number(e.target.value) }) })))),
      h('button', { type: 'submit', disabled: busy, className: buttonClass }, busy ? 'Đang xử lý…' : 'Chạy mô phỏng')),
    result && h('section', { className: 'card space-y-4' },
      h('h2', { className: 'text-xl font-bold' }, `Kết quả: ${result.scenario.name}`),
      h('p', {}, `Hub đạt ngưỡng 90%: ${result.summary.overloadedHubs} · Lấp đầy trung bình: ${(result.summary.averageUtilization * 100).toFixed(1)}% · Điện năng: ${result.summary.energyDemandKwh.toFixed(1)} kWh`),
      h('div', { className: 'overflow-x-auto' }, h('table', { className: 'w-full text-left' },
        h('thead', {}, h('tr', {}, ...['Hub', 'Hiện tại → dự kiến / sức chứa', 'Vượt chỗ', 'Thiếu xe', 'Chờ sạc', 'Phút chờ ước tính'].map(t => h('th', { key: t, className: 'p-2' }, t)))),
        h('tbody', {}, ...result.hubs.map(hub => h('tr', { key: hub.hubId },
          ...[hub.name, `${hub.currentOccupancy} → ${hub.projectedOccupancy} / ${hub.capacity}`, hub.overflow, hub.vehicleShortage, hub.chargingQueue, hub.waitMinutes ?? 'Không có cổng'].map((v, i) => h('td', { key: i, className: 'p-2 border-t' }, v))))))),
      h('h3', { className: 'font-bold' }, 'Khuyến nghị'),
      h('ul', {}, ...(result.recommendations.length ? result.recommendations.map((r, i) => h('li', { key: i }, r.message)) : [h('li', { key: 'none' }, 'Chưa cần can thiệp theo kịch bản này.')])),
      h('details', {}, h('summary', {}, 'Giả định của mô hình'), ...result.assumptions.map(a => h('p', { key: a }, a))),
      h('button', { className: buttonClass, disabled: busy || !runId, onClick: () => void perform(async () => {
        await request('save', { runId }); setRunId(''); setNotice('Đã lưu kịch bản và kết quả.'); await refresh();
      }) }, runId ? 'Lưu kết quả này' : 'Kết quả đã lưu')),
    h('section', { className: 'card space-y-3' }, h('h2', { className: 'text-xl font-bold' }, 'Kịch bản đã lưu'),
      ...saved.map(item => h('button', { key: item.id, className: 'block underline', disabled: busy, onClick: () => {
        setResult(item.result); setScenario(item.result.scenario); setRunId('');
      } }, `${item.result.scenario.name} — ${new Date(item.createdAt).toLocaleString('vi-VN')}`)),
      !saved.length && h('p', {}, 'Chưa có kịch bản đã lưu.')));
}
