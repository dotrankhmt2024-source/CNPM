/* ============================================================
 * Mô hình dữ liệu cho use case "Điều hướng người dùng đến Hub thay thế"
 * (sequence diagram 2.9, activity diagram 3.9 trong báo cáo nhóm).
 * ============================================================ */

/**
 * Loại đề xuất:
 *  - vehicle_return / parking / charging: lịch đặt của sinh viên tại Hub quá tải
 *  - general: gợi ý chung cho sinh viên chưa có lịch đặt (ghi nhận khi sinh viên phản hồi)
 */
export type RedirectTargetKind = 'vehicle_return' | 'parking' | 'charging' | 'general';

/**
 * Trạng thái đề xuất gửi tới sinh viên:
 *  PENDING  — đã gửi, chờ sinh viên quyết định
 *  ACCEPTED — sinh viên đồng ý, lịch đặt đã chuyển sang Hub mới
 *  REJECTED — sinh viên bấm "Bỏ qua", giữ nguyên lịch đặt ban đầu
 *  FAILED   — sinh viên đồng ý nhưng Hub mới đã hết tài nguyên, giữ nguyên lịch cũ
 *  EXPIRED  — phương án điều hướng đã kết thúc trước khi sinh viên trả lời
 */
export type RedirectOfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'FAILED' | 'EXPIRED';

export interface RedirectOffer {
  id: string;
  planId: string;
  kind: RedirectTargetKind;
  /** Id lịch đặt gốc (booking / parkingReservation / chargingReservation). */
  refId: string;
  /** Mô tả lịch đặt để hiển thị kể cả khi lịch gốc đã bị xóa. */
  refLabel: string;
  studentName: string;
  fromHubId: string;
  toHubId: string;
  status: RedirectOfferStatus;
  sentAt: string;
  respondedAt?: string;
  note?: string;
}

/** Số liệu của một Hub tại thời điểm lập phương án. */
export interface HubSnapshot {
  occupancyRate: number;
  freeParking: number;
  freeChargers: number;
  availableVehicles: number;
}

export type RedirectPlanStatus = 'ACTIVE' | 'CLOSED';

/** Phương án điều hướng đã được nhà điều hành phê duyệt. */
export interface RedirectPlan {
  id: string;
  /** Mã hiển thị, ví dụ RD-0003. */
  code: string;
  overloadedHubId: string;
  targetHubId: string;
  reasons: string[];
  overloadedSnapshot: HubSnapshot;
  targetSnapshot: HubSnapshot & { distanceKm: number };
  operatorName: string;
  note?: string;
  status: RedirectPlanStatus;
  createdAt: string;
  closedAt?: string;
}
