/**
 * APIGateway — điểm vào duy nhất của Client Subsystem.
 *
 * Gateway giữ tham chiếu tới các component nghiệp vụ (qua interface) và định tuyến
 * từng lời gọi tới đúng subsystem. Client không import trực tiếp service nào, nhờ vậy
 * có thể thay component (ví dụ đổi DispatchService) mà không sửa giao diện.
 */
import type { IAPIGateway } from '@/contracts/Gateway';
import type {
  IAccountStore,
  IAuth,
  IBooking,
  ICharging,
  IClock,
  IDispatch,
  IMonitoring,
  INotification,
  IParking,
  IPersistence,
  IRedirection,
  IScheduling,
  ISensorService,
  ISetting,
  ISimulation,
} from '@/contracts';
import { AccessAPIImpl } from './AccessAPI';
import { OperatorAPIImpl } from './OperatorAPI';
import { StudentAPIImpl } from './StudentAPI';
import { SystemAPIImpl } from './SystemAPI';

/** Các cổng mà gateway cần để chuyển tiếp yêu cầu tới subsystem tương ứng. */
export interface GatewayDeps {
  persistence: IPersistence;
  accounts: IAccountStore;
  auth: IAuth;
  settings: ISetting;
  notification: INotification;
  sensors: ISensorService;
  clock: IClock;
  booking: IBooking;
  parkingCharging: IParking & ICharging;
  redirection: IRedirection;
  monitoring: IMonitoring;
  dispatch: IDispatch;
  scheduling: IScheduling;
  simulation: ISimulation;
}

export class APIGateway implements IAPIGateway {
  readonly student;
  readonly operator;
  readonly access;
  readonly system;

  constructor(readonly deps: GatewayDeps) {
    this.student = new StudentAPIImpl(deps);
    this.operator = new OperatorAPIImpl(deps);
    this.access = new AccessAPIImpl(deps);
    this.system = new SystemAPIImpl(deps);
  }
}
