/**
 * Thông số kỹ thuật mặc định theo loại phương tiện (shared kernel).
 *
 * Dùng chung cho bộ lập lịch sạc (tính thời lượng sạc) và màn hình đặt lịch của
 * sinh viên (chọn xe, hiển thị dung lượng pin).
 */
import type { ConnectorType, PersonalVehicleType } from '@/shared/types/domain';

export interface VehicleProfile {
  label: string;
  capacityKwh: number;
  /** Công suất sạc tối đa xe nhận được (kW). */
  maxPowerKw: number;
  connectors: ConnectorType[];
}

/** Thông số mặc định theo loại xe (dùng cho xe dùng chung và xe cá nhân chưa khai báo). */
export const VEHICLE_PROFILES: Record<PersonalVehicleType, VehicleProfile> = {
  bike: { label: 'Xe đạp điện', capacityKwh: 0.8, maxPowerKw: 0.5, connectors: ['AC'] },
  motorbike: { label: 'Xe máy điện', capacityKwh: 3.5, maxPowerKw: 2, connectors: ['AC'] },
  car: { label: 'Ô tô điện', capacityKwh: 60, maxPowerKw: 150, connectors: ['AC', 'DC'] },
};

export const isConnectorCompatible = (type: PersonalVehicleType, connector: ConnectorType) =>
  VEHICLE_PROFILES[type].connectors.includes(connector);
