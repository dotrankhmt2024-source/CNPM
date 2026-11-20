/**
 * RedirectService — logic thuần của use case "Điều hướng người dùng đến Hub thay thế".
 *
 * Bám theo sequence diagram 2.9 / activity diagram 3.9:
 *  1. detectOverloadRisk           — ghi nhận Hub có nguy cơ quá tải
 *  2. findNearbyAlternativeHubs     — quét Hub lân cận còn chỗ đỗ / xe / cổng sạc
 *  3. (UI) hiển thị danh sách Hub thay thế kèm khoảng cách, số chỗ trống
 *  4. approveRedirectionPlan        — nhà điều hành phê duyệt phương án
 *  5. gửi đề xuất tới sinh viên đã đặt xe / chỗ đỗ / lịch sạc tại Hub quá tải
 *  6. acceptRedirectionOffer        — sinh viên đồng ý → updateBookingLocation
 *     rejectRedirectionOffer        — sinh viên bỏ qua → giữ nguyên, cảnh báo chờ lâu
 */
import type {
  AppData,
  Hub,
  HubSnapshot,
  RedirectOffer,
  RedirectPlan,
  RedirectTargetKind,
} from '../types/domain';
import { hubDistanceKm, inboundReserved } from './dispatchService';

export type RedirectState = Pick<
  AppData,
  | 'hubs'
  | 'vehicles'
  | 'bookings'
  | 'parkingSlots'
  | 'parkingReservations'
  | 'chargingPorts'
  | 'chargingReservations'
  | 'chargePoints'
  | 'dispatchOrders'
  | 'redirectPlans'
  | 'redirectOffers'
>;

export type RedirectResult<T = unknown> =
  | ({ ok: true; message: string; state: RedirectState } & T)
  | { ok: false; message: string };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });
const iso = (time: number) => new Date(time).toISOString();
let counter = 0;
const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Ngưỡng tỉ lệ chỗ đỗ bị chiếm để coi là quá tải (state-chart Hub: parkingOccupancy ≥ 85%). */
export const OVERLOAD_OCCUPANCY = 0.85;

export const REDIRECT_KIND_LABEL: Record<RedirectTargetKind, string> = {
  vehicle_return: 'Trả xe',
  parking: 'Đặt chỗ đỗ',
  charging: 'Đặt lịch sạc',
};

/* ------------------------------------------------------------------ */
/* Số liệu & phát hiện quá tải                                         */
/* ------------------------------------------------------------------ */

export function hubSnapshot(state: Pick<RedirectState, 'hubs' | 'vehicles' | 'chargePoints' | 'dispatchOrders'>, hub: Hub): HubSnapshot {
  const reservedInbound = inboundReserved(state.dispatchOrders, hub.id);
  const points = state.chargePoints.filter((point) => point.hubId === hub.id);
  return {
    occupancyRate: hub.capacity ? Math.min(1, (hub.occupiedParking + reservedInbound) / hub.capacity) : 1,
    freeParking: Math.max(0, hub.capacity - hub.occupiedParking - reservedInbound),
    freeChargers: points.length
      ? points.filter((point) => point.status === 'free').length
      : Math.max(0, hub.chargers - hub.activeCharging),
    availableVehicles: state.vehicles.filter((vehicle) => vehicle.hubId === hub.id && vehicle.status === 'available').length,
  };
}

export interface OverloadRisk {
  hub: Hub;
  snapshot: HubSnapshot;
  atRisk: boolean;
  reasons: string[];
}

/** detectOverloadRisk: các dấu hiệu Hub có nguy cơ quá tải. */
export function detectOverloadRisk(state: RedirectState, hub: Hub): OverloadRisk {
  const snapshot = hubSnapshot(state, hub);
  const reasons: string[] = [];
  if (snapshot.occupancyRate >= OVERLOAD_OCCUPANCY) {
    reasons.push(`Bãi đỗ đã dùng ${Math.round(snapshot.occupancyRate * 100)}% (ngưỡng ${OVERLOAD_OCCUPANCY * 100}%)`);
  }
  if (snapshot.freeChargers === 0) reasons.push('Hết cổng sạc trống');
  // State-chart Hub: availableVehicles <= 10% sức chứa → thiếu hụt xe.
  if (snapshot.availableVehicles < Math.max(1, Math.floor(hub.capacity * 0.1))) {
    reasons.push(`Chỉ còn ${snapshot.availableVehicles} xe khả dụng`);
  }
  if (hub.status === 'warning') reasons.push('Hệ thống cảm biến báo cảnh báo');
  if (hub.status === 'maintenance') reasons.push('Hub đang tạm ngưng');
  return { hub, snapshot, atRisk: reasons.length > 0, reasons };
}

export const scanOverloadedHubs = (state: RedirectState) =>
  state.hubs
    .map((hub) => detectOverloadRisk(state, hub))
    .sort((a, b) => b.reasons.length - a.reasons.length || b.snapshot.occupancyRate - a.snapshot.occupancyRate);

/* ------------------------------------------------------------------ */
/* Tìm Hub thay thế                                                     */
/* ------------------------------------------------------------------ */

export interface AlternativeHub {
  hub: Hub;
  snapshot: HubSnapshot;
  distanceKm: number;
  /** Điểm phù hợp 0–100: nhiều tài nguyên trống, gần Hub quá tải. */
  score: number;
}

/** findNearbyAlternativeHubs: Hub trong bán kính còn chỗ đỗ / xe / cổng sạc, xếp theo mức phù hợp. */
export function findNearbyAlternativeHubs(state: RedirectState, hubId: string, radiusKm: number | null): AlternativeHub[] {
  return state.hubs
    .filter((hub) => hub.id !== hubId && hub.status !== 'maintenance')
    .map((hub) => {
      const snapshot = hubSnapshot(state, hub);
      const distanceKm = hubDistanceKm(hubId, hub.id);
      const parkingRatio = hub.capacity ? snapshot.freeParking / hub.capacity : 0;
      const score =
        40 * parkingRatio +
        20 * Math.min(1, snapshot.freeChargers / 4) +
        20 * Math.min(1, snapshot.availableVehicles / 5) +
        20 * Math.max(0, 1 - distanceKm / 4);
      return { hub, snapshot, distanceKm, score: Math.round(score) };
    })
    .filter((item) => radiusKm === null || item.distanceKm <= radiusKm)
    .filter((item) => item.snapshot.freeParking > 0 || item.snapshot.freeChargers > 0 || item.snapshot.availableVehicles > 0)
    .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm);
}

/* ------------------------------------------------------------------ */
/* Lịch đặt bị ảnh hưởng                                                */
/* ------------------------------------------------------------------ */

type OfferDraft = Pick<RedirectOffer, 'kind' | 'refId' | 'refLabel' | 'studentName'>;

/** Các lịch đặt của sinh viên đang hướng tới Hub quá tải. */
export function collectAffectedBookings(state: RedirectState, hubId: string): OfferDraft[] {
  const vehicleCode = (id: string) => state.vehicles.find((vehicle) => vehicle.id === id)?.code ?? id;
  const drafts: OfferDraft[] = [];
  state.bookings
    .filter((booking) => (booking.status === 'reserved' || booking.status === 'picked_up') && booking.returnHubId === hubId)
    .forEach((booking) =>
      drafts.push({
        kind: 'vehicle_return',
        refId: booking.id,
        refLabel: `Trả xe ${vehicleCode(booking.vehicleId)} (mã ${booking.pickupCode})`,
        studentName: booking.studentName,
      }),
    );
  state.parkingReservations
    .filter((reservation) => reservation.status === 'reserved' && reservation.hubId === hubId)
    .forEach((reservation) =>
      drafts.push({
        kind: 'parking',
        refId: reservation.id,
        refLabel: `Chỗ đỗ ${reservation.slotLabel} (mã ${reservation.code})`,
        studentName: 'Sinh viên',
      }),
    );
  state.chargingReservations
    .filter((reservation) => reservation.status === 'reserved' && reservation.hubId === hubId)
    .forEach((reservation) =>
      drafts.push({
        kind: 'charging',
        refId: reservation.id,
        refLabel: `Cổng sạc ${reservation.portCode} lúc ${reservation.startTime} (mã ${reservation.code})`,
        studentName: 'Sinh viên',
      }),
    );
  return drafts;
}

/* ------------------------------------------------------------------ */
/* Phê duyệt & kết thúc phương án                                       */
/* ------------------------------------------------------------------ */

const nextPlanCode = (plans: RedirectPlan[]) => {
  const max = plans.reduce((top, plan) => Math.max(top, Number(plan.code.replace(/\D/g, '')) || 0), 0);
  return `RD-${String(max + 1).padStart(4, '0')}`;
};

/** approveRedirectionPlan: lưu phương án và gửi đề xuất tới sinh viên bị ảnh hưởng. */
export function approveRedirectionPlan(
  state: RedirectState,
  input: { overloadedHubId: string; targetHubId: string; operatorName: string; note?: string },
  now: number,
): RedirectResult<{ plan: RedirectPlan; offers: RedirectOffer[] }> {
  const overloaded = state.hubs.find((hub) => hub.id === input.overloadedHubId);
  const target = state.hubs.find((hub) => hub.id === input.targetHubId);
  if (!overloaded || !target) return fail('Không tìm thấy Hub.');
  if (overloaded.id === target.id) return fail('Hub thay thế phải khác Hub quá tải.');
  if (target.status === 'maintenance') return fail(`${target.name} đang tạm ngưng, không thể nhận người dùng.`);
  const targetSnapshot = hubSnapshot(state, target);
  if (targetSnapshot.freeParking === 0 && targetSnapshot.freeChargers === 0 && targetSnapshot.availableVehicles === 0) {
    return fail(`${target.name} không còn chỗ đỗ, cổng sạc hay xe trống.`);
  }
  if (state.redirectPlans.some((plan) => plan.status === 'ACTIVE' && plan.overloadedHubId === overloaded.id)) {
    return fail(`${overloaded.name} đang có phương án điều hướng hiệu lực. Hãy kết thúc phương án cũ trước.`);
  }

  const risk = detectOverloadRisk(state, overloaded);
  const plan: RedirectPlan = {
    id: makeId('rd'),
    code: nextPlanCode(state.redirectPlans),
    overloadedHubId: overloaded.id,
    targetHubId: target.id,
    reasons: risk.reasons.length ? risk.reasons : ['Nhà điều hành chủ động điều hướng'],
    overloadedSnapshot: risk.snapshot,
    targetSnapshot: { ...targetSnapshot, distanceKm: hubDistanceKm(overloaded.id, target.id) },
    operatorName: input.operatorName,
    note: input.note?.trim() || undefined,
    status: 'ACTIVE',
    createdAt: iso(now),
  };
  const offers: RedirectOffer[] = collectAffectedBookings(state, overloaded.id).map((draft) => ({
    ...draft,
    id: makeId('ro'),
    planId: plan.id,
    fromHubId: overloaded.id,
    toHubId: target.id,
    status: 'PENDING',
    sentAt: iso(now),
  }));
  return {
    ok: true,
    message: offers.length
      ? `Điều hướng người dùng thành công: đã gửi ${offers.length} đề xuất chuyển sang ${target.name}.`
      : `Điều hướng người dùng thành công: sinh viên sắp tới ${overloaded.name} sẽ được gợi ý sang ${target.name}.`,
    state: {
      ...state,
      redirectPlans: [plan, ...state.redirectPlans],
      redirectOffers: [...offers, ...state.redirectOffers],
    },
    plan,
    offers,
  };
}

/** Kết thúc phương án: các đề xuất chưa trả lời chuyển sang EXPIRED. */
export function closeRedirectionPlan(state: RedirectState, planId: string, now: number): RedirectResult {
  const plan = state.redirectPlans.find((item) => item.id === planId);
  if (!plan) return fail('Không tìm thấy phương án điều hướng.');
  if (plan.status === 'CLOSED') return fail('Phương án đã kết thúc trước đó.');
  return {
    ok: true,
    message: `Đã kết thúc phương án ${plan.code}.`,
    state: {
      ...state,
      redirectPlans: state.redirectPlans.map((item) =>
        item.id === planId ? { ...item, status: 'CLOSED', closedAt: iso(now) } : item,
      ),
      redirectOffers: state.redirectOffers.map((offer) =>
        offer.planId === planId && offer.status === 'PENDING'
          ? { ...offer, status: 'EXPIRED', respondedAt: iso(now), note: 'Phương án đã kết thúc' }
          : offer,
      ),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Phản hồi của sinh viên                                               */
/* ------------------------------------------------------------------ */

/** updateBookingLocation: chuyển lịch đặt sang Hub mới. Trả về state mới hoặc lý do thất bại. */
function updateBookingLocation(state: RedirectState, offer: RedirectOffer): { state: RedirectState } | { error: string } {
  const target = state.hubs.find((hub) => hub.id === offer.toHubId);
  if (!target) return { error: 'Không tìm thấy Hub mới.' };

  if (offer.kind === 'vehicle_return') {
    const booking = state.bookings.find((item) => item.id === offer.refId);
    if (!booking || (booking.status !== 'reserved' && booking.status !== 'picked_up')) {
      return { error: 'Lượt đặt xe không còn hiệu lực.' };
    }
    if (hubSnapshot(state, target).freeParking <= 0) return { error: `${target.name} đã hết chỗ đỗ để trả xe.` };
    return {
      state: {
        ...state,
        bookings: state.bookings.map((item) => (item.id === booking.id ? { ...item, returnHubId: target.id } : item)),
      },
    };
  }

  if (offer.kind === 'parking') {
    const reservation = state.parkingReservations.find((item) => item.id === offer.refId);
    if (!reservation || reservation.status !== 'reserved') return { error: 'Lịch đặt chỗ đỗ không còn hiệu lực.' };
    const slot = state.parkingSlots.find((item) => item.hubId === target.id && item.status === 'free');
    if (!slot) return { error: `${target.name} không còn vị trí đỗ trống.` };
    return {
      state: {
        ...state,
        parkingSlots: state.parkingSlots.map((item) =>
          item.id === reservation.slotId ? { ...item, status: 'free' } : item.id === slot.id ? { ...item, status: 'reserved' } : item,
        ),
        parkingReservations: state.parkingReservations.map((item) =>
          item.id === reservation.id ? { ...item, hubId: target.id, slotId: slot.id, slotLabel: slot.label } : item,
        ),
      },
    };
  }

  const reservation = state.chargingReservations.find((item) => item.id === offer.refId);
  if (!reservation || reservation.status !== 'reserved') return { error: 'Lịch đặt sạc không còn hiệu lực.' };
  const freePorts = state.chargingPorts.filter((item) => item.hubId === target.id && item.status === 'free');
  const port = freePorts.find((item) => item.power === reservation.power) ?? freePorts[0];
  if (!port) return { error: `${target.name} không còn cổng sạc trống.` };
  return {
    state: {
      ...state,
      chargingPorts: state.chargingPorts.map((item) =>
        item.hubId === reservation.hubId && item.code === reservation.portCode
          ? { ...item, status: 'free' }
          : item.id === port.id
            ? { ...item, status: 'reserved' }
            : item,
      ),
      chargingReservations: state.chargingReservations.map((item) =>
        item.id === reservation.id ? { ...item, hubId: target.id, portCode: port.code, power: port.power } : item,
      ),
    },
  };
}

const findPending = (state: RedirectState, offerId: string) => {
  const offer = state.redirectOffers.find((item) => item.id === offerId);
  if (!offer) return { error: 'Không tìm thấy đề xuất điều hướng.' };
  if (offer.status !== 'PENDING') return { error: 'Đề xuất này đã được xử lý.' };
  return { offer };
};

/** acceptRedirectionOffer: sinh viên đồng ý chuyển sang Hub thay thế. */
export function acceptRedirectionOffer(state: RedirectState, offerId: string, now: number): RedirectResult<{ moved: boolean }> {
  const found = findPending(state, offerId);
  if ('error' in found) return fail(found.error!);
  const { offer } = found;
  const target = state.hubs.find((hub) => hub.id === offer.toHubId);
  const updated = updateBookingLocation(state, offer);
  if ('error' in updated) {
    return {
      ok: true,
      moved: false,
      message: `Không thể chuyển: ${updated.error} Lịch đặt ban đầu được giữ nguyên.`,
      state: {
        ...state,
        redirectOffers: state.redirectOffers.map((item) =>
          item.id === offerId ? { ...item, status: 'FAILED', respondedAt: iso(now), note: updated.error } : item,
        ),
      },
    };
  }
  return {
    ok: true,
    moved: true,
    message: `Chuyển hướng thành công: ${REDIRECT_KIND_LABEL[offer.kind].toLowerCase()} đã chuyển sang ${target?.name}.`,
    state: {
      ...updated.state,
      redirectOffers: updated.state.redirectOffers.map((item) =>
        item.id === offerId ? { ...item, status: 'ACCEPTED', respondedAt: iso(now) } : item,
      ),
    },
  };
}

/** rejectRedirectionOffer: sinh viên bỏ qua → giữ nguyên lịch đặt, cảnh báo nguy cơ chờ lâu. */
export function rejectRedirectionOffer(state: RedirectState, offerId: string, now: number): RedirectResult<{ warning: string }> {
  const found = findPending(state, offerId);
  if ('error' in found) return fail(found.error!);
  const { offer } = found;
  const from = state.hubs.find((hub) => hub.id === offer.fromHubId);
  const warning = `${from?.name ?? 'Hub'} đang quá tải — bạn có thể phải chờ lâu hơn bình thường.`;
  return {
    ok: true,
    warning,
    message: 'Đã ghi nhận lựa chọn, lịch đặt ban đầu được giữ nguyên.',
    state: {
      ...state,
      redirectOffers: state.redirectOffers.map((item) =>
        item.id === offerId ? { ...item, status: 'REJECTED', respondedAt: iso(now), note: 'Sinh viên bỏ qua' } : item,
      ),
    },
  };
}

export const pickRedirectState = (data: RedirectState): RedirectState => ({
  hubs: data.hubs,
  vehicles: data.vehicles,
  bookings: data.bookings,
  parkingSlots: data.parkingSlots,
  parkingReservations: data.parkingReservations,
  chargingPorts: data.chargingPorts,
  chargingReservations: data.chargingReservations,
  chargePoints: data.chargePoints,
  dispatchOrders: data.dispatchOrders,
  redirectPlans: data.redirectPlans,
  redirectOffers: data.redirectOffers,
});
