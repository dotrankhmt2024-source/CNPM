/**
 * Tính toán thuần trên phiên sạc (shared kernel).
 *
 * Dùng chung cho component nghiệp vụ (SchedulingService) và giao diện (hiển thị
 * tiến độ pin) mà không tạo phụ thuộc Client → Subsystem.
 */
import type { ChargingSession } from '@/shared/types/domain';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Mức pin hiện tại của phiên sạc (nội suy tuyến tính theo thời gian). */
export function sessionBatteryAt(session: ChargingSession, now: number): number {
  if (session.status === 'COMPLETED') return session.endBattery ?? session.targetBattery;
  const start = new Date(session.startedAt).getTime();
  const full = new Date(session.expectedFullAt).getTime();
  if (full <= start) return session.targetBattery;
  const progress = clamp((now - start) / (full - start), 0, 1);
  return round1(session.startBattery + (session.targetBattery - session.startBattery) * progress);
}

export const sessionEnergyAt = (session: ChargingSession, now: number): number =>
  round2((session.batteryCapacityKwh * Math.max(0, sessionBatteryAt(session, now) - session.startBattery)) / 100);
