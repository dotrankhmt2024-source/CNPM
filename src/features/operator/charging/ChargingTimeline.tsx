import { Tooltip } from 'antd';
import type { ChargePoint, ChargingBooking, ChargingSession } from '../../../types/domain';
import { MINUTE, atLocalTime, formatHm } from '../../../services/clock';
import { sessionBatteryAt } from '../../../services/chargingScheduler';

interface Props {
  ports: ChargePoint[];
  reservations: ChargingBooking[];
  sessions: ChargingSession[];
  dateKey: string;
  openHour: number;
  closeHour: number;
  slotMinutes: number;
  now: number;
}

const BAR_STYLE = {
  CONFIRMED: 'bg-[#EEF4FF] border-[#9DB8F5] text-[#1D4ED8]',
  EXPIRED: 'bg-red-50 border-red-200 text-red-500 line-through',
  CHARGING: 'bg-[#FDF4E5] border-[#E2BF8A] text-[#9A6B1F]',
  FULL: 'bg-[#F5F3FF] border-[#C4B5FD] text-[#6D28D9]',
  COMPLETED: 'bg-[#EAF7EF] border-[#9FD3B5] text-[#18794E]',
} as const;

const COLUMN_WIDTH = 46;

/** Lịch sạc theo khung giờ trong ngày: mỗi hàng là một cổng, mỗi ô là một khung giờ. */
export function ChargingTimeline({ ports, reservations, sessions, dateKey, openHour, closeHour, slotMinutes, now }: Props) {
  const dayStart = atLocalTime(dateKey, `${String(openHour).padStart(2, '0')}:00`);
  const dayEnd = atLocalTime(dateKey, `${String(closeHour).padStart(2, '0')}:00`);
  const span = dayEnd - dayStart;
  const columns = Math.round(span / (slotMinutes * MINUTE));
  const width = columns * COLUMN_WIDTH;
  const pos = (time: number) => ((Math.min(Math.max(time, dayStart), dayEnd) - dayStart) / span) * width;
  const nowVisible = now >= dayStart && now <= dayEnd;

  type Bar = { key: string; start: number; end: number; style: keyof typeof BAR_STYLE; title: string; detail: string };
  const barsFor = (port: ChargePoint): Bar[] => {
    const bars: Bar[] = [];
    reservations
      .filter((item) => item.portId === port.id && (item.status === 'CONFIRMED' || item.status === 'EXPIRED'))
      .forEach((item) =>
        bars.push({
          key: item.id,
          start: Date.parse(item.startAt),
          end: Date.parse(item.endAt),
          style: item.status === 'EXPIRED' ? 'EXPIRED' : 'CONFIRMED',
          title: item.vehicleLabel.split(' · ')[0],
          detail: `${item.status === 'EXPIRED' ? 'Bỏ chỗ' : 'Đã đặt'} · ${item.studentName} · ${item.code} · pin ${item.currentBattery}%→${item.targetBattery}%`,
        }),
      );
    sessions
      .filter((item) => item.portId === port.id)
      .forEach((item) => {
        const end = item.endedAt
          ? Date.parse(item.endedAt)
          : Math.max(now, Math.min(Date.parse(item.expectedFullAt), item.mustEndBy ? Date.parse(item.mustEndBy) : Infinity));
        bars.push({
          key: item.id,
          start: Date.parse(item.startedAt),
          end,
          style: item.status,
          title: item.vehicleLabel.split(' · ')[0],
          detail: `${item.status === 'COMPLETED' ? 'Đã sạc' : item.status === 'FULL' ? 'Đã đầy' : 'Đang sạc'} · ${item.ownerName} · pin ${Math.round(
            item.startBattery,
          )}%→${Math.round(sessionBatteryAt(item, now))}%`,
        });
      });
    return bars.filter((bar) => bar.end > dayStart && bar.start < dayEnd);
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-line dark:border-slate-800">
      <div style={{ width: width + 96 }} className="relative">
        {/* Header */}
        <div className="sticky top-0 z-10 flex border-b border-line bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
          <div className="w-24 shrink-0 px-3 py-2 text-[12px] font-semibold text-muted">Cổng</div>
          {Array.from({ length: columns }, (_, index) => {
            const time = dayStart + index * slotMinutes * MINUTE;
            return (
              <div
                key={index}
                style={{ width: COLUMN_WIDTH }}
                className="shrink-0 border-l border-line py-2 text-center text-[11px] text-muted dark:border-slate-800"
              >
                {new Date(time).getMinutes() === 0 ? formatHm(time) : ''}
              </div>
            );
          })}
        </div>

        {ports.map((port) => (
          <div key={port.id} className="flex border-b border-line last:border-b-0 dark:border-slate-800">
            <div className="w-24 shrink-0 px-3 py-2">
              <p className="text-[13px] font-semibold text-ink dark:text-slate-100">{port.code}</p>
              <p className="text-[10px] text-muted">
                {port.underMaintenance ? 'Bảo trì' : `${port.connector} ${port.power}kW`}
              </p>
            </div>
            <div
              className={`relative h-12 ${port.underMaintenance ? 'bg-[repeating-linear-gradient(45deg,#fdecec,#fdecec_6px,#fff_6px,#fff_12px)] dark:opacity-40' : ''}`}
              style={{ width }}
            >
              {Array.from({ length: columns }, (_, index) => (
                <div
                  key={index}
                  className="absolute inset-y-0 border-l border-dashed border-line/70 dark:border-slate-800"
                  style={{ left: index * COLUMN_WIDTH }}
                />
              ))}
              {barsFor(port).map((bar) => (
                <Tooltip key={bar.key} title={`${formatHm(bar.start)}–${formatHm(bar.end)} · ${bar.detail}`}>
                  <div
                    className={`absolute top-2 h-8 cursor-default overflow-hidden truncate rounded-md border px-1.5 text-[11px] font-semibold leading-8 ${BAR_STYLE[bar.style]}`}
                    style={{ left: pos(bar.start), width: Math.max(8, pos(bar.end) - pos(bar.start)) }}
                  >
                    {bar.title}
                  </div>
                </Tooltip>
              ))}
            </div>
          </div>
        ))}

        {nowVisible && (
          <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-red-500" style={{ left: 96 + pos(now) }}>
            <span className="absolute bottom-1 left-1 rounded bg-red-500 px-1 text-[10px] font-semibold text-white">
              {formatHm(now)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function TimelineLegend() {
  const items: [keyof typeof BAR_STYLE, string][] = [
    ['CONFIRMED', 'Đã đặt lịch'],
    ['CHARGING', 'Đang sạc'],
    ['FULL', 'Đã đầy, chờ rút'],
    ['COMPLETED', 'Đã sạc xong'],
    ['EXPIRED', 'Bỏ chỗ'],
  ];
  return (
    <div className="flex flex-wrap gap-3">
      {items.map(([key, label]) => (
        <span key={key} className="flex items-center gap-1.5 text-[12px] text-muted">
          <span className={`inline-block h-3 w-5 rounded border ${BAR_STYLE[key]}`} />
          {label}
        </span>
      ))}
    </div>
  );
}
