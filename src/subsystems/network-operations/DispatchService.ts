/**
 * DispatchService (component) — cài đặt IDispatch trên nền các hàm thuần của
 * `dispatch/dispatchService` (vòng đời lệnh PENDING → ASSIGNED → IN_TRANSIT → COMPLETED).
 *
 * Service giữ trách nhiệm đọc/ghi dữ liệu (IPersistence), lấy người thực hiện từ
 * hệ thống tài khoản (IAuth) và thời điểm từ đồng hồ mô phỏng (IClock).
 */
import type { DispatchRequest, DispatchSuggestion, IDispatch } from '@/contracts/NetworkOperations';
import type { ApiResult, IAuth, IClock, IPersistence, OperationResult } from '@/contracts';
import type { DispatchOrder, DispatchStaff } from '@/shared/types/domain';
import {
  assignDispatchStaff,
  cancelDispatchOrder,
  completeDispatchOrder,
  createDispatchOrder,
  pickDispatchState,
  startDispatchTransport,
  suggestRebalancing,
} from './dispatch/dispatchService';

export class DispatchService implements IDispatch {
  constructor(
    private readonly persistence: IPersistence,
    private readonly auth: IAuth,
    private readonly clock: IClock,
  ) {}

  private state() {
    return pickDispatchState(this.persistence.load());
  }

  private operator() {
    const user = this.auth.currentUser();
    return { id: user?.id ?? 'operator', name: user?.fullName ?? 'Đơn vị vận hành' };
  }

  list(): DispatchOrder[] {
    return this.persistence.load().dispatchOrders;
  }

  staff(): DispatchStaff[] {
    return this.persistence.load().dispatchStaff;
  }

  createOrder(input: DispatchRequest): ApiResult<{ order?: DispatchOrder; warning?: string | null }> {
    const operator = this.operator();
    const result = createDispatchOrder(
      this.state(),
      { ...input, operatorId: operator.id, operatorName: operator.name },
      this.clock.now(),
    );
    if (!result.ok) return result;
    this.persistence.save(result.state);
    return { ok: true, message: result.message, order: result.order, warning: result.warning };
  }

  assignStaff(orderId: string, staffId: string): OperationResult {
    return this.apply(assignDispatchStaff(this.state(), orderId, staffId, this.operator().name, this.clock.now()));
  }

  startTransport(orderId: string): OperationResult {
    return this.apply(startDispatchTransport(this.state(), orderId, this.operator().name, this.clock.now()));
  }

  complete(orderId: string): OperationResult {
    return this.apply(completeDispatchOrder(this.state(), orderId, this.operator().name, this.clock.now()));
  }

  cancel(orderId: string, reason: string): OperationResult {
    return this.apply(cancelDispatchOrder(this.state(), orderId, reason, this.operator().name, this.clock.now()));
  }

  suggestRebalancing(): DispatchSuggestion[] {
    return suggestRebalancing(this.state());
  }

  private apply(result: { ok: boolean; message: string; state?: ReturnType<typeof pickDispatchState> }): OperationResult {
    if (result.ok && result.state) this.persistence.save(result.state);
    return { ok: result.ok, message: result.message };
  }
}
