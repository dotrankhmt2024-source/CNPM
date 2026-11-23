import { createElement as h, useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Input, InputNumber, Modal, Radio } from 'antd';
import { PageHeader } from '../../shared/components/PageHeader';
import { useAppStore } from '../../api/useAppStore';
import { getToken } from '../../api/http';
import type { SavedScenario, WhatIfResult, WhatIfScenario } from '@/shared/types/simulation';
import './simulation.css';

type NumericKey = Exclude<keyof WhatIfScenario, 'name' | 'hubIds' | 'parameterHubIds'>;
interface Field { key: NumericKey; label: string; unit?: string; min: number; max: number; step?: number }
const left: Field[] = [
  { key: 'demandGrowthPercent', label: 'Tỉ lệ gia tăng nhu cầu', unit: '%', min: 0, max: 1000 },
  { key: 'arrivalsPerMinute', label: 'Lượng sinh viên đến Hub/phút', min: 0, max: 10000 },
  { key: 'durationMinutes', label: 'Thời gian mô phỏng', unit: ' phút', min: 1, max: 1440 },
  { key: 'disabledChargers', label: 'Số cổng sạc ngừng hoạt động', min: 0, max: 10000 },
  { key: 'capacityReductionPercent', label: 'Sức chứa của Hub bị thu hẹp', unit: '%', min: 0, max: 100 },
];
const right: Field[] = [
  { key: 'brokenVehiclePercent', label: 'Số lượng xe hỏng', unit: '%', min: 0, max: 100 },
  { key: 'initialVehicleCount', label: 'Số xe ban đầu', min: 0, max: 100000 },
  { key: 'averageBattery', label: 'Mức pin trung bình của xe', unit: '%', min: 0, max: 100 },
  { key: 'priorityBatteryThreshold', label: 'Ngưỡng pin ưu tiên sạc', unit: '%', min: 0, max: 100 },
  { key: 'holdMinutes', label: 'Thời gian giữ chỗ tạm thời', unit: ' phút', min: 0, max: 1440 },
  { key: 'chargingPriorityWeight', label: 'Trọng số ưu tiên sạc', unit: '%', min: 0, max: 100 },
];
const defaults: WhatIfScenario = { name: 'Kịch bản What-if', hubIds: [], durationMinutes: 30,
  demandGrowthPercent: 20, arrivalsPerMinute: 1, departuresPerMinute: 0, disabledChargers: 0,
  capacityReductionPercent: 10, chargingDemand: 0, averageSessionMinutes: 30, energyPerSessionKwh: 2,
  brokenVehiclePercent: 0, averageBattery: 65, priorityBatteryThreshold: 20, holdMinutes: 10, chargingPriorityWeight: 40 };
async function request(path: string, body?: unknown) {
  const response = await fetch(`/api/simulation/${path}`, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok || !data.ok) throw Object.assign(new Error(data.message ?? 'Không kết nối được dịch vụ mô phỏng.'), { status: response.status });
  return data;
}

export function FigmaWhatIfPage() {
  const hubs = useAppStore(s => s.hubs);
  const vehicles = useAppStore(s => s.vehicles);
  const [scenario, setScenario] = useState<WhatIfScenario>(defaults);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [runId, setRunId] = useState('');
  const [view, setView] = useState<'params' | 'results'>('params');
  const [saved, setSaved] = useState<SavedScenario[]>([]);
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Field | 'hub' | null>(null);
  const [draft, setDraft] = useState<number | null>(0);
  const [scope, setScope] = useState<'all' | 'specific'>('all');
  const [draftHubs, setDraftHubs] = useState<string[]>([]);
  const [editError, setEditError] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [invalidMessage, setInvalidMessage] = useState('');
  const [updated, setUpdated] = useState<Record<string, string>>({});
  const [initialTime] = useState(() => new Date().toLocaleTimeString('vi-VN'));
  const [detail, setDetail] = useState<string | null>(null);
  useEffect(() => { void request('saved').then(d => setSaved(d.items)).catch(e => setNotice(e.message)); }, []);
  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setNotice('');
    try { await action(); } catch (e) {
      const message = e instanceof Error ? e.message : 'Có lỗi xảy ra.';
      if (e instanceof Error && 'status' in e && e.status === 400) { setInvalidMessage(message); setInvalid(true); }
      else setNotice(message);
    }
    finally { setBusy(false); }
  };
  const selectedIds = scenario.hubIds.length ? scenario.hubIds : hubs.map(hub => hub.id);
  const initialCount = scenario.initialVehicleCount ?? vehicles.length;
  const open = (field: Field | 'hub') => {
    setEditor(field); setEditError('');
    const ids = field === 'hub' ? selectedIds : scenario.parameterHubIds?.[field.key];
    setScope(field === 'hub' || ids ? 'specific' : 'all'); setDraftHubs(ids ?? selectedIds);
    setDraft(field === 'hub' ? 0 : Number(scenario[field.key] ?? (field.key === 'initialVehicleCount' ? vehicles.length : 0)));
  };
  const saveEdit = () => {
    if (!editor) return;
    if (scope === 'specific' && !draftHubs.length) { setInvalidMessage('Vui lòng chọn ít nhất một Hub.'); setInvalid(true); return; }
    if (editor !== 'hub' && (draft === null || !Number.isFinite(draft) || draft < editor.min || draft > editor.max)) {
      setInvalidMessage(`Vui lòng nhập ${editor.label.toLowerCase()} từ ${editor.min} đến ${editor.max}.`); setInvalid(true); return;
    }
    setScenario(current => editor === 'hub' ? { ...current, hubIds: scope === 'all' ? hubs.map(h => h.id) : draftHubs } :
      { ...current, [editor.key]: draft, parameterHubIds: { ...current.parameterHubIds, [editor.key]: scope === 'all' ? undefined : draftHubs } });
    setUpdated(current => ({ ...current, [editor === 'hub' ? 'hub' : editor.key]: new Date().toLocaleTimeString('vi-VN') }));
    setEditor(null);
  };
  const row = (field: Field | 'hub') => {
    const key = field === 'hub' ? 'hub' : field.key;
    const label = field === 'hub' ? 'Hub khởi phát tắc nghẽn' : field.label;
    const value = field === 'hub' ? selectedIds.length === hubs.length ? 'Toàn hệ thống' : hubs.filter(h => selectedIds.includes(h.id)).map(h => h.name.split(' - ')[0]).join(', ') :
      `${field.key === 'initialVehicleCount' ? initialCount : scenario[field.key] ?? 0}${field.unit ?? ''}`;
    return h('div', { className: 'sim-param', key },
      h('div', { className: 'sim-param-value' }, h('p', { className: 'sim-caption' }, label), h('span', { className: 'sim-value', title: value }, value)),
      h('div', { className: 'sim-updated' }, h('p', { className: 'sim-caption' }, 'Cập nhật cuối'), h('p', {}, `${updated[key] ?? initialTime} · vừa xong`)),
      h(Button, { type: 'primary', size: 'small', onClick: () => open(field) }, 'Thay đổi tham số'));
  };
  const run = () => void perform(async () => {
    const data = await request('run', { scenario: { ...scenario, initialVehicleCount: initialCount, hubIds: selectedIds } });
    setResult(data.result); setRunId(data.runId); setView('results');
  });
  const save = () => void perform(async () => {
    await request('save', { runId }); setRunId(''); setNotice('Đã lưu kịch bản và phương án xử lý.');
    setSaved((await request('saved')).items);
  });
  const impact = result?.hubs.find(hub => hub.hubId === detail);
  const warnings = result?.hubs.filter(hub => hub.utilization >= .9 || hub.vehicleShortage > 0 || hub.chargingQueue > 0) ?? [];
  const totalVehicles = result?.scenario.initialVehicleCount ?? result?.snapshot.vehicles.length ?? 0;
  const availableVehicles = result?.hubs.reduce((n, hub) => n + hub.availableVehicles, 0) ?? 0;
  const totalParking = result?.hubs.reduce((n, hub) => n + hub.capacity, 0) ?? 0;
  const freeParking = result?.hubs.reduce((n, hub) => n + Math.max(0, hub.capacity - hub.projectedOccupancy), 0) ?? 0;
  const totalChargers = result?.snapshot.hubs.reduce((n, hub) => n + hub.chargers, 0) ?? 0;
  const freeChargers = result?.hubs.reduce((n, hub) => n + hub.freeChargers, 0) ?? 0;
  const healthyHubs = result?.hubs.filter(hub => !warnings.some(w => w.hubId === hub.hubId) && result.snapshot.hubs.find(s => s.id === hub.hubId)?.status !== 'maintenance').length ?? 0;
  return h('div', { className: 'sim-page' },
    h(PageHeader, { title: view === 'params' ? 'Mô phỏng kịch bản What-if' : 'Kết quả mô phỏng kịch bản What-if',
      subtitle: view === 'params' ? 'Quản lý trạng thái và tài nguyên của một HUB.' : 'Theo dõi tác động dự kiến đến HUB, xe, bãi đỗ và trạm sạc.' }),
    notice && h(Alert, { message: notice, type: notice.startsWith('Đã lưu') ? 'success' : 'info', showIcon: true, closable: true, onClose: () => setNotice('') }),
    view === 'params' ? h('section', { className: 'sim-config card' },
      h('div', { className: 'sim-columns' }, h('div', { className: 'sim-column' }, row(left[0]), row('hub'), ...left.slice(1).map(row)),
        h('div', { className: 'sim-column' }, ...right.map(row))),
      h('div', { className: 'sim-run' }, h(Button, { type: 'primary', size: 'large', loading: busy, onClick: run }, 'Chạy mô phỏng')),
      h('details', { className: 'sim-extra' }, h('summary', {}, 'Thiết lập bổ sung'),
        h('label', {}, 'Tên kịch bản', h(Input, { value: scenario.name, onChange: e => setScenario({ ...scenario, name: e.target.value }) })),
        ...([{ key: 'departuresPerMinute', label: 'Nhu cầu thuê xe/phút', min: 0, max: 10000 },
          { key: 'chargingDemand', label: 'Số lượt sạc mới/Hub', min: 0, max: 100000 },
          { key: 'averageSessionMinutes', label: 'Thời lượng một lượt sạc (phút)', min: 1, max: 1440 },
          { key: 'energyPerSessionKwh', label: 'Điện năng một lượt sạc (kWh)', min: 0, max: 1000 }] as Field[]).map(row))) :
      result && h('div', { className: 'sim-results' },
        h('div', { className: 'sim-stats' }, ...[
          ['HUB đang hoạt động', `${healthyHubs} / ${result.hubs.length}`, `${result.hubs.length - healthyHubs} HUB cần kiểm tra`, 'green'],
          ['Xe khả dụng', `${availableVehicles} / ${totalVehicles}`, `${Math.max(0, totalVehicles - availableVehicles)} xe không khả dụng`, 'blue'],
          ['Chỗ đỗ khả dụng', `${freeParking} / ${totalParking}`, `${totalParking - freeParking} đang sử dụng`, 'amber'],
          ['Trạm sạc khả dụng', `${freeChargers} / ${totalChargers}`, `${totalChargers - freeChargers} đang dùng / không khả dụng`, 'green'],
        ].map(([label, value, hint, color]) => h('div', { className: 'card sim-stat', key: String(label) }, h('p', { className: 'sim-caption' }, label), h('strong', {}, value), h('p', { className: `sim-stat-hint sim-${color}` }, hint)))),
        h('section', {}, h('h2', { className: 'section-title mb-3' }, 'Tình trạng các HUB sau khi chạy mô phỏng'),
          h('div', { className: 'sim-hub-results sim-scroll-frame', tabIndex: 0, role: 'region', 'aria-label': 'Danh sách Hub sau mô phỏng' }, ...result.hubs.map(hub => h('div', { className: 'card-row sim-hub-result', key: hub.hubId },
            h('div', { className: 'min-w-[200px]' }, h('strong', {}, hub.name), h('p', { className: 'muted-13' }, result.snapshot.hubs.find(h => h.id === hub.hubId)?.location)),
            h('span', { className: hub.utilization >= .9 ? 'pill-orange' : 'pill-green' }, hub.utilization >= .9 ? 'Cảnh báo' : 'Bình thường'),
            h('span', {}, `${hub.availableVehicles} xe`), h('span', {}, `${Math.max(0, hub.capacity - hub.projectedOccupancy)} chỗ`),
            h('span', {}, `${hub.freeChargers} sạc`), h(Button, { type: 'link', onClick: () => setDetail(hub.hubId) }, 'Xem chi tiết →'))))),
        h('section', {}, h('div', { className: 'sim-section-heading' }, h('h2', { className: 'section-title' }, 'Cảnh báo sau khi mô phỏng'), h('span', {}, `${warnings.length} cảnh báo`)),
          h('div', { className: 'sim-alert-results sim-scroll-frame', tabIndex: 0, role: 'region', 'aria-label': 'Cảnh báo sau mô phỏng' }, ...warnings.map(hub => h('div', { className: 'sim-warning', key: hub.hubId },
            h('span', {}, `${hub.name}: ${hub.overflow ? `thiếu ${hub.overflow} chỗ đỗ` : hub.vehicleShortage ? `thiếu ${hub.vehicleShortage} xe` : hub.chargingQueue ? `${hub.chargingQueue} xe chờ sạc` : 'sức chứa đạt ngưỡng 90%'}`),
            h(Button, { type: 'link', onClick: () => setDetail(hub.hubId) }, 'Xem phương án xử lý →'))),
          !warnings.length && h('p', { className: 'muted-13 p-3' }, 'Chưa có cảnh báo cần can thiệp.'))),
        h('div', { className: 'sim-result-actions' }, h(Button, { type: 'link', onClick: () => setView('params') }, '← Quay lại tham số'), h(Button, { type: 'primary', size: 'large', disabled: !runId, loading: busy, onClick: save }, runId ? 'Lưu kịch bản và phương án xử lý' : 'Kết quả đã lưu'))),
    h('div', { className: 'sim-history-link' }, h(Button, { type: 'link', onClick: () => setHistory(true) }, `Kịch bản đã lưu (${saved.length})`)),
    h(Modal, { open: editor !== null && !invalid, className: 'sim-editor-modal', title: 'Vui lòng nhập giá trị tham số', onCancel: () => setEditor(null), onOk: saveEdit, okText: 'Gửi', cancelText: 'Thoát', centered: true, width: 460, closable: false },
      h('p', { className: 'muted-13 mb-3' }, editor === 'hub' ? 'Hub khởi phát tắc nghẽn' : editor?.label),
      editor && editor !== 'hub' && h(InputNumber, { value: draft, step: editor.step ?? 1, controls: false, changeOnBlur: false, style: { width: '65%' }, 'aria-label': editor.label, onChange: value => setDraft(value === null ? null : Number(value)) }),
      h('p', { className: 'font-semibold mt-5 mb-2' }, 'Phạm vi áp dụng'),
      h(Radio.Group, { value: scope, onChange: e => setScope(e.target.value), className: 'flex flex-col gap-2' },
        h(Radio, { value: 'all' }, 'Toàn hệ thống'), h(Radio, { value: 'specific' }, 'Các Hub cụ thể')),
      scope === 'specific' && h('div', { className: 'sim-hub-picker' }, ...hubs.map(hub => h(Checkbox, { key: hub.id, checked: draftHubs.includes(hub.id),
        onChange: e => setDraftHubs(current => e.target.checked ? [...current, hub.id] : current.filter(id => id !== hub.id)) }, hub.name))),
      editError && h(Alert, { type: 'error', message: editError, className: 'mt-3' })),
    h(Modal, { open: invalid, className: 'sim-invalid-modal', centered: true, width: 390, footer: null, closable: false, maskClosable: false },
      h('div', { className: 'sim-error-symbol', 'aria-hidden': true }, '×'),
      h('h2', { className: 'sim-invalid-title' }, 'Tham số đầu vào không hợp lệ!'),
      h('p', { className: 'sim-invalid-detail', role: 'alert' }, invalidMessage),
      h(Button, { type: 'primary', onClick: () => setInvalid(false) }, 'Nhập lại')),
    h(Modal, { open: detail !== null, title: impact?.name ?? 'Phương án xử lý', onCancel: () => setDetail(null), footer: h(Button, { onClick: () => setDetail(null) }, 'Đóng'), width: 640 },
      impact && h('p', { className: 'mb-4' }, `Chỗ đỗ: ${impact.currentOccupancy} → ${impact.projectedOccupancy} / ${impact.capacity} · Thiếu xe: ${impact.vehicleShortage} · Xe chờ sạc: ${impact.chargingQueue}`),
      ...result?.recommendations.filter(r => r.hubId === detail || r.targetHubId === detail).map((r, i) => h('p', { className: 'sim-warning', key: i }, r.message)) ?? [],
      h('p', { className: 'muted-13 mt-4' }, 'Kết quả là ước tính theo giả định; chưa tự áp dụng thay đổi vào vận hành.')),
    h(Modal, { open: history, title: 'Kịch bản đã lưu', onCancel: () => setHistory(false), footer: null },
      !saved.length && h('p', {}, 'Chưa có kịch bản đã lưu.'), ...saved.map(item => h(Button, { key: item.id, type: 'link', block: true, onClick: () => {
        setResult(item.result); setScenario(item.result.scenario); setRunId(''); setView('results'); setHistory(false);
      } }, `${item.result.scenario.name} · ${new Date(item.createdAt).toLocaleString('vi-VN')}`))));
}
