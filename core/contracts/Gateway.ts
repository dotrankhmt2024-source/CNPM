/**
 * Hợp đồng của APIGateway — cửa ngõ duy nhất mà Client Subsystem được phép gọi.
 *
 * Client không biết subsystem nào xử lý nghiệp vụ: mỗi lời gọi đi qua
 * StudentAPI / OperatorAPI / AccessAPI / SystemAPI rồi mới được gateway định tuyến
 * tới component nghiệp vụ tương ứng.
 */
import type {
  AppData,
  Booking,
  ChargingBooking,
  ChargingConfig,
  ChargingEndReason,
  ChargingRequest,
  DispatchOrder,
  DispatchStaff,
  Hub,
  HubStatus,
  Incident,
  ParkingReservation,
  ParkingSlot,
  RedirectOffer,
  RedirectPlan,
  Vehicle,
} from '@/shared/types/domain';
import type { AuthResult, LoginCredentials, RegisterData, User } from '@/shared/types/auth';
import type { AppNotification, AccountState, UserSettings } from './AccessIdentity';
import type { ApiResult, OperationResult } from './common';
import type {
  ChargingOverflowInfo,
  ChargingReservationRequest,
  ChargingSlotRequest,
  ChargingState,
  DemandProjection,
  DispatchSuggestion,
  FreeChargingPort,
  HubHealth,
  RankedChargingRequest,
  ScenarioParams,
} from './NetworkOperations';
import type { AlternativeHub, OverloadRisk } from './Mobility';
import type {
  ChargingSlotState,
  ParkingBookingInput,
  VehicleBookingInput,
} from './Mobility';

/** Cổng dành cho StudentWebClient. */
export interface StudentAPI {
  searchHubs(keyword?: string): Hub[];
  hubDetail(hubId: string): Hub | null;
  availableVehicles(hubId?: string): Vehicle[];
  parkingSlots(hubId: string): ParkingSlot[];
  /** Trạng thái các cổng sạc của Hub trong khung giờ muốn đặt. */
  chargingSlots(hubId: string, dateKey: string, startTime: string, durationMinutes: number): ChargingSlotState[];
  myBookings(): Booking[];
  myParkingReservations(): ParkingReservation[];
  myChargingBookings(): ChargingBooking[];
  pendingOffers(): RedirectOffer[];
  notifications(): AppNotification[];

  reserveVehicle(input: VehicleBookingInput): ApiResult<{ booking?: Booking }>;
  pickupVehicle(bookingId: string, code: string): OperationResult;
  returnVehicle(bookingId: string, code: string): ApiResult<{ durationMinutes?: number }>;
  cancelBooking(bookingId: string): OperationResult;

  bookParking(input: ParkingBookingInput): ApiResult<{ reservation?: ParkingReservation }>;
  cancelParking(reservationId: string): OperationResult;
  /** Nhập mã lấy chỗ đỗ / trả chỗ đỗ. */
  checkInParking(code: string): OperationResult;
  checkOutParking(code: string): OperationResult;
  /** Nhập mã lấy chỗ sạc / trả chỗ sạc. */
  checkInChargingSlot(code: string): OperationResult;
  checkOutChargingSlot(code: string): OperationResult;
  bookChargingSlot(input: ChargingSlotRequest): ApiResult<{ booking?: ChargingBooking }>;
  cancelChargingSlot(bookingId: string): OperationResult;

  respondToOffer(offerId: string, accept: boolean): ApiResult<{ moved?: boolean; warning?: string }>;
  /** Phản hồi gợi ý chung (phương án đang hiệu lực) khi sinh viên chưa có lịch đặt. */
  respondToGeneralNotice(planId: string, accept: boolean): ApiResult<{ warning?: string }>;
}

/** Cổng dành cho OperatorWebConsole. */
export interface OperatorAPI {
  hubs(): Hub[];
  vehicles(hubId?: string): Vehicle[];
  incidents(): Incident[];
  hubHealth(): HubHealth[];
  chargingQueue(): ChargingRequest[];
  /** Ảnh chụp dữ liệu sạc để màn hình lập lịch hiển thị. */
  chargingState(): ChargingState;
  priorityQueue(hubId: string): RankedChargingRequest[];
  freePorts(hubId: string): FreeChargingPort[];
  chargingOverflow(hubId: string): ChargingOverflowInfo;
  dispatchOrders(): DispatchOrder[];
  dispatchStaff(): DispatchStaff[];
  overloadedHubs(): OverloadRisk[];
  alternativeHubs(hubId: string, radiusKm: number | null): AlternativeHub[];
  simulation(input: ScenarioParams): DemandProjection[];

  updateHubStatus(hubId: string, status: HubStatus): OperationResult;
  resolveIncident(incidentId: string): OperationResult;

  createDispatchOrder(input: {
    sourceHubId: string;
    destHubId: string;
    quantity: number;
    vehicleIds?: string[];
    staffId?: string;
    note?: string;
  }): ApiResult<{ order?: DispatchOrder; warning?: string | null }>;
  assignDispatchStaff(orderId: string, staffId: string): OperationResult;
  startDispatchTransport(orderId: string): OperationResult;
  completeDispatchOrder(orderId: string): OperationResult;
  cancelDispatchOrder(orderId: string, reason: string): OperationResult;
  suggestRebalancing(): DispatchSuggestion[];

  approveRedirectionPlan(input: {
    overloadedHubId: string;
    targetHubId: string;
    note?: string;
  }): ApiResult<{ plan?: RedirectPlan; offerCount?: number }>;
  closeRedirectionPlan(planId: string): OperationResult;

  createSmartChargingSchedule(hubId: string): ApiResult<{ allocated?: number; overflow?: number }>;
  allocateChargingPower(hubId: string): OperationResult & { allocated?: number; overflow?: number };
  requestCharging(
    vehicleId: string,
    options?: { source?: 'student' | 'operator'; targetBattery?: number; neededBy?: string; note?: string },
  ): OperationResult;
  cancelChargingRequest(requestId: string): OperationResult;
  setPortMaintenance(portId: string, underMaintenance: boolean): OperationResult;
  updateChargingConfig(patch: Partial<ChargingConfig>): OperationResult;
  completeChargingSession(sessionId: string, reason?: ChargingEndReason): OperationResult;
  checkInCharging(code: string, studentId?: string): OperationResult;
  /** Lịch sạc do nhà điều hành tạo hộ sinh viên (màn hình lịch sạc). */
  createChargingReservation(input: ChargingReservationRequest): ApiResult<{ reservation?: ChargingBooking }>;
  cancelChargingReservation(reservationId: string): OperationResult;
}

/** Cổng của Access & Identify (dùng chung cho cả hai client). */
export interface AccessAPI {
  currentUser(): User | null;
  login(credentials: LoginCredentials, options?: { remember?: boolean }): AuthResult;
  register(data: RegisterData): AuthResult;
  logout(): void;
  resetDemo(): void;
  settings(userId: string): UserSettings;
  updateSettings(userId: string, patch: Partial<Omit<UserSettings, 'userId'>>): OperationResult;
  notifications(): AppNotification[];
  markNotificationsRead(): void;
  /** Read model phiên đăng nhập cho Client (store phía giao diện đồng bộ theo đây). */
  sessionSnapshot(): AccountState;
  subscribeSession(listener: (state: AccountState) => void): () => void;
}

/** Cổng điều khiển hệ thống: đồng hồ mô phỏng, tick nền và khôi phục dữ liệu demo. */
export interface SystemAPI {
  now(): number;
  advanceClock(minutes: number): string[];
  resetClock(): void;
  tickCharging(): string[];
  resetDemoData(): void;
  /** Read model dữ liệu vận hành cho Client (store phía giao diện đồng bộ theo đây). */
  snapshot(): AppData;
  subscribeData(listener: (data: AppData) => void): () => void;
}

export interface IAPIGateway {
  readonly student: StudentAPI;
  readonly operator: OperatorAPI;
  readonly access: AccessAPI;
  readonly system: SystemAPI;
}
