/**
 * Tiện ích thời gian dùng chung cho phân hệ sạc & điều phối.
 * Hệ thống dùng "đồng hồ mô phỏng" = giờ thật + clockOffsetMinutes để khi demo
 * có thể tua nhanh (ví dụ +15 phút để thấy lịch sạc quá hạn, xe sạc đầy, xe tới Hub).
 */

export const MINUTE = 60_000;

export const simulatedNow = (offsetMinutes: number, realNow = Date.now()) =>
  realNow + offsetMinutes * MINUTE;

export const addMinutes = (time: number | string, minutes: number) =>
  new Date(new Date(time).getTime() + minutes * MINUTE).toISOString();

export const minutesBetween = (from: number | string, to: number | string) =>
  (new Date(to).getTime() - new Date(from).getTime()) / MINUTE;

const pad = (value: number) => String(value).padStart(2, '0');

/** Khóa ngày theo giờ địa phương: YYYY-MM-DD. */
export const toDateKey = (time: number | string | Date) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Ghép ngày (YYYY-MM-DD) và giờ (HH:mm) theo giờ địa phương thành epoch ms. */
export const atLocalTime = (dateKey: string, hhmm: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
};

export const formatHm = (time: number | string) => {
  const date = new Date(time);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const formatDateTime = (time: number | string) =>
  new Date(time).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });

export const formatDayLabel = (dateKey: string) =>
  new Date(atLocalTime(dateKey, '00:00')).toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

/** "45 phút", "1 giờ 20 phút". */
export const formatDuration = (minutes: number) => {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} phút`;
  return rest === 0 ? `${hours} giờ` : `${hours} giờ ${rest} phút`;
};

export const formatMoney = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} đ`;
