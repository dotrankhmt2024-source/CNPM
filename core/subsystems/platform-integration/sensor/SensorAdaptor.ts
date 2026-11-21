/**
 * SensorAdaptor — trung gian giữa hệ thống phần mềm và nguồn dữ liệu cảm biến.
 *
 * Cài đặt ISensorService và dùng IIoTConnector để trao đổi trạng thái thiết bị.
 * Trong bản demo, "thiết bị" là dữ liệu mô phỏng suy ra từ DataStore; khi nối với
 * phần cứng thật chỉ cần thay IIoTConnector.
 */
import type { IIoTConnector, IDataSource, ISensorService, SensorReading, SensorStatus } from '@/contracts/Platform';
import type { Hub, HubStatus } from '@/shared/types/domain';

const statusOf = (status: HubStatus): SensorStatus =>
  status === 'normal' ? 'ok' : status === 'warning' ? 'warning' : 'fault';

/** Đọc trạng thái thiết bị từ nguồn dữ liệu (hoặc nhận bản tin do thiết bị đẩy lên). */
export class IotConnector implements IIoTConnector {
  private readonly pushed = new Map<string, SensorReading>();
  private readonly listeners = new Set<(readings: SensorReading[]) => void>();

  constructor(private readonly source: IDataSource) {}

  stream(): SensorReading[] {
    const data = this.source.read();
    const at = Date.now();
    const derived = data.hubs.flatMap((hub: Hub) => [
      {
        hubId: hub.id,
        deviceId: `${hub.id}-parking-sensor`,
        kind: 'parking' as const,
        value: hub.occupiedParking,
        status: statusOf(hub.status),
        at,
      },
      {
        hubId: hub.id,
        deviceId: `${hub.id}-charger-meter`,
        kind: 'charger' as const,
        value: hub.activeCharging,
        status: statusOf(hub.status),
        at,
      },
      {
        hubId: hub.id,
        deviceId: `${hub.id}-vehicle-counter`,
        kind: 'vehicle' as const,
        value: data.vehicles.filter((vehicle) => vehicle.hubId === hub.id && vehicle.status === 'available').length,
        status: statusOf(hub.status),
        at,
      },
    ]);
    return [...derived, ...this.pushed.values()];
  }

  publish(reading: SensorReading): void {
    this.pushed.set(reading.deviceId, reading);
    this.emit();
  }

  subscribe(listener: (readings: SensorReading[]) => void): () => void {
    this.listeners.add(listener);
    const offSource = this.source.subscribe(() => this.emit());
    return () => {
      this.listeners.delete(listener);
      offSource();
    };
  }

  private emit(): void {
    const snapshot = this.stream();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export class SensorAdaptor implements ISensorService {
  constructor(private readonly connector: IIoTConnector) {}

  readings(hubId?: string): SensorReading[] {
    const all = this.connector.stream();
    return hubId ? all.filter((reading) => reading.hubId === hubId) : all;
  }

  subscribe(listener: (readings: SensorReading[]) => void): () => void {
    return this.connector.subscribe(listener);
  }
}
