import { describe, expect, it } from 'vitest';
import { createInitialData } from '@/demo/seed';
import {
  acceptRedirectionOffer,
  approveRedirectionPlan,
  closeRedirectionPlan,
  collectAffectedBookings,
  detectOverloadRisk,
  findNearbyAlternativeHubs,
  pickRedirectState,
  rejectRedirectionOffer,
  respondToGeneralNotice,
  type RedirectState,
} from '@/subsystems/mobility/redirection/redirectService';
import { atLocalTime } from '@/shared/clock';

const NOW = atLocalTime('2026-11-20', '09:00');

/** HUB A4 (h1) gần đầy, có 1 sinh viên sẽ trả xe về đây, 1 lịch đỗ và 1 lịch sạc tại đây. */
function overloadedState(): RedirectState {
  const base = pickRedirectState(createInitialData(NOW));
  const port = base.chargePoints.find((item) => item.hubId === 'h1' && !item.underMaintenance)!;
  const slot = base.parkingSlots.find((item) => item.hubId === 'h1' && item.status === 'free')!;
  const startAt = new Date(NOW + 6 * 60 * 60_000).toISOString();
  return {
    ...base,
    hubs: base.hubs.map((hub) => (hub.id === 'h1' ? { ...hub, occupiedParking: 28 } : hub)),
    bookings: [
      {
        id: 'bk1', vehicleId: 'v5', hubId: 'h2', returnHubId: 'h1', studentId: 'student-A', studentName: 'Sinh viên A',
        status: 'picked_up', createdAt: new Date(NOW).toISOString(), expiresAt: new Date(NOW).toISOString(), pickupCode: 'SEMH111111',
      },
    ],
    parkingSlots: base.parkingSlots.map((item) => (item.id === slot.id ? { ...item, status: 'reserved' } : item)),
    parkingReservations: [
      {
        id: 'pk1', hubId: 'h1', slotId: slot.id, slotLabel: slot.label, vehicleType: 'Xe máy',
        startAt: '13:30', endAt: '17:00', price: 5000, code: 'DO123456', studentId: 'student-B', studentName: 'Sinh viên B', status: 'reserved',
      },
    ],
    chargingBookings: [
      // Chỉ giữ đúng một lịch sạc tại Hub quá tải để kiểm tra đề xuất điều hướng.
      ...base.chargingBookings.filter((booking) => booking.hubId !== 'h1'),
      {
        id: 'cb1', code: 'SAC999999', studentId: 'student-999', studentName: 'Sinh viên C',
        hubId: 'h1', portId: port.id, portCode: port.code,
        vehicleKind: 'personal', vehicleId: 'pv-x', vehicleLabel: 'Xe cá nhân test',
        batteryCapacityKwh: 3.5, currentBattery: 20, targetBattery: 80,
        date: '2026-11-20', startTime: '15:00', startAt,
        endAt: new Date(Date.parse(startAt) + 60 * 60_000).toISOString(),
        durationMinutes: 60, power: port.power, estimatedEnergyKwh: 2.1, price: 50000,
        priorityScore: 50, status: 'CONFIRMED', createdAt: new Date(NOW).toISOString(),
      },
    ],
  };
}

describe('Phát hiện quá tải và tìm Hub thay thế', () => {
  it('Hub dùng ≥ 85% chỗ đỗ được đánh dấu có nguy cơ quá tải', () => {
    const state = overloadedState();
    const risk = detectOverloadRisk(state, state.hubs.find((hub) => hub.id === 'h1')!);
    expect(risk.atRisk).toBe(true);
    expect(risk.reasons.join(' ')).toMatch(/Bãi đỗ đã dùng 93%/);
  });

  it('Hub thay thế không gồm Hub quá tải, Hub bảo trì; lọc theo bán kính', () => {
    const base = overloadedState();
    const state = { ...base, hubs: base.hubs.map((hub) => (hub.id === 'h4' ? { ...hub, status: 'maintenance' as const } : hub)) };
    const all = findNearbyAlternativeHubs(state, 'h1', null);
    expect(all.map((item) => item.hub.id)).not.toContain('h1');
    expect(all.map((item) => item.hub.id)).not.toContain('h4');
    expect(all.length).toBeGreaterThan(0);
    for (let i = 1; i < all.length; i += 1) expect(all[i - 1].score).toBeGreaterThanOrEqual(all[i].score);
    const near = findNearbyAlternativeHubs(state, 'h1', 1.5);
    near.forEach((item) => expect(item.distanceKm).toBeLessThanOrEqual(1.5));
  });
});

describe('Phê duyệt phương án và gửi đề xuất', () => {
  it('gửi đề xuất cho các sinh viên đặt xe / chỗ đỗ / lịch sạc tại Hub quá tải', () => {
    const state = overloadedState();
    expect(collectAffectedBookings(state, 'h1').map((item) => item.kind).sort()).toEqual(['charging', 'parking', 'vehicle_return']);
    const result = approveRedirectionPlan(state, { overloadedHubId: 'h1', targetHubId: 'h2', operatorName: 'OP' }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.code).toBe('RD-0002');
    expect(result.plan.status).toBe('ACTIVE');
    expect(result.offers).toHaveLength(3);
    result.offers.forEach((offer) => expect(offer.status).toBe('PENDING'));
  });

  it('không cho tạo 2 phương án hiệu lực cho cùng một Hub, không chọn Hub thay thế trùng', () => {
    const state = overloadedState();
    expect(approveRedirectionPlan(state, { overloadedHubId: 'h1', targetHubId: 'h1', operatorName: 'OP' }, NOW).ok).toBe(false);
    const first = approveRedirectionPlan(state, { overloadedHubId: 'h1', targetHubId: 'h2', operatorName: 'OP' }, NOW);
    if (!first.ok) throw new Error(first.message);
    const second = approveRedirectionPlan(first.state, { overloadedHubId: 'h1', targetHubId: 'h3', operatorName: 'OP' }, NOW);
    expect(second.ok).toBe(false);
  });
});

describe('Sinh viên phản hồi đề xuất', () => {
  const approved = () => {
    const result = approveRedirectionPlan(overloadedState(), { overloadedHubId: 'h1', targetHubId: 'h2', operatorName: 'OP' }, NOW);
    if (!result.ok) throw new Error(result.message);
    return result;
  };

  it('đồng ý → lịch đặt chuyển sang Hub mới (updateBookingLocation)', () => {
    const { state, offers, plan } = approved();
    let next = state;
    for (const offer of offers) {
      const result = acceptRedirectionOffer(next, offer.id, NOW);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.moved).toBe(true);
      next = result.state;
    }
    expect(next.bookings[0].returnHubId).toBe('h2');
    const parking = next.parkingReservations[0];
    expect(parking.hubId).toBe('h2');
    expect(next.parkingSlots.find((slot) => slot.id === parking.slotId)?.status).toBe('reserved');
    const charging = next.chargingBookings.find((booking) => booking.id === 'cb1')!;
    expect(charging.hubId).toBe('h2');
    expect(charging.portId.startsWith('h2-')).toBe(true);
    expect(next.redirectOffers.filter((offer) => offer.planId === plan.id && offer.status === 'ACCEPTED')).toHaveLength(3);
  });

  it('bỏ qua → giữ nguyên lịch đặt, trả cảnh báo chờ lâu', () => {
    const { state, offers } = approved();
    const offer = offers.find((item) => item.kind === 'vehicle_return')!;
    const result = rejectRedirectionOffer(state, offer.id, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warning).toMatch(/chờ lâu/);
    expect(result.state.bookings[0].returnHubId).toBe('h1');
    expect(result.state.redirectOffers.find((item) => item.id === offer.id)?.status).toBe('REJECTED');
    expect(acceptRedirectionOffer(result.state, offer.id, NOW).ok).toBe(false);
  });

  it('Hub mới hết chỗ khi sinh viên đồng ý → FAILED, giữ nguyên lịch cũ', () => {
    const { state, offers } = approved();
    const full: RedirectState = {
      ...state,
      parkingSlots: state.parkingSlots.map((slot) => (slot.hubId === 'h2' ? { ...slot, status: 'used' } : slot)),
    };
    const offer = offers.find((item) => item.kind === 'parking')!;
    const result = acceptRedirectionOffer(full, offer.id, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.moved).toBe(false);
    expect(result.state.parkingReservations[0].hubId).toBe('h1');
    expect(result.state.redirectOffers.find((item) => item.id === offer.id)?.status).toBe('FAILED');
  });

  it('kết thúc phương án → đề xuất chưa trả lời chuyển EXPIRED', () => {
    const { state, plan } = approved();
    const result = closeRedirectionPlan(state, plan.id, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.redirectPlans.find((item) => item.id === plan.id)?.status).toBe('CLOSED');
    expect(result.state.redirectOffers.filter((offer) => offer.planId === plan.id).every((offer) => offer.status === 'EXPIRED')).toBe(true);
  });
});

describe('Gợi ý chung cho sinh viên chưa có lịch đặt', () => {
  const plan = () => {
    const base = pickRedirectState(createInitialData(NOW));
    // Trường hợp "chưa có lịch đặt": bỏ hết lịch đặt đang trỏ tới Hub quá tải.
    const empty = {
      ...base,
      bookings: [],
      parkingReservations: [],
      chargingBookings: base.chargingBookings.filter((booking) => booking.hubId !== 'h1'),
    };
    const result = approveRedirectionPlan(empty, { overloadedHubId: 'h1', targetHubId: 'h2', operatorName: 'OP' }, NOW);
    if (!result.ok) throw new Error(result.message);
    expect(result.offers).toHaveLength(0);
    return result;
  };

  it('bỏ qua → ghi nhận REJECTED và trả cảnh báo nguy cơ chờ lâu', () => {
    const { state, plan: created } = plan();
    const result = respondToGeneralNotice(state, { planId: created.id, studentName: 'SV A', accept: false }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warning).toMatch(/chờ lâu/);
    const offer = result.state.redirectOffers.find((item) => item.planId === created.id);
    expect(offer?.kind).toBe('general');
    expect(offer?.status).toBe('REJECTED');
    // Mỗi sinh viên chỉ phản hồi một lần
    expect(respondToGeneralNotice(result.state, { planId: created.id, studentName: 'SV A', accept: true }, NOW).ok).toBe(false);
  });

  it('đồng ý → ghi nhận ACCEPTED, không có cảnh báo; phương án đã kết thúc thì không phản hồi được', () => {
    const { state, plan: created } = plan();
    const result = respondToGeneralNotice(state, { planId: created.id, studentName: 'SV B', accept: true }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warning).toBeUndefined();
    expect(result.state.redirectOffers.find((item) => item.planId === created.id)?.status).toBe('ACCEPTED');
    const closed = closeRedirectionPlan(result.state, created.id, NOW);
    if (!closed.ok) throw new Error(closed.message);
    expect(respondToGeneralNotice(closed.state, { planId: created.id, studentName: 'SV C', accept: true }, NOW).ok).toBe(false);
  });
});
