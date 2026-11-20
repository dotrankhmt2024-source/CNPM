/** Nhãn, màu sắc và thành phần hiển thị dùng chung cho các màn hình sạc. */
import type { ReactNode } from 'react';
import { Progress, Tooltip } from 'antd';
import type {
  ChargingEndReason,
  ChargePointStatus,
  ChargingRequestSource,
  ChargingBookingStatus,
  ChargingSession,
} from '../../types/domain';
import type { PriorityBreakdown } from '../../services/chargingScheduler';
import { sessionBatteryAt, sessionEnergyAt } from '../../services/chargingScheduler';
import { formatDuration, formatHm, formatMoney, MINUTE } from '../../services/clock';

export const PORT_STATUS_LABEL: Record<ChargePointStatus | 'incompatible', string> = {
  free: 'Trống',
  reserved: 'Đã đặt',
  used: 'Đang sạc',
  full: 'Đã đầy · chờ rút',
  maintenance: 'Bảo trì',
  incompatible: 'Không tương thích',
};

export const PORT_STATUS_STYLE: Record<ChargePointStatus | 'incompatible', string> = {
  free: 'border-[#176B5B] bg-[#EAF7EF] text-[#176B5B] dark:bg-emerald-500/10 dark:text-emerald-300',
  reserved: 'border-[#9DB8F5] bg-[#EEF4FF] text-[#2563EB] dark:bg-blue-500/10 dark:text-blue-300',
  used: 'border-[#E2BF8A] bg-[#FDF4E5] text-[#9A6B1F] dark:bg-amber-500/10 dark:text-amber-300',
  full: 'border-[#C4B5FD] bg-[#F5F3FF] text-[#6D28D9] dark:bg-violet-500/10 dark:text-violet-300',
  maintenance: 'border-[#F5A3A3] bg-[#FDECEC] text-[#C0392B] dark:bg-red-500/10 dark:text-red-300',
  incompatible: 'border-line bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900',
};

export const RESERVATION_STATUS: Record<ChargingBookingStatus, { label: string; className: string }> = {
  CONFIRMED: { label: 'Đã giữ chỗ', className: 'pill-blue' },
  CHECKED_IN: { label: 'Đang sạc', className: 'pill-orange' },
  COMPLETED: { label: 'Hoàn tất', className: 'pill-green' },
  CANCELLED: {
    label: 'Đã hủy',
    className: 'rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
  EXPIRED: {
    label: 'Bỏ chỗ (quá hạn)',
    className: 'rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-300',
  },
};

export const END_REASON_LABEL: Record<ChargingEndReason, string> = {
  full: 'Sạc đầy',
  user_stop: 'Người dùng dừng',
  operator_stop: 'Operator kết thúc',
  preempted: 'Nhường cổng cho lịch đặt',
  max_duration: 'Quá thời lượng tối đa',
  port_fault: 'Cổng bảo trì',
};

export const SOURCE_LABEL: Record<ChargingRequestSource, string> = {
  auto: 'Tự động (pin thấp)',
  student: 'Sinh viên yêu cầu',
  operator: 'Operator thêm',
};

export const BREAKDOWN_LABEL: Record<keyof PriorityBreakdown, string> = {
  battery: 'Mức pin thấp',
  critical: 'Pin nguy cấp',
  upcoming: 'Sắp có chuyến đi',
  shared: 'Xe dùng chung',
  waiting: 'Thời gian chờ',
};

/** Điểm ưu tiên kèm tooltip giải thích từng thành phần. */
export function PriorityScore({ score, breakdown }: { score: number; breakdown: PriorityBreakdown }) {
  const tone = score >= 70 ? 'bg-red-50 text-red-600' : score >= 45 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600';
  return (
    <Tooltip
      title={
        <div className="space-y-0.5 text-[12px]">
          {(Object.keys(breakdown) as (keyof PriorityBreakdown)[]).map((key) => (
            <div key={key} className="flex justify-between gap-6">
              <span>{BREAKDOWN_LABEL[key]}</span>
              <b>+{breakdown[key]}</b>
            </div>
          ))}
        </div>
      }
    >
      <span className={`cursor-help rounded-full px-2.5 py-1 text-[12px] font-bold ${tone} dark:bg-slate-800 dark:text-slate-200`}>
        {score}
      </span>
    </Tooltip>
  );
}

/** Thanh pin nhỏ. */
export function BatteryPill({ value }: { value: number }) {
  const color = value <= 15 ? 'text-red-600' : value <= 30 ? 'text-amber-600' : 'text-[#18794E]';
  return <span className={`text-[13px] font-semibold ${color}`}>Pin {Math.round(value)}%</span>;
}

/** Tiến độ phiên sạc theo thời gian thực. */
export function SessionProgress({ session, now, compact = false }: { session: ChargingSession; now: number; compact?: boolean }) {
  const battery = sessionBatteryAt(session, now);
  const energy = sessionEnergyAt(session, now);
  const remaining = Math.max(0, (new Date(session.expectedFullAt).getTime() - now) / MINUTE);
  const deadline = session.mustEndBy ? new Date(session.mustEndBy).getTime() : null;
  const cutBeforeFull = deadline !== null && deadline < new Date(session.expectedFullAt).getTime();
  return (
    <div>
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-semibold text-ink dark:text-slate-100">
          {Math.round(session.startBattery)}% → {Math.round(battery)}%
          <span className="font-normal text-muted"> / {session.targetBattery}%</span>
        </span>
        <span className="text-muted dark:text-slate-400">{energy} kWh</span>
      </div>
      <Progress
        percent={Math.round(battery)}
        success={{ percent: Math.round(session.startBattery) }}
        showInfo={false}
        size="small"
        status={session.status === 'FULL' ? 'success' : 'active'}
      />
      {!compact && (
        <p className="muted-13">
          {session.status === 'FULL'
            ? `Đã đạt mức mục tiêu lúc ${formatHm(session.fullAt ?? session.expectedFullAt)} — chờ rút sạc.`
            : `Còn khoảng ${formatDuration(remaining)} · ${session.powerKw} kW`}
          {cutBeforeFull && session.status !== 'FULL' && (
            <span className="text-amber-600"> · phải nhường cổng lúc {formatHm(deadline!)}</span>
          )}
        </p>
      )}
    </div>
  );
}

/** Ô thông tin dạng nhãn / giá trị trong hộp thoại nền tối. */
export function DarkField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-[#AFC1D4]">{label}</dt>
      <dd className="mt-0.5 text-[14px] font-semibold">{children}</dd>
    </div>
  );
}

export const money = formatMoney;
