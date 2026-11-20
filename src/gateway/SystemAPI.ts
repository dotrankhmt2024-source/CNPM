/**
 * SystemAPI — các thao tác điều khiển hệ thống dùng chung cho cả hai client:
 * tua đồng hồ mô phỏng, chạy nhịp xử lý nền của lịch sạc và khôi phục dữ liệu demo.
 */
import type { SystemAPI } from '@/contracts/Gateway';
import type { AppData } from '@/shared/types/domain';
import type { GatewayDeps } from './APIGateway';

export class SystemAPIImpl implements SystemAPI {
  constructor(private readonly deps: GatewayDeps) {}

  now(): number {
    return this.deps.clock.now();
  }

  advanceClock(minutes: number): string[] {
    return this.deps.scheduling.advanceClock(minutes);
  }

  resetClock(): void {
    this.deps.scheduling.resetClock();
  }

  tickCharging(): string[] {
    const events = this.deps.scheduling.tick();
    // Giải phóng chỗ đỗ quá khung giờ để không chặn lượt đặt mới tại cùng Hub.
    this.deps.parkingCharging.expireOverdue(this.deps.clock.now());
    return events;
  }

  resetDemoData(): void {
    this.deps.persistence.reset();
    this.deps.notification.clear();
  }

  snapshot(): AppData {
    return this.deps.persistence.load();
  }

  subscribeData(listener: (data: AppData) => void): () => void {
    return this.deps.persistence.subscribe(listener);
  }
}
