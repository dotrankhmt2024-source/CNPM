/**
 * Lắp ghép các component nghiệp vụ cho backend — dùng lại nguyên các service
 * trong `src/subsystems` nhờ chúng không phụ thuộc React.
 *
 * Chỉ thay đổi duy nhất: `IPersistence` không còn ghi vào localStorage mà ghi
 * vào SQLite (bảng `app_state`).
 */
import type { AppData } from '@/shared/types/domain';
import type { User } from '@/shared/types/auth';
import type { IAuth, IDataSource, IPersistence } from '@/contracts';
import { NotificationService } from '@/subsystems/access-identity/NotificationService';
import { BookingService } from '@/subsystems/mobility/BookingService';
import { ParkingChargingService } from '@/subsystems/mobility/ParkingChargingService';
import { RedirectionService } from '@/subsystems/mobility/RedirectionService';
import { DispatchService } from '@/subsystems/network-operations/DispatchService';
import { MonitoringService } from '@/subsystems/network-operations/MonitoringService';
import { SchedulingService } from '@/subsystems/network-operations/SchedulingService';
import { SimulationEngine } from '@/subsystems/network-operations/SimulationEngine';
import { SimulationClock } from '@/subsystems/platform-integration/clock/SimulationClock';
import { Persistence } from '@/subsystems/platform-integration/persistence/Persistence';
import { IotConnector, SensorAdaptor } from '@/subsystems/platform-integration/sensor/SensorAdaptor';
import { loadState, resetState, saveState } from './db';

/** IDataSource trên SQLite: mỗi lần ghi là cập nhật cả ảnh chụp AppData. */
export class SqliteDataSource implements IDataSource {
  read(): AppData {
    return loadState();
  }

  write(patch: Partial<AppData>): void {
    saveState({ ...loadState(), ...patch });
  }

  replaceAll(data: AppData): void {
    saveState(data);
  }

  subscribe(): () => void {
    // Server không cần cơ chế "theo dõi thay đổi"; client tự gọi GET /api/state.
    return () => undefined;
  }
}

/** IAuth theo từng request: chỉ trả về người đang đăng nhập, không xử lý đăng nhập. */
class RequestAuth implements IAuth {
  constructor(private readonly user: User | null) {}
  currentUser(): User | null {
    return this.user;
  }
  login(): never {
    throw new Error('Đăng nhập được xử lý ở route /api/auth/login');
  }
  register(): never {
    throw new Error('Đăng ký được xử lý ở route /api/auth/register');
  }
  logout(): void {
    /* route /api/auth/logout xử lý */
  }
  resetDemo(): void {
    /* route /api/reset xử lý */
  }
}

export function createServices(user: User | null) {
  const dataSource = new SqliteDataSource();
  const persistence: IPersistence = new Persistence(dataSource);
  const auth = new RequestAuth(user);
  const notification = new NotificationService();
  const clock = new SimulationClock(persistence);
  const sensors = new SensorAdaptor(new IotConnector(dataSource));

  const scheduling = new SchedulingService(persistence, clock);
  const booking = new BookingService(persistence, notification, auth);
  const parkingCharging = new ParkingChargingService(persistence, notification, scheduling, auth);
  const redirection = new RedirectionService(persistence, auth, notification, clock);
  const monitoring = new MonitoringService(persistence, sensors, notification);
  const dispatch = new DispatchService(persistence, auth, clock);
  const simulation = new SimulationEngine(persistence);

  return {
    persistence,
    auth,
    clock,
    scheduling,
    booking,
    parkingCharging,
    redirection,
    monitoring,
    dispatch,
    simulation,
  };
}

export type ServerServices = ReturnType<typeof createServices>;

/** Khôi phục dữ liệu demo trên server. */
export function resetDemoData(): void {
  resetState();
}
