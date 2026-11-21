import { useEffect, useState } from 'react';
import { App as AntApp } from 'antd';
import { simulatedNow } from '@/shared/clock';
import { useAppStore } from '@/client/api/useAppStore';

/** Thời điểm hiện tại theo đồng hồ mô phỏng, tự cập nhật mỗi `intervalMs`. */
export function useSimNow(intervalMs = 1000) {
  const offset = useAppStore((state) => state.clockOffsetMinutes ?? 0);
  const [real, setReal] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setReal(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return simulatedNow(offset, real);
}

/**
 * Bộ chạy nền (gắn một lần trong AppShell): định kỳ xử lý lịch sạc quá hạn check-in,
 * phiên sạc phải nhường cổng, đánh dấu xe đã sạc đầy và thông báo sự kiện.
 */
export function useChargingTicker(intervalMs = 5000) {
  const tick = useAppStore((state) => state.tickCharging);
  const { notification } = AntApp.useApp();
  useEffect(() => {
    const run = async () => {
      const events = await tick();
      events.forEach((event) =>
        notification.info({ message: 'Lịch sạc', description: event, placement: 'bottomRight', duration: 6 }),
      );
    };
    void run();
    const timer = window.setInterval(() => void run(), intervalMs);
    return () => window.clearInterval(timer);
  }, [tick, notification, intervalMs]);
}

/**
 * Đồng bộ dữ liệu giữa các tab: tầng Platform (`DataStore`) đã lắng nghe sự kiện
 * `storage` và đẩy dữ liệu mới vào store của client, nên hook này chỉ cần giữ chỗ
 * để AppShell gọi mà không làm gì thêm.
 */
export function useCrossTabSync() {
  useEffect(() => undefined, []);
}
