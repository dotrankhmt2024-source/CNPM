/**
 * Nhãn hiển thị cho trạng thái xe và vị trí đỗ trên màn hình nhà điều hành.
 */
import type { ParkingSlotStatus, VehicleStatus } from '@/shared/types/domain';

export const vehicleStatusLabel: Record<VehicleStatus, string> = {
  available: 'Sẵn sàng',
  reserved: 'Đã giữ chỗ',
  in_use: 'Đang thuê',
  charging: 'Đang sạc',
  maintenance: 'Bảo trì',
  dispatching: 'Chờ điều phối',
  in_transit: 'Đang vận chuyển',
};

export const vehicleStatusClass: Record<VehicleStatus, string> = {
  available: 'pill-green',
  reserved: 'pill-blue',
  in_use: 'pill-blue',
  charging: 'pill-orange',
  maintenance: 'pill-orange',
  dispatching: 'pill-orange',
  in_transit: 'pill-blue',
};

export const parkingSlotLabel: Record<ParkingSlotStatus, string> = {
  free: 'Trống',
  used: 'Đang dùng',
  reserved: 'Đã đặt',
  maintenance: 'Bảo trì',
};

export const parkingSlotClass: Record<ParkingSlotStatus, string> = {
  free: 'border-[#176B5B] bg-[#EAF7EF] text-[#176B5B]',
  used: 'border-[#E2BF8A] bg-[#FDF4E5] text-[#9A6B1F]',
  reserved: 'border-[#9DB8F5] bg-[#EEF4FF] text-[#2563EB]',
  maintenance: 'border-[#F0A8A8] bg-[#FDECEC] text-[#C04343]',
};
