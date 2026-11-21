/**
 * RedirectionService — component điều hướng người dùng của subsystem Mobility.
 *
 * Bọc các hàm thuần trong `redirection/redirectService` bằng IRedirection và IPersistence:
 * phát hiện Hub quá tải, tìm Hub thay thế, phê duyệt phương án, ghi nhận phản hồi của
 * sinh viên. Người dùng không bị đổi lịch đặt trừ khi họ đồng ý.
 */
import type { IRedirection } from '@/contracts/Mobility';
import type { ApiResult, IAuth, IClock, INotification, IPersistence, OperationResult } from '@/contracts';
import type { RedirectOffer, RedirectPlan } from '@/shared/types/domain';
import {
  acceptRedirectionOffer,
  approveRedirectionPlan,
  closeRedirectionPlan,
  findNearbyAlternativeHubs,
  pickRedirectState,
  rejectRedirectionOffer,
  respondToGeneralNotice,
  scanOverloadedHubs,
} from './redirection/redirectService';

export class RedirectionService implements IRedirection {
  constructor(
    private readonly persistence: IPersistence,
    private readonly auth: IAuth,
    private readonly notification: INotification,
    private readonly clock: IClock,
  ) {}

  private state() {
    return pickRedirectState(this.persistence.load());
  }

  private operatorName() {
    return this.auth.currentUser()?.fullName ?? 'Đơn vị vận hành';
  }

  scanOverloadedHubs() {
    return scanOverloadedHubs(this.state());
  }

  findAlternatives(hubId: string, radiusKm: number | null) {
    return findNearbyAlternativeHubs(this.state(), hubId, radiusKm);
  }

  approvePlan(input: { overloadedHubId: string; targetHubId: string; note?: string }): ApiResult<{
    plan?: RedirectPlan;
    offerCount?: number;
  }> {
    const result = approveRedirectionPlan(
      this.state(),
      { ...input, operatorName: this.operatorName() },
      this.clock.now(),
    );
    if (!result.ok) return result;
    this.persistence.save(result.state);
    this.notification.publish({
      kind: 'redirection',
      title: 'Phương án điều hướng mới',
      message: result.message,
    });
    return { ok: true, message: result.message, plan: result.plan, offerCount: result.offers.length };
  }

  closePlan(planId: string): OperationResult {
    const result = closeRedirectionPlan(this.state(), planId, this.clock.now());
    if (result.ok) this.persistence.save(result.state);
    return { ok: result.ok, message: result.message };
  }

  acceptOffer(offerId: string): ApiResult<{ moved?: boolean }> {
    const result = acceptRedirectionOffer(this.state(), offerId, this.clock.now());
    if (!result.ok) return result;
    this.persistence.save(result.state);
    return { ok: true, message: result.message, moved: result.moved };
  }

  rejectOffer(offerId: string): ApiResult<{ warning?: string }> {
    const result = rejectRedirectionOffer(this.state(), offerId, this.clock.now());
    if (!result.ok) return result;
    this.persistence.save(result.state);
    return { ok: true, message: result.message, warning: result.warning };
  }

  /** Sinh viên phản hồi gợi ý chung của một phương án đang hiệu lực. */
  respondToGeneralNotice(planId: string, studentName: string, accept: boolean): ApiResult<{ warning?: string }> {
    const result = respondToGeneralNotice(
      this.state(),
      { planId, studentName, accept },
      this.clock.now(),
    );
    if (!result.ok) return result;
    this.persistence.save(result.state);
    return { ok: true, message: result.message, warning: result.warning };
  }

  pendingOffers(): RedirectOffer[] {
    return this.persistence.load().redirectOffers.filter((offer) => offer.status === 'PENDING');
  }

  vehiclesInHub(hubId: string) {
    return this.persistence.load().vehicles.filter((vehicle) => vehicle.hubId === hubId);
  }
}
