/**
 * Hợp đồng của subsystem Platform & Integration.
 *
 * Chuỗi phụ thuộc: component nghiệp vụ → IPersistence → IDataSource → DataStore.
 * Nhờ lớp đệm này, nghiệp vụ không biết dữ liệu đang nằm ở localStorage, IndexedDB
 * hay một API backend thật.
 */
import type { AppData } from '@/shared/types/domain';

/** Nguồn dữ liệu thật của hệ thống (trong bản demo là store trong bộ nhớ + localStorage). */
export interface IDataSource {
  read(): AppData;
  write(patch: Partial<AppData>): void;
  replaceAll(data: AppData): void;
  subscribe(listener: (data: AppData) => void): () => void;
}

/** Cổng truy cập dữ liệu mà các component nghiệp vụ được phép dùng. */
export interface IPersistence {
  load(): AppData;
  save(patch: Partial<AppData>): void;
  replaceAll(data: AppData): void;
  subscribe(listener: (data: AppData) => void): () => void;
  /** Khôi phục dữ liệu demo ban đầu. */
  reset(): void;
}

/** Đồng hồ mô phỏng: giờ thật + độ lệch để tua nhanh khi demo. */
export interface IClock {
  now(): number;
  offsetMinutes(): number;
  advance(minutes: number): void;
  reset(): void;
}

export type SensorKind = 'parking' | 'charger' | 'vehicle';
export type SensorStatus = 'ok' | 'warning' | 'fault';

/** Một số đo thiết bị do cảm biến / nguồn mô phỏng gửi về. */
export interface SensorReading {
  hubId: string;
  deviceId: string;
  kind: SensorKind;
  /** Giá trị đo: số chỗ đã dùng, số cổng đang cấp điện, số xe khả dụng… */
  value: number;
  status: SensorStatus;
  at: number;
}

/** Kết nối tới thiết bị IoT (hoặc bộ sinh dữ liệu mô phỏng thay thế). */
export interface IIoTConnector {
  stream(): SensorReading[];
  publish(reading: SensorReading): void;
  subscribe(listener: (readings: SensorReading[]) => void): () => void;
}

/** Cửa ngõ để các subsystem đọc trạng thái thiết bị mà không phụ thuộc nhà cung cấp cảm biến. */
export interface ISensorService {
  readings(hubId?: string): SensorReading[];
  subscribe(listener: (readings: SensorReading[]) => void): () => void;
}
