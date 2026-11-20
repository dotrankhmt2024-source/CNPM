/**
 * Mô hình mô phỏng thuần (pure) cho kịch bản What-if.
 *
 * Không đọc/ghi dữ liệu: nhận danh sách Hub và tham số kịch bản, trả về dự báo
 * mức sử dụng. Nhờ vậy SimulationEngine chỉ còn phần lấy dữ liệu.
 */
import type { DemandProjection, ScenarioParams } from '@/contracts/NetworkOperations';
import type { Hub } from '@/shared/types/domain';

/** Ngưỡng cảnh báo: dự báo vượt 85% sức chứa. */
export const WARNING_OCCUPANCY = 0.85;

export function projectDemand(hubs: Hub[], params: ScenarioParams): DemandProjection[] {
  return hubs.map((hub) => {
    const projected = Math.min(
      hub.capacity,
      Math.round(hub.occupiedParking * params.demandGrowth + params.arrivals / 3),
    );
    return {
      hubId: hub.id,
      name: hub.name,
      current: hub.occupiedParking,
      projected,
      capacity: hub.capacity,
      warning: projected >= hub.capacity * WARNING_OCCUPANCY,
    };
  });
}
