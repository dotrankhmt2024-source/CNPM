/**
 * OperatorAPI — cổng dành cho OperatorWebConsole.
 *
 * Định tuyến: giám sát Hub/sự cố → NetworkOperations (IMonitoring); điều phối xe →
 * IDispatch; lập lịch sạc → IScheduling; điều hướng người dùng → IRedirection;
 * mô phỏng What-if → ISimulation.
 */
import type {
  ChargingBooking,
  ChargingConfig,
  ChargingEndReason,
  ChargingRequest,
  DispatchOrder,
  DispatchStaff,
  Hub,
  HubStatus,
  Incident,
  Vehicle,
} from '@/shared/types/domain';
import type { ApiResult, OperationResult } from '@/contracts/common';
import type {
  ChargingOverflowInfo,
  ChargingReservationRequest,
  ChargingState,
  DemandProjection,
  DispatchSuggestion,
  FreeChargingPort,
  HubHealth,
  RankedChargingRequest,
  ScenarioParams,
} from '@/contracts/NetworkOperations';
import type { AlternativeHub, OverloadRisk } from '@/contracts/Mobility';
import type { RedirectPlan } from '@/shared/types/domain';
import type { OperatorAPI } from '@/contracts/Gateway';
import type { GatewayDeps } from './APIGateway';

export class OperatorAPIImpl implements OperatorAPI {
  constructor(private readonly deps: GatewayDeps) {}

  /* ------------------------------- Tra cứu ------------------------------- */

  hubs(): Hub[] {
    return this.deps.monitoring.listHubs();
  }

  vehicles(hubId?: string): Vehicle[] {
    return this.deps.monitoring.vehicles(hubId);
  }

  incidents(): Incident[] {
    return this.deps.monitoring.incidents();
  }

  hubHealth(): HubHealth[] {
    return this.deps.monitoring.health();
  }

  chargingQueue(): ChargingRequest[] {
    return this.deps.scheduling.queue();
  }

  chargingState(): ChargingState {
    return this.deps.scheduling.bookingState();
  }

  priorityQueue(hubId: string): RankedChargingRequest[] {
    return this.deps.scheduling.priorityQueue(hubId);
  }

  freePorts(hubId: string): FreeChargingPort[] {
    return this.deps.scheduling.freePorts(hubId);
  }

  chargingOverflow(hubId: string): ChargingOverflowInfo {
    return this.deps.scheduling.queueOverflow(hubId);
  }

  dispatchOrders(): DispatchOrder[] {
    return this.deps.dispatch.list();
  }

  dispatchStaff(): DispatchStaff[] {
    return this.deps.dispatch.staff();
  }

  overloadedHubs(): OverloadRisk[] {
    return this.deps.redirection.scanOverloadedHubs();
  }

  alternativeHubs(hubId: string, radiusKm: number | null): AlternativeHub[] {
    return this.deps.redirection.findAlternatives(hubId, radiusKm);
  }

  simulation(input: ScenarioParams): DemandProjection[] {
    return this.deps.simulation.project(input);
  }

  /* ------------------------------ Giám sát ------------------------------- */

  updateHubStatus(hubId: string, status: HubStatus): OperationResult {
    return this.deps.monitoring.updateHubStatus(hubId, status);
  }

  resolveIncident(incidentId: string): OperationResult {
    return this.deps.monitoring.resolveIncident(incidentId);
  }

  /* ------------------------------ Điều phối ------------------------------ */

  createDispatchOrder(input: {
    sourceHubId: string;
    destHubId: string;
    quantity: number;
    vehicleIds?: string[];
    staffId?: string;
    note?: string;
  }): ApiResult<{ order?: DispatchOrder; warning?: string | null }> {
    return this.deps.dispatch.createOrder(input);
  }

  assignDispatchStaff(orderId: string, staffId: string): OperationResult {
    return this.deps.dispatch.assignStaff(orderId, staffId);
  }

  startDispatchTransport(orderId: string): OperationResult {
    return this.deps.dispatch.startTransport(orderId);
  }

  completeDispatchOrder(orderId: string): OperationResult {
    return this.deps.dispatch.complete(orderId);
  }

  cancelDispatchOrder(orderId: string, reason: string): OperationResult {
    return this.deps.dispatch.cancel(orderId, reason);
  }

  suggestRebalancing(): DispatchSuggestion[] {
    return this.deps.dispatch.suggestRebalancing();
  }

  /* --------------------------- Điều hướng người dùng --------------------- */

  approveRedirectionPlan(input: {
    overloadedHubId: string;
    targetHubId: string;
    note?: string;
  }): ApiResult<{ plan?: RedirectPlan; offerCount?: number }> {
    return this.deps.redirection.approvePlan(input);
  }

  closeRedirectionPlan(planId: string): OperationResult {
    return this.deps.redirection.closePlan(planId);
  }

  /* ------------------------------ Lập lịch sạc --------------------------- */

  createSmartChargingSchedule(hubId: string): ApiResult<{ allocated?: number; overflow?: number }> {
    return this.deps.scheduling.createSmartSchedule(hubId);
  }

  allocateChargingPower(hubId: string): OperationResult & { allocated?: number; overflow?: number } {
    return this.deps.scheduling.allocatePower(hubId);
  }

  requestCharging(
    vehicleId: string,
    options?: { source?: 'student' | 'operator'; targetBattery?: number; neededBy?: string; note?: string },
  ): OperationResult {
    return this.deps.scheduling.requestCharging(vehicleId, options);
  }

  cancelChargingRequest(requestId: string): OperationResult {
    return this.deps.scheduling.cancelRequest(requestId);
  }

  setPortMaintenance(portId: string, underMaintenance: boolean): OperationResult {
    return this.deps.scheduling.setPortMaintenance(portId, underMaintenance);
  }

  updateChargingConfig(patch: Partial<ChargingConfig>): OperationResult {
    return this.deps.scheduling.updateConfig(patch);
  }

  completeChargingSession(sessionId: string, reason?: ChargingEndReason): OperationResult {
    return this.deps.scheduling.completeSession(sessionId, reason);
  }

  checkInCharging(code: string, studentId?: string): OperationResult {
    return this.deps.scheduling.checkIn(code, studentId);
  }

  createChargingReservation(input: ChargingReservationRequest): ApiResult<{ reservation?: ChargingBooking }> {
    return this.deps.scheduling.createReservation(input);
  }

  cancelChargingReservation(reservationId: string): OperationResult {
    return this.deps.scheduling.cancelReservation(reservationId);
  }
}
