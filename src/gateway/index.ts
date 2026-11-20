/**
 * Điểm khởi tạo (composition root) của toàn hệ thống phía trình duyệt.
 *
 * Chỉ file này biết các lớp cài đặt cụ thể; phần còn lại của ứng dụng chỉ làm việc
 * với APIGateway và các interface trong `src/contracts`.
 *
 *   Client → APIGateway → { Access&Identify | Mobility | NetworkOperations } → Platform
 */
import { APIGateway } from './APIGateway';
import { AccountService } from '@/subsystems/access-identity/AccountService';
import { NotificationService } from '@/subsystems/access-identity/NotificationService';
import { BookingService } from '@/subsystems/mobility/BookingService';
import { ParkingChargingService } from '@/subsystems/mobility/ParkingChargingService';
import { RedirectionService } from '@/subsystems/mobility/RedirectionService';
import { DispatchService } from '@/subsystems/network-operations/DispatchService';
import { MonitoringService } from '@/subsystems/network-operations/MonitoringService';
import { SchedulingService } from '@/subsystems/network-operations/SchedulingService';
import { SimulationEngine } from '@/subsystems/network-operations/SimulationEngine';
import { SimulationClock } from '@/subsystems/platform-integration/clock/SimulationClock';
import { AccountDataSource } from '@/subsystems/platform-integration/datastore/AccountStore';
import { LocalDataSource } from '@/subsystems/platform-integration/datastore/DataStore';
import { Persistence } from '@/subsystems/platform-integration/persistence/Persistence';
import { IotConnector, SensorAdaptor } from '@/subsystems/platform-integration/sensor/SensorAdaptor';

/* ------------------------- Platform & Integration ------------------------ */
const dataSource = new LocalDataSource();
const persistence = new Persistence(dataSource);
const accounts = new AccountDataSource();
const clock = new SimulationClock(persistence);
const notification = new NotificationService();
const sensors = new SensorAdaptor(new IotConnector(dataSource));

/* --------------------------- Access & Identify --------------------------- */
const accountService = new AccountService(accounts, notification);

/* ------------------------------ Mobility -------------------------------- */
const scheduling = new SchedulingService(persistence, clock);
const booking = new BookingService(persistence, notification, accountService);
const parkingCharging = new ParkingChargingService(persistence, notification, scheduling, accountService);
const redirection = new RedirectionService(persistence, accountService, notification, clock);

/* --------------------------- NetworkOperations -------------------------- */
const monitoring = new MonitoringService(persistence, sensors, notification);
const dispatch = new DispatchService(persistence, accountService, clock);
const simulation = new SimulationEngine(persistence);

export const apiGateway = new APIGateway({
  persistence,
  accounts,
  auth: accountService,
  settings: accountService,
  notification,
  sensors,
  clock,
  booking,
  parkingCharging,
  redirection,
  monitoring,
  dispatch,
  scheduling,
  simulation,
});

export default apiGateway;
