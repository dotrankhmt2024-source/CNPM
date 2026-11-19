import type { AppData } from '../types/domain';
import { freeSlots, vehicleCount } from './HubService';

export type DispatchPlan = { ok: true } | { ok: false; message: string };

/**
 * Kiểm tra một lệnh điều phối xe có hợp lệ không (không thay đổi dữ liệu).
 * Thứ tự kiểm tra: chọn Hub → số lượng → sức chứa Hub đích → số xe Hub nguồn.
 */
export function planDispatch(
  data: Pick<AppData, 'hubs'>,
  sourceHubId: string,
  destHubId: string,
  quantity: number,
): DispatchPlan {
  const src = data.hubs.find((h) => h.id === sourceHubId);
  const dest = data.hubs.find((h) => h.id === destHubId);
  if (!src || !dest) return { ok: false, message: 'Vui lòng chọn Hub nguồn và Hub đích' };
  if (src.id === dest.id) return { ok: false, message: 'Hub nguồn và Hub đích phải khác nhau' };
  if (!Number.isInteger(quantity) || quantity < 1) return { ok: false, message: 'Số lượng xe phải là số nguyên ≥ 1' };
  if (dest.maintenance) return { ok: false, message: 'Hub đích đang bảo trì' };
  if (quantity > freeSlots(dest)) return { ok: false, message: 'Hub đích không đủ sức chứa' };
  if (quantity > vehicleCount(src)) return { ok: false, message: 'Hub nguồn không đủ xe khả dụng' };
  return { ok: true };
}
