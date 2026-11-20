/**
 * Kiểu kết quả dùng chung cho mọi lời gọi qua API Gateway và các subsystem.
 *
 * - Thao tác thành công: `{ ok: true, message, ...dữ liệu }`
 * - Thao tác bị từ chối: `{ ok: false, message }` (message là lý do hiển thị cho người dùng)
 */
export interface OperationResult {
  ok: boolean;
  message: string;
}

export type ApiResult<T = unknown> = ({ ok: true; message: string } & T) | { ok: false; message: string };
