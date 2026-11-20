/**
 * Kiểm thử tích hợp: Client → APIGateway → subsystem → Platform.
 *
 * Không dựng React; chỉ kiểm tra dây nối giữa các tầng (định tuyến của gateway,
 * IPersistence, IAuth, IScheduling) để chắc việc tái cấu trúc không làm đổi hành vi.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
});

type Gateway = (typeof import('@/gateway'))['apiGateway'];
let gateway: Gateway;

beforeAll(async () => {
  const { apiGateway } = await import('@/gateway');
  gateway = apiGateway;
});

describe('APIGateway — Access & Identify', () => {
  it('đăng nhập bằng tài khoản demo và trả về người dùng hiện tại', () => {
    const result = gateway.access.login({ email: 'operator@demo.local', password: 'Operator123!' });
    expect(result.ok).toBe(true);
    expect(gateway.access.currentUser()?.role).toBe('operator');
  });

  it('lưu thiết lập cá nhân qua ISetting', () => {
    const user = gateway.access.currentUser();
    if (!user) throw new Error('Chưa đăng nhập');
    gateway.access.updateSettings(user.id, { notificationsEnabled: false });
    expect(gateway.access.settings(user.id).notificationsEnabled).toBe(false);
  });
});

describe('APIGateway — Mobility', () => {
  it('đặt xe, nhận xe và trả xe cập nhật đúng dữ liệu vận hành', () => {
    const before = gateway.system.snapshot().bookings.length;
    const reserved = gateway.student.reserveVehicle({ vehicleId: 'v2', returnHubId: 'h4' });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok || !reserved.booking) throw new Error(reserved.message);
    expect(gateway.system.snapshot().bookings.length).toBe(before + 1);

    const pickup = gateway.student.pickupVehicle(reserved.booking.id, reserved.booking.pickupCode);
    expect(pickup.ok).toBe(true);
    expect(gateway.system.snapshot().vehicles.find((vehicle) => vehicle.id === 'v2')?.status).toBe('in_use');

    const returned = gateway.student.returnVehicle(reserved.booking.id, reserved.booking.pickupCode);
    expect(returned.ok).toBe(true);
    expect(gateway.system.snapshot().vehicles.find((vehicle) => vehicle.id === 'v2')?.hubId).toBe('h4');
  });

  it('đặt chỗ đỗ giữ vị trí và tạo lượt đặt tương ứng', () => {
    const slot = gateway.student.parkingSlots('h4').find((item) => item.status === 'free');
    if (!slot) throw new Error('Hub không còn chỗ trống');
    const result = gateway.student.bookParking({
      hubId: 'h4',
      slotId: slot.id,
      vehicleType: 'motorbike',
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(result.ok).toBe(true);
    expect(gateway.system.snapshot().parkingSlots.find((item) => item.id === slot.id)?.status).toBe('reserved');
  });

  it('không nhận lịch sạc trên cổng đang bảo trì (phối hợp qua IScheduling)', () => {
    const port = gateway.operator.chargingState().chargePoints.find((item) => item.hubId === 'h1');
    if (!port) throw new Error('Hub không có cổng sạc');
    expect(gateway.operator.setPortMaintenance(port.id, true).ok).toBe(true);
    const result = gateway.student.bookCharging({
      hubId: 'h1',
      portCode: port.code,
      date: '2026-11-21',
      startTime: '09:00',
      durationMinutes: 60,
      power: 60,
    });
    expect(result.ok).toBe(false);
    expect(gateway.operator.setPortMaintenance(port.id, false).ok).toBe(true);
  });
});

describe('APIGateway — NetworkOperations', () => {
  it('tạo và chạy một lệnh điều phối với tên người thực hiện lấy từ IAuth', () => {
    const created = gateway.operator.createDispatchOrder({
      sourceHubId: 'h1',
      destHubId: 'h4',
      quantity: 1,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.order) throw new Error(created.message);
    expect(created.order.operatorName).toBe(gateway.access.currentUser()?.fullName);

    expect(gateway.operator.assignDispatchStaff(created.order.id, 'st1').ok).toBe(true);
    expect(gateway.operator.startDispatchTransport(created.order.id).ok).toBe(true);
    expect(gateway.operator.completeDispatchOrder(created.order.id).ok).toBe(true);
    expect(gateway.system.snapshot().dispatchOrders.find((item) => item.id === created.order?.id)?.status).toBe(
      'COMPLETED',
    );
  });

  it('mô phỏng What-if không làm thay đổi dữ liệu vận hành', () => {
    const before = gateway.system.snapshot().hubs;
    const projection = gateway.operator.simulation({ demandGrowth: 1.2, arrivals: 40 });
    expect(projection).toHaveLength(before.length);
    expect(projection[0].projected).toBeGreaterThanOrEqual(before[0].occupiedParking);
    expect(gateway.system.snapshot().hubs).toEqual(before);
  });

  it('nhịp xử lý nền trả về danh sách sự kiện và đồng bộ trạng thái sạc', () => {
    const events = gateway.system.tickCharging();
    expect(Array.isArray(events)).toBe(true);
    expect(gateway.operator.hubHealth()).toHaveLength(gateway.system.snapshot().hubs.length);
  });
});

describe('APIGateway — khôi phục dữ liệu demo', () => {
  it('resetDemoData đưa dữ liệu vận hành về trạng thái ban đầu', () => {
    gateway.system.resetDemoData();
    expect(gateway.system.snapshot().bookings).toHaveLength(0);
    expect(gateway.operator.dispatchOrders().some((order) => order.id.startsWith('dp-'))).toBe(true);
  });
});

describe('Client store — read model đồng bộ từ gateway', () => {
  it('lệnh đi qua gateway và state phía client được cập nhật theo', async () => {
    const { appClientStore } = await import('@/client/api/useAppStore');
    const before = appClientStore.getState().bookings.length;

    const result = appClientStore.getState().reserveVehicle('v1', 'h2');
    expect(result.ok).toBe(true);
    expect(appClientStore.getState().bookings.length).toBe(before + 1);
    expect(appClientStore.getState().vehicles.find((vehicle) => vehicle.id === 'v1')?.status).toBe('reserved');
  });

  it('lệnh khôi phục dữ liệu cũng đồng bộ về client store', async () => {
    const { appClientStore } = await import('@/client/api/useAppStore');
    appClientStore.getState().reset();
    expect(appClientStore.getState().bookings).toHaveLength(0);
    expect(appClientStore.getState().hubs.length).toBeGreaterThan(0);
  });
});
