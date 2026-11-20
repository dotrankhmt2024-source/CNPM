/**
 * Các action của phân hệ điều phối xe trong store chung.
 * Quy tắc nghiệp vụ nằm ở services/dispatchService.ts.
 */
import type { AppData, DispatchOrder } from '../../types/domain';
import {
  assignDispatchStaff,
  cancelDispatchOrder,
  completeDispatchOrder,
  createDispatchOrder,
  pickDispatchState,
  startDispatchTransport,
  type CreateDispatchInput,
  type DispatchResult,
} from '../../services/dispatchService';
import { simulatedNow } from '../../services/clock';
import { useAuthStore } from '../useAuthStore';

type Result = { ok: boolean; message: string };
type Setter = (partial: Partial<AppData>) => void;
type Getter = () => AppData;

export interface DispatchActions {
  createDispatchOrder: (
    input: Omit<CreateDispatchInput, 'operatorId' | 'operatorName'>,
  ) => Result & { order?: DispatchOrder; warning?: string | null };
  assignDispatchStaff: (orderId: string, staffId: string) => Result;
  startDispatchTransport: (orderId: string) => Result;
  completeDispatchOrder: (orderId: string) => Result;
  cancelDispatchOrder: (orderId: string, reason: string) => Result;
}

const currentOperator = () => {
  const user = useAuthStore.getState().currentUser;
  return { id: user?.id ?? 'operator', name: user?.fullName ?? 'Đơn vị vận hành' };
};

export const createDispatchActions = (set: Setter, get: Getter): DispatchActions => {
  const now = () => simulatedNow(get().clockOffsetMinutes ?? 0);
  const apply = (result: DispatchResult): Result => {
    if (result.ok) set(result.state);
    return { ok: result.ok, message: result.message };
  };

  return {
    createDispatchOrder: (input) => {
      const operator = currentOperator();
      const result = createDispatchOrder(
        pickDispatchState(get()),
        { ...input, operatorId: operator.id, operatorName: operator.name },
        now(),
      );
      if (!result.ok) return result;
      set(result.state);
      return { ok: true, message: result.message, order: result.order, warning: result.warning };
    },
    assignDispatchStaff: (orderId, staffId) =>
      apply(assignDispatchStaff(pickDispatchState(get()), orderId, staffId, currentOperator().name, now())),
    startDispatchTransport: (orderId) =>
      apply(startDispatchTransport(pickDispatchState(get()), orderId, currentOperator().name, now())),
    completeDispatchOrder: (orderId) =>
      apply(completeDispatchOrder(pickDispatchState(get()), orderId, currentOperator().name, now())),
    cancelDispatchOrder: (orderId, reason) =>
      apply(cancelDispatchOrder(pickDispatchState(get()), orderId, reason, currentOperator().name, now())),
  };
};
