/**
 * SimulationClock — cài đặt IClock trên "độ lệch đồng hồ" lưu trong dữ liệu hệ thống.
 *
 * Giờ mô phỏng = giờ thật + clockOffsetMinutes, nhờ vậy khi demo có thể tua nhanh
 * (ví dụ +15 phút để thấy lịch sạc quá hạn hoặc xe sạc đầy) mà không cần chờ.
 */
import type { IClock, IPersistence } from '@/contracts/Platform';
import { simulatedNow } from '@/shared/clock';

export class SimulationClock implements IClock {
  constructor(private readonly persistence: IPersistence) {}

  offsetMinutes(): number {
    return this.persistence.load().clockOffsetMinutes ?? 0;
  }

  now(): number {
    return simulatedNow(this.offsetMinutes());
  }

  advance(minutes: number): void {
    this.persistence.save({ clockOffsetMinutes: this.offsetMinutes() + minutes });
  }

  reset(): void {
    this.persistence.save({ clockOffsetMinutes: 0 });
  }
}
