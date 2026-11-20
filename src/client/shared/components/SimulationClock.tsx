import { App as AntApp, Button, Popover } from 'antd';
import { Clock3 } from 'lucide-react';
import { useState } from 'react';
import { formatHm } from '@/shared/clock';
import { useSimNow } from '@/client/shared/hooks/useSimulationClock';
import { useAppStore } from '@/client/api/useAppStore';

/**
 * Đồng hồ mô phỏng: hiển thị giờ hệ thống và cho phép "tua nhanh" khi demo
 * (xem lịch sạc quá hạn, xe sạc đầy, xe điều phối tới nơi mà không phải chờ thật).
 */
export function SimulationClock() {
  const { message } = AntApp.useApp();
  const now = useSimNow();
  const offset = useAppStore((state) => state.clockOffsetMinutes ?? 0);
  const advanceClock = useAppStore((state) => state.advanceClock);
  const resetClock = useAppStore((state) => state.resetClock);
  const [open, setOpen] = useState(false);

  const advance = (minutes: number) => {
    const events = advanceClock(minutes);
    message.info(events.length ? events.join(' ') : `Đã tua nhanh ${minutes} phút.`);
  };

  const content = (
    <div className="w-[240px] space-y-3">
      <p className="muted-13">
        Tua nhanh thời gian để xem các sự kiện tự động: hết hạn giữ chỗ, sạc đầy, xe tới Hub đích.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Button size="small" onClick={() => advance(5)}>+5′</Button>
        <Button size="small" onClick={() => advance(15)}>+15′</Button>
        <Button size="small" onClick={() => advance(60)}>+1 giờ</Button>
      </div>
      <Button
        size="small"
        block
        disabled={offset === 0}
        onClick={() => {
          resetClock();
          message.success('Đã trở về giờ thực.');
        }}
      >
        Về giờ thực
      </Button>
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottomRight" title="Đồng hồ mô phỏng" content={content}>
      <button
        type="button"
        className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-left shadow-sm transition hover:shadow dark:border-slate-800 dark:bg-slate-900"
      >
        <Clock3 size={16} className="text-[#176B5B]" />
        <span>
          <span className="block text-[13px] font-semibold leading-tight text-ink dark:text-slate-100">
            {formatHm(now)}
          </span>
          <span className="block text-[11px] text-muted dark:text-slate-400">
            {offset === 0 ? 'Giờ hệ thống' : `Mô phỏng +${offset} phút`}
          </span>
        </span>
      </button>
    </Popover>
  );
}
