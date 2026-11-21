/**
 * Tính toán thuần của nghiệp vụ điều hướng người dùng (shared kernel).
 *
 * Chỉ đọc dữ liệu: đo mức quá tải của Hub, tìm Hub thay thế, tập hợp các lịch đặt
 * bị ảnh hưởng. RedirectionService dùng lại để ra quyết định; giao diện dùng để
 * hiển thị/xem trước mà không phải gọi vào subsystem.
 */
import type {
  AppData,
  Hub,
  HubSnapshot,
  RedirectOffer,
  RedirectTargetKind,
} from '@/shared/types/domain';
import { hubDistanceKm, inboundReserved } from './dispatchMath';

export type RedirectState = Pick<
  AppData,
  | 'hubs'
  | 'vehicles'
  | 'bookings'
  | 'parkingSlots'
  | 'parkingReservations'
  | 'chargePoints'
  | 'chargingBookings'
  | 'dispatchOrders'
  | 'redirectPlans'
  | 'redirectOffers'
>;

/** Ngưỡng tỉ lệ chỗ đỗ bị chiếm để coi là quá tải (state-chart Hub: parkingOccupancy ≥ 85%). */
export const OVERLOAD_OCCUPANCY = 0.85;

export const REDIRECT_KIND_LABEL: Record<RedirectTargetKind, string> = {
  vehicle_return: 'Trả xe',
  parking: 'Đặt chỗ đỗ',
  charging: 'Đặt lịch sạc',
  general: 'Gợi ý chung',
};

export interface OverloadRisk {
  hub: Hub;
  snapshot: HubSnapshot;
  atRisk: boolean;
  reasons: string[];
}

export interface AlternativeHub {
  hub: Hub;
  snapshot: HubSnapshot;
  distanceKm: number;
  /** Điểm phù hợp 0–100: nhiều tài nguyên trống, gần Hub quá tải. */
  score: number;
}

export interface AffectedBookingDraft {
  kind: RedirectOffer['kind'];
  refId: string;
  refLabel: string;
  studentName: string;
}

export function hubSnapshot(
  state: Pick<RedirectState, 'hubs' | 'vehicles' | 'chargePoints' | 'dispatchOrders'>,
  hub: Hub,
): HubSnapshot {
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

/** Các lịch đặt của sinh viên đang hướng tới Hub quá tải. */
export function collectAffectedBookings(state: RedirectState, hubId: string): AffectedBookingDraft[] {
  const vehicleCode = (id: string) => state.vehicles.find((vehicle) => vehicle.id === id)?.code ?? id;
  const drafts: AffectedBookingDraft[] = [];
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
  state.chargingBookings
    .filter((booking) => booking.status === 'CONFIRMED' && booking.hubId === hubId)
    .forEach((booking) =>
      drafts.push({
        kind: 'charging',
        refId: booking.id,
        refLabel: `Cổng sạc ${booking.portCode} lúc ${booking.startTime} (mã ${booking.code})`,
        studentName: booking.studentName,
      }),
    );
  return drafts;
}

export const pickRedirectState = (data: RedirectState): RedirectState => ({
  hubs: data.hubs,
  vehicles: data.vehicles,
  bookings: data.bookings,
  parkingSlots: data.parkingSlots,
  parkingReservations: data.parkingReservations,
  chargePoints: data.chargePoints,
  chargingBookings: data.chargingBookings,
  dispatchOrders: data.dispatchOrders,
  redirectPlans: data.redirectPlans,
  redirectOffers: data.redirectOffers,
});
