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

  it('huỷ chỗ đỗ giải phóng vị trí để đặt lại', () => {
    const slot = gateway.student.parkingSlots('h2').find((item) => item.status === 'free');
    if (!slot) throw new Error('Hub không còn chỗ trống');
    const booked = gateway.student.bookParking({
      hubId: 'h2',
      slotId: slot.id,
      vehicleType: 'motorbike',
      startTime: '09:00',
      endTime: '11:00',
    });
    expect(booked.ok).toBe(true);
    if (!booked.ok || !booked.reservation) throw new Error(booked.message);

    expect(gateway.student.cancelParking(booked.reservation.id).ok).toBe(true);
    expect(gateway.system.snapshot().parkingReservations.find((item) => item.id === booked.reservation?.id)?.status).toBe(
      'cancelled',
    );
    expect(gateway.system.snapshot().parkingSlots.find((item) => item.id === slot.id)?.status).toBe('free');
  });

  it('chỗ đỗ quá khung giờ tự hết hạn khi chạy nhịp nền', () => {
    const slot = gateway.student.parkingSlots('h3').find((item) => item.status === 'free');
    if (!slot) throw new Error('Hub không còn chỗ trống');
    const booked = gateway.student.bookParking({
      hubId: 'h3',
      slotId: slot.id,
      vehicleType: 'motorbike',
      // Khung giờ đã trôi qua (ISO đầy đủ) để kiểm tra cơ chế tự hết hạn.
      startTime: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      endTime: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(booked.ok).toBe(true);
    if (!booked.ok || !booked.reservation) throw new Error(booked.message);

    gateway.system.tickCharging();

    expect(gateway.system.snapshot().parkingReservations.find((item) => item.id === booked.reservation?.id)?.status).toBe(
      'expired',
    );
    expect(gateway.system.snapshot().parkingSlots.find((item) => item.id === slot.id)?.status).toBe('free');
  });

  it('đặt lịch sạc của sinh viên hiện ngay trong dữ liệu nhà điều hành và huỷ được', () => {
    const dateKey = '2030-01-01';
    const startTime = '09:00';
    const slots = gateway.student.chargingSlots('h1', dateKey, startTime, 60);
    const free = slots.find((item) => item.status === 'free');
    if (!free) throw new Error('Hub không còn cổng sạc trống');

    // Xe cá nhân do sinh viên tự khai báo (không lấy từ đội xe dùng chung).
    const booked = gateway.student.bookChargingSlot({
      hubId: 'h1',
      portId: free.port.id,
      dateKey,
      startTime,
      durationMinutes: 60,
      vehicleKind: 'personal',
      vehicleId: 'personal-student-001-xe-cua-toi',
      vehicleLabel: 'Xe của tôi · 59X1-123.45',
      vehicleType: 'motorbike',
      batteryCapacityKwh: 3.5,
      currentBattery: 30,
      targetBattery: 80,
    });
    expect(booked.ok).toBe(true);
    if (!booked.ok || !booked.booking) throw new Error(booked.message);

    // Nhà điều hành thấy đúng lịch này trong dữ liệu sạc dùng chung.
    const operatorState = gateway.operator.chargingState();
    expect(operatorState.chargingBookings.some((item) => item.id === booked.booking?.id)).toBe(true);
    // Cổng bị giữ trong đúng khung giờ đã đặt.
    expect(
      gateway.student
        .chargingSlots('h1', dateKey, startTime, 60)
        .find((item) => item.port.id === free.port.id)?.status,
    ).toBe('reserved');

    // Sinh viên huỷ → cổng được giải phóng và lịch không còn hiệu lực.
    expect(gateway.student.cancelChargingSlot(booked.booking.id).ok).toBe(true);
    expect(
      gateway.operator.chargingState().chargingBookings.find((item) => item.id === booked.booking?.id)?.status,
    ).toBe('CANCELLED');
    expect(
      gateway.student.chargingSlots('h1', dateKey, startTime, 60).find((item) => item.port.id === free.port.id)?.status,
    ).toBe('free');
  });

  it('không nhận lịch sạc trên cổng đang bảo trì (phối hợp qua IScheduling)', () => {
    const port = gateway.operator.chargingState().chargePoints.find((item) => item.hubId === 'h1');
    if (!port) throw new Error('Hub không có cổng sạc');
    expect(gateway.operator.setPortMaintenance(port.id, true).ok).toBe(true);
    const result = gateway.student.bookChargingSlot({
      hubId: 'h1',
      portId: port.id,
      dateKey: '2030-01-01',
      startTime: '10:00',
      durationMinutes: 60,
      vehicleKind: 'personal',
      vehicleId: 'personal-student-001-xe-cua-toi',
      vehicleLabel: 'Xe của tôi · 59X1-123.45',
      vehicleType: 'motorbike',
      batteryCapacityKwh: 3.5,
      currentBattery: 30,
      targetBattery: 80,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/bảo trì/);
    expect(gateway.operator.setPortMaintenance(port.id, false).ok).toBe(true);
  });
});

describe('APIGateway — nhập mã lấy chỗ / trả chỗ', () => {
  it('chỗ đỗ: lấy chỗ rồi trả chỗ cập nhật vị trí và số chỗ trống', () => {
    expect(gateway.access.login({ email: 'student@demo.local', password: 'Student123!' }).ok).toBe(true);
    const slot = gateway.student.parkingSlots('h3').find((item) => item.status === 'free');
    if (!slot) throw new Error('Hub không còn chỗ trống');
    const occupied = () => gateway.system.snapshot().hubs.find((hub) => hub.id === 'h3')?.occupiedParking;
    const before = occupied();

    const booked = gateway.student.bookParking({
      hubId: 'h3',
      slotId: slot.id,
      vehicleType: 'Xe máy điện',
      startTime: '09:00',
      endTime: '11:00',
    });
    if (!booked.ok || !booked.reservation) throw new Error(booked.message);
    const code = booked.reservation.code;
    // Nhà điều hành phải biết vị trí này do ai đặt.
    expect(booked.reservation.studentName).toBe(gateway.access.currentUser()?.fullName);
    expect(occupied()).toBe((before ?? 0) + 1);

    // Mã sai / chưa lấy chỗ thì không trả được
    expect(gateway.student.checkInParking('DO000000').ok).toBe(false);
    expect(gateway.student.checkOutParking(code).ok).toBe(false);

    // Lấy chỗ: vị trí chuyển sang đang dùng, số chỗ trống không đổi
    expect(gateway.student.checkInParking(code.toLowerCase()).ok).toBe(true);
    expect(
      gateway.system.snapshot().parkingReservations.find((item) => item.id === booked.reservation?.id)?.status,
    ).toBe('checked_in');
    expect(gateway.system.snapshot().parkingSlots.find((item) => item.id === slot.id)?.status).toBe('used');
    expect(occupied()).toBe((before ?? 0) + 1);

    // Trả chỗ: giải phóng vị trí
    expect(gateway.student.checkOutParking(code).ok).toBe(true);
    expect(
      gateway.system.snapshot().parkingReservations.find((item) => item.id === booked.reservation?.id)?.status,
    ).toBe('completed');
    expect(gateway.system.snapshot().parkingSlots.find((item) => item.id === slot.id)?.status).toBe('free');
    expect(occupied()).toBe(before);
  });

  it('lịch sạc: lấy chỗ tạo phiên sạc, trả chỗ kết thúc phiên và giải phóng cổng', () => {
    const dateKey = '2026-11-22';
    const startTime = '09:00';
    const livePortIds = new Set(
      gateway.operator
        .chargingState()
        .chargingSessions.filter((item) => item.status === 'CHARGING')
        .map((item) => item.portId),
    );
    const free = gateway.student
      .chargingSlots('h2', dateKey, startTime, 60)
      .find((item) => item.status === 'free' && !livePortIds.has(item.port.id));
    if (!free) throw new Error('Hub không còn cổng sạc trống');

    const booked = gateway.student.bookChargingSlot({
      hubId: 'h2',
      portId: free.port.id,
      dateKey,
      startTime,
      durationMinutes: 60,
      vehicleKind: 'personal',
      vehicleId: 'personal-student-001-xe-cua-toi',
      vehicleLabel: 'Xe của tôi',
      vehicleType: 'motorbike',
      batteryCapacityKwh: 3.5,
      currentBattery: 30,
      targetBattery: 80,
    });
    if (!booked.ok || !booked.booking) throw new Error(booked.message);
    const code = booked.booking.code;

    expect(gateway.student.checkInChargingSlot('SAC000000').ok).toBe(false);
    expect(gateway.student.checkInChargingSlot(code).ok).toBe(true);

    const checkedIn = gateway.operator
      .chargingState()
      .chargingBookings.find((item) => item.id === booked.booking?.id);
    expect(checkedIn?.status).toBe('CHECKED_IN');
    const session = gateway.operator
      .chargingState()
      .chargingSessions.find((item) => item.reservationId === booked.booking?.id);
    expect(session?.status).toBe('CHARGING');

    expect(gateway.student.checkOutChargingSlot(code).ok).toBe(true);
    const done = gateway.operator
      .chargingState()
      .chargingBookings.find((item) => item.id === booked.booking?.id);
    expect(done?.status).toBe('COMPLETED');
    expect(
      gateway.operator.chargingState().chargingSessions.find((item) => item.id === session?.id)?.status,
    ).toBe('COMPLETED');
  });
});

describe('APIGateway — dữ liệu tách theo tài khoản', () => {
  it('tài khoản mới chỉ thấy lượt đặt / chỗ đỗ / lịch sạc của chính mình', () => {
    // Tài khoản demo đặt một xe và một chỗ đỗ.
    expect(gateway.access.login({ email: 'student@demo.local', password: 'Student123!' }).ok).toBe(true);
    const demoVehicle = gateway.student.availableVehicles('h2')[0];
    if (!demoVehicle) throw new Error('Hub không còn xe khả dụng');
    expect(gateway.student.reserveVehicle({ vehicleId: demoVehicle.id }).ok).toBe(true);
    const demoSlot = gateway.student.parkingSlots('h4').find((slot) => slot.status === 'free');
    if (!demoSlot) throw new Error('Hub không còn chỗ trống');
    expect(
      gateway.student.bookParking({
        hubId: 'h4',
        slotId: demoSlot.id,
        vehicleType: 'Xe máy điện',
        startTime: '09:00',
        endTime: '11:00',
      }).ok,
    ).toBe(true);

    // Tạo tài khoản sinh viên mới → dữ liệu phải trống.
    const registered = gateway.access.register({
      fullName: 'Sinh viên Mới',
      email: 'new.student@demo.local',
      password: 'NewStudent123!',
      confirmPassword: 'NewStudent123!',
    });
    expect(registered.ok).toBe(true);
    const newcomer = gateway.access.currentUser();
    if (!newcomer) throw new Error('Không tạo được tài khoản');
    expect(newcomer.id).not.toBe('student-001');

    expect(gateway.student.myBookings()).toHaveLength(0);
    expect(gateway.student.myParkingReservations()).toHaveLength(0);
    expect(gateway.student.myChargingBookings()).toHaveLength(0);

    // Tài khoản mới đặt xe → chỉ mình thấy.
    const newVehicle = gateway.student.availableVehicles('h1')[0];
    if (!newVehicle) throw new Error('Hub không còn xe khả dụng');
    const ownBooking = gateway.student.reserveVehicle({ vehicleId: newVehicle.id });
    expect(ownBooking.ok).toBe(true);
    expect(gateway.student.myBookings()).toHaveLength(1);
    expect(gateway.student.myBookings()[0].studentId).toBe(newcomer.id);

    // Quay lại tài khoản demo: không thấy lượt đặt của tài khoản mới.
    expect(gateway.access.login({ email: 'student@demo.local', password: 'Student123!' }).ok).toBe(true);
    expect(gateway.student.myBookings().some((booking) => booking.studentId === newcomer.id)).toBe(false);
    expect(gateway.student.myBookings().every((booking) => booking.studentId === 'student-001')).toBe(true);
    expect(gateway.student.myParkingReservations().every((item) => item.studentId === 'student-001')).toBe(true);
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

describe('Client store — read model + bộ lệnh gọi qua backend', () => {
  it('read model phản chiếu dữ liệu vận hành và có đủ lệnh', async () => {
    const { appClientStore } = await import('@/client/api/useAppStore');
    const state = appClientStore.getState();

    expect(state.hubs.length).toBeGreaterThan(0);
    expect(typeof state.reserveVehicle).toBe('function');
    expect(typeof state.bookParking).toBe('function');
    expect(typeof state.bootstrap).toBe('function');
  });

  it('mọi thao tác ghi đều trả Promise (gọi HTTP trong môi trường chạy thật)', async () => {
    const { appClientStore } = await import('@/client/api/useAppStore');
    const result = appClientStore.getState().reserveVehicle('v1', 'h2');
    expect(result).toBeInstanceOf(Promise);

    // Không chờ phản hồi: môi trường test không có server, Promise sẽ tự reject/resolve
    // với lỗi mạng — chỉ cần xác nhận lệnh đi qua lớp HTTP chứ không ghi cục bộ.
    await result.catch(() => undefined);
  });
});
