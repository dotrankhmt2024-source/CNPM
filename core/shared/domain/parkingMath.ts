/**
 * Đồng bộ giữa sơ đồ bãi đỗ (từng vị trí) và bộ đếm `hub.occupiedParking`.
 *
 * `occupiedParking` là số vị trí **không còn dùng được** = đang dùng + đã giữ chỗ +
 * đang bảo trì. Nhờ vậy `capacity − occupiedParking` luôn đúng bằng số ô xanh mà
 * sinh viên đếm được trên sơ đồ.
 */
import type { ParkingSlot } from '@/shared/types/domain';

/** Một vị trí đang bị chiếm: đang dùng hoặc đã được giữ chỗ. */
export const isOccupiedSlot = (slot: ParkingSlot) => slot.status === 'used' || slot.status === 'reserved';

/** Số vị trí không còn trống (đang dùng, đã giữ chỗ, đang bảo trì). */
export const countUnavailableSlots = (slots: ParkingSlot[], hubId: string) =>
  slots.filter((slot) => slot.hubId === hubId && slot.status !== 'free').length;

export const countFreeSlots = (slots: ParkingSlot[], hubId: string) =>
  slots.filter((slot) => slot.hubId === hubId && slot.status === 'free').length;

/** Đánh dấu `count` vị trí đang trống thành đang dùng (xe vào bãi). */
export function occupyFreeSlots(slots: ParkingSlot[], hubId: string, count: number): ParkingSlot[] {
  let remaining = count;
  return slots.map((slot) => {
    if (remaining <= 0 || slot.hubId !== hubId || slot.status !== 'free') return slot;
    remaining -= 1;
    return { ...slot, status: 'used' };
  });
}

/** Giải phóng `count` vị trí đang dùng (xe rời bãi). */
export function releaseUsedSlots(slots: ParkingSlot[], hubId: string, count: number): ParkingSlot[] {
  let remaining = count;
  return slots.map((slot) => {
    if (remaining <= 0 || slot.hubId !== hubId || slot.status !== 'used') return slot;
    remaining -= 1;
    return { ...slot, status: 'free' };
  });
}
