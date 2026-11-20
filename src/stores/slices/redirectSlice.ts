/**
 * Các action của use case "Điều hướng người dùng đến Hub thay thế".
 * Quy tắc nghiệp vụ nằm ở services/redirectService.ts.
 */
import type { AppData, RedirectPlan } from '../../types/domain';
import {
  acceptRedirectionOffer,
  approveRedirectionPlan,
  closeRedirectionPlan,
  pickRedirectState,
  rejectRedirectionOffer,
  respondToGeneralNotice,
} from '../../services/redirectService';
import { simulatedNow } from '../../services/clock';
import { useAuthStore } from '../useAuthStore';

type Result = { ok: boolean; message: string };
type Setter = (partial: Partial<AppData>) => void;
type Getter = () => AppData;

export interface RedirectActions {
  approveRedirectionPlan: (input: {
    overloadedHubId: string;
    targetHubId: string;
    note?: string;
  }) => Result & { plan?: RedirectPlan; offerCount?: number };
  closeRedirectionPlan: (planId: string) => Result;
  acceptRedirectionOffer: (offerId: string) => Result & { moved?: boolean };
  rejectRedirectionOffer: (offerId: string) => Result & { warning?: string };
  respondToGeneralNotice: (planId: string, accept: boolean) => Result & { warning?: string };
}

export const createRedirectActions = (set: Setter, get: Getter): RedirectActions => {
  const now = () => simulatedNow(get().clockOffsetMinutes ?? 0);
  return {
    approveRedirectionPlan: (input) => {
      const operatorName = useAuthStore.getState().currentUser?.fullName ?? 'Đơn vị vận hành';
      const result = approveRedirectionPlan(pickRedirectState(get()), { ...input, operatorName }, now());
      if (!result.ok) return result;
      set(result.state);
      return { ok: true, message: result.message, plan: result.plan, offerCount: result.offers.length };
    },
    closeRedirectionPlan: (planId) => {
      const result = closeRedirectionPlan(pickRedirectState(get()), planId, now());
      if (result.ok) set(result.state);
      return { ok: result.ok, message: result.message };
    },
    acceptRedirectionOffer: (offerId) => {
      const result = acceptRedirectionOffer(pickRedirectState(get()), offerId, now());
      if (!result.ok) return result;
      set(result.state);
      return { ok: true, message: result.message, moved: result.moved };
    },
    respondToGeneralNotice: (planId, accept) => {
      const studentName = useAuthStore.getState().currentUser?.fullName ?? 'Sinh viên';
      const result = respondToGeneralNotice(pickRedirectState(get()), { planId, studentName, accept }, now());
      if (!result.ok) return result;
      set(result.state);
      return { ok: true, message: result.message, warning: result.warning };
    },
    rejectRedirectionOffer: (offerId) => {
      const result = rejectRedirectionOffer(pickRedirectState(get()), offerId, now());
      if (!result.ok) return result;
      set(result.state);
      return { ok: true, message: result.message, warning: result.warning };
    },
  };
};
