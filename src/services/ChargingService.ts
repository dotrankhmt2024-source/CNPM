import type { ChargingParams } from '../types/domain';

/**
 * Điểm ưu tiên sạc: xe pin càng thấp càng cao; dưới ngưỡng pin cạn cấp bách được cộng thêm 50 điểm.
 */
export const priorityScore = (battery: number, params: ChargingParams): number =>
  100 - battery + (battery < params.lowBatteryThreshold ? 50 : 0);

export type ParamKey = keyof ChargingParams;

export interface ParamDef {
  key: ParamKey;
  label: string;
  /** Hiển thị giá trị đang lưu. */
  format: (p: ChargingParams) => string;
  /** Chuyển chuỗi người dùng nhập thành giá trị lưu; trả lỗi nếu không hợp lệ. */
  parse: (raw: string) => { ok: true; value: number | string } | { ok: false; error: string };
}

const int = (raw: string, min: number, max: number, unit: string) => {
  const n = Number(raw.trim().replace(',', '.'));
  if (raw.trim() === '' || !Number.isFinite(n)) return { ok: false as const, error: 'Vui lòng nhập một số' };
  if (n < min || n > max) return { ok: false as const, error: `Giá trị phải trong khoảng ${min}–${max} ${unit}` };
  return { ok: true as const, value: n };
};

/** 6 tham số sạc */
export const chargingParamDefs: ParamDef[] = [
  { key: 'lowBatteryThreshold', label: 'Ngưỡng pin cạn cấp bách', format: (p) => `${p.lowBatteryThreshold}%`, parse: (r) => int(r, 0, 100, '%') },
  { key: 'targetBattery', label: 'Ngưỡng pin mục tiêu khả dụng', format: (p) => `${p.targetBattery}%`, parse: (r) => int(r, 0, 100, '%') },
  {
    key: 'sharedRatio',
    label: 'Tỷ lệ ưu tiên xe dùng chung',
    format: (p) => p.sharedRatio,
    parse: (r) => (/^\d+:\d+$/.test(r.trim()) ? { ok: true, value: r.trim() } : { ok: false, error: 'Nhập theo dạng a:b, ví dụ 40:60' }),
  },
  { key: 'bufferMinutes', label: 'Thời gian đệm', format: (p) => `${p.bufferMinutes} phút`, parse: (r) => int(r, 0, 240, 'phút') },
  {
    key: 'maxChargeMinutes',
    label: 'Thời lượng sạc tối đa',
    format: (p) => `${p.maxChargeMinutes / 60} giờ`,
    parse: (r) => {
      const h = int(r, 1, 24, 'giờ');
      return h.ok ? { ok: true, value: Number(h.value) * 60 } : h;
    },
  },
  { key: 'holdMinutes', label: 'Thời gian giữ chỗ sạc', format: (p) => `${p.holdMinutes} phút`, parse: (r) => int(r, 1, 120, 'phút') },
];

export function validateChargingParams(p: ChargingParams): string | null {
  for (const def of chargingParamDefs) {
    const raw = def.key === 'maxChargeMinutes' ? String(p.maxChargeMinutes / 60) : String(p[def.key]);
    const res = def.parse(raw);
    if (!res.ok) return `${def.label}: ${res.error}`;
  }
  return null;
}
