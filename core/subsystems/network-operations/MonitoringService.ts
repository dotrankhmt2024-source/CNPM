/**
 * MonitoringService — component của subsystem NetworkOperations.
 *
 * Cài đặt IMonitoring: tổng hợp trạng thái Hub / phương tiện / cổng sạc từ dữ liệu
 * vận hành, kết hợp số đo thiết bị lấy qua ISensorService. Nhà điều hành có thể ghi đè
 * trạng thái Hub hoặc đánh dấu xử lý sự cố.
 */
import type { HubHealth, IMonitoring } from '@/contracts/NetworkOperations';
import type { INotification, IPersistence, ISensorService, OperationResult, SensorReading, SensorStatus } from '@/contracts';
import type { Hub, HubStatus, Incident, Vehicle } from '@/shared/types/domain';

const sensorStatusOf = (readings: SensorReading[]): SensorStatus => {
  if (readings.some((reading) => reading.status === 'fault')) return 'fault';
  if (readings.some((reading) => reading.status === 'warning')) return 'warning';
  return 'ok';
};

export class MonitoringService implements IMonitoring {
  constructor(
    private readonly persistence: IPersistence,
    private readonly sensors: ISensorService,
    private readonly notification: INotification,
  ) {}

  listHubs(): Hub[] {
    return this.persistence.load().hubs;
  }

  hub(hubId: string): Hub | null {
    return this.persistence.load().hubs.find((hub) => hub.id === hubId) ?? null;
  }

  incidents(): Incident[] {
    return this.persistence.load().incidents;
  }

  vehicles(hubId?: string): Vehicle[] {
    const vehicles = this.persistence.load().vehicles;
    return hubId ? vehicles.filter((vehicle) => vehicle.hubId === hubId) : vehicles;
  }

  readings(hubId?: string): SensorReading[] {
    return this.sensors.readings(hubId);
  }

  health(): HubHealth[] {
    const data = this.persistence.load();
    return data.hubs.map((hub) => {
      const readings = this.sensors.readings(hub.id);
      const occupied = hub.occupiedParking;
      const freeParking = Math.max(0, hub.capacity - occupied);
      const freeChargers = Math.max(0, hub.chargers - hub.activeCharging);
      const availableVehicles = data.vehicles.filter(
        (vehicle) => vehicle.hubId === hub.id && vehicle.status === 'available',
      ).length;
      const warnings: string[] = [];
      if (hub.capacity > 0 && occupied / hub.capacity >= 0.85) {
        warnings.push(`Bãi đỗ đã dùng ${Math.round((occupied / hub.capacity) * 100)}% sức chứa`);
      }
      if (freeChargers === 0) warnings.push('Đã hết cổng sạc trống');
      if (availableVehicles === 0) warnings.push('Không còn xe khả dụng');
      return {
        hub,
        occupancyRate: hub.capacity ? Math.min(1, occupied / hub.capacity) : 1,
        freeParking,
        freeChargers,
        availableVehicles,
        sensorStatus: sensorStatusOf(readings),
        warnings,
      };
    });
  }

  updateHubStatus(hubId: string, status: HubStatus): OperationResult {
    const data = this.persistence.load();
    const hub = data.hubs.find((item) => item.id === hubId);
    if (!hub) return { ok: false, message: 'Không tìm thấy Hub.' };
    this.persistence.save({
      hubs: data.hubs.map((item) => (item.id === hubId ? { ...item, status } : item)),
    });
    this.notification.publish({
      kind: 'system',
      title: 'Cập nhật trạng thái Hub',
      message: `${hub.name}: ${status === 'normal' ? 'hoạt động bình thường' : status === 'warning' ? 'cảnh báo' : 'tạm ngưng bảo trì'}.`,
    });
    return { ok: true, message: 'Đã cập nhật trạng thái Hub.' };
  }

  resolveIncident(incidentId: string): OperationResult {
    const data = this.persistence.load();
    const incident = data.incidents.find((item) => item.id === incidentId);
    if (!incident) return { ok: false, message: 'Không tìm thấy sự cố.' };
    this.persistence.save({
      incidents: data.incidents.map((item) =>
        item.id === incidentId ? { ...item, resolved: true } : item,
      ),
    });
    return { ok: true, message: 'Đã đánh dấu xử lý sự cố.' };
  }
}
