import type { NetworkSnapshot, WhatIfScenario, WhatIfResult, Recommendation, ScenarioRepository } from '../../../shared/types/simulation';

export function validateScenario(snapshot: NetworkSnapshot, input: WhatIfScenario): void {
  if (!snapshot.hubs.length) throw new Error('Không có dữ liệu mạng lưới để mô phỏng.');
  if (!input.name.trim()) throw new Error('Vui lòng nhập tên kịch bản.');
  if (!input.hubIds.length || new Set(input.hubIds).size !== input.hubIds.length ||
      input.hubIds.some(id => !snapshot.hubs.some(hub => hub.id === id))) {
    throw new Error('Danh sách Hub không hợp lệ.');
  }
  const ranges: [number, number, number][] = [
    [input.durationMinutes, 1, 1440], [input.demandGrowthPercent, 0, 1000],
    [input.arrivalsPerMinute, 0, 10000], [input.departuresPerMinute, 0, 10000],
    [input.disabledChargers, 0, 10000], [input.capacityReductionPercent, 0, 100],
    [input.chargingDemand, 0, 100000], [input.averageSessionMinutes, 1, 1440],
    [input.energyPerSessionKwh, 0, 1000],
  ];
  for (const [value, max] of [[input.brokenVehiclePercent, 100], [input.initialVehicleCount, 100000],
    [input.averageBattery, 100], [input.priorityBatteryThreshold, 100], [input.holdMinutes, 1440], [input.chargingPriorityWeight, 100]]) {
    if (value !== undefined) ranges.push([value, 0, max!]);
  }
  for (const ids of Object.values(input.parameterHubIds ?? {})) {
    if (ids && (!ids.length || ids.some(id => !snapshot.hubs.some(h => h.id === id)))) throw new Error('Phạm vi tham số không hợp lệ.');
  }
  if (ranges.some(([value, min, max]) => !Number.isFinite(value) || value < min || value > max) ||
      !Number.isInteger(input.disabledChargers) || !Number.isInteger(input.chargingDemand)) {
    throw new Error('Thông số kịch bản không hợp lệ.');
  }
  for (const hub of snapshot.hubs) {
    if ([hub.capacity, hub.occupiedParking, hub.chargers, hub.activeCharging].some(n => !Number.isFinite(n) || n < 0)) {
      throw new Error('Dữ liệu Hub không hợp lệ.');
    }
    if (input.hubIds.includes(hub.id) && (!input.parameterHubIds?.disabledChargers || input.parameterHubIds.disabledChargers.includes(hub.id)) && input.disabledChargers > hub.chargers) {
      throw new Error('Số cổng hỏng vượt số cổng của Hub.');
    }
  }
}

/** Deterministic aggregate estimate, never writes to operational state. */
export class WhatIfEngine {
  run(snapshot: NetworkSnapshot, scenario: WhatIfScenario): WhatIfResult {
    validateScenario(snapshot, scenario);
    const hubs = snapshot.hubs.map(hub => {
      const selected = scenario.hubIds.includes(hub.id);
      const value = (key: keyof WhatIfScenario, fallback: number) => selected &&
        (!scenario.parameterHubIds?.[key] || scenario.parameterHubIds[key]!.includes(hub.id)) ? Number(scenario[key] ?? fallback) : fallback;
      const growth = 1 + value('demandGrowthPercent', 0) / 100;
      const duration = value('durationMinutes', 30);
      const arrivals = selected ? Math.ceil(value('arrivalsPerMinute', 0) * duration * growth) : 0;
      const requestedDepartures = selected ? Math.ceil(value('departuresPerMinute', 0) * duration * growth) : 0;
      const actualFleet = snapshot.vehicles.filter(v => v.hubId === hub.id);
      const fleet = scenario.initialVehicleCount === undefined ? actualFleet.length : Math.round(value('initialVehicleCount', snapshot.vehicles.length) *
        (snapshot.vehicles.length ? actualFleet.length / snapshot.vehicles.length : 1 / snapshot.hubs.length));
      const availableRatio = actualFleet.length ? actualFleet.filter(v => v.status === 'available').length / actualFleet.length : 1;
      const available = Math.floor(fleet * availableRatio * (1 - value('brokenVehiclePercent', 0) / 100));
      // Conservative: arriving vehicles are not assumed ready to rent during this horizon.
      const departures = Math.min(requestedDepartures, available, hub.occupiedParking);
      const capacity = selected ? Math.floor(hub.capacity * (1 - value('capacityReductionPercent', 0) / 100)) : hub.capacity;
      const projectedOccupancy = Math.max(0, hub.occupiedParking + arrivals - departures);
      const operational = Math.max(0, hub.chargers - value('disabledChargers', 0));
      const battery = value('averageBattery', 100);
      const priorityFraction = battery <= value('priorityBatteryThreshold', 0) ? value('chargingPriorityWeight', 0) / 100 : 0;
      const lowBatteryDemand = Math.ceil(fleet * priorityFraction);
      const chargingDemand = selected ? Math.ceil(value('chargingDemand', 0) * growth) + lowBatteryDemand : 0;
      const freeChargers = Math.max(0, operational - hub.activeCharging);
      const chargingQueue = Math.max(0, hub.activeCharging + chargingDemand - operational);
      return {
        hubId: hub.id, name: hub.name, capacity, currentOccupancy: hub.occupiedParking,
        projectedOccupancy, overflow: Math.max(0, projectedOccupancy - capacity),
        utilization: capacity ? projectedOccupancy / capacity : projectedOccupancy ? 1 : 0,
        availableVehicles: available - departures, vehicleShortage: requestedDepartures - departures,
        freeChargers, chargingQueue,
        waitMinutes: operational ? Math.ceil(chargingQueue / operational) * (value('averageSessionMinutes', 30) + value('holdMinutes', 0)) : chargingQueue ? null : 0,
        energyDemandKwh: chargingDemand * value('energyPerSessionKwh', 2),
      };
    });
    const recommendations: Recommendation[] = [];
    // Budgets prevent suggesting the same spare vehicle/parking space twice.
    const spareVehicles = new Map(hubs.map(h => [h.hubId, h.availableVehicles]));
    const spareParking = new Map(hubs.map(h => [h.hubId, Math.max(0, h.capacity - h.projectedOccupancy)]));
    for (const hub of hubs) {
      let shortage = hub.vehicleShortage;
      for (const donor of hubs) {
        if (donor.hubId === hub.hubId || !shortage) continue;
        const quantity = Math.min(shortage, spareVehicles.get(donor.hubId) ?? 0, spareParking.get(hub.hubId) ?? 0);
        if (!quantity) continue;
        recommendations.push({ kind: 'dispatch', hubId: donor.hubId, targetHubId: hub.hubId, quantity,
          message: `Đề xuất chuyển ${quantity} xe từ ${donor.name} tới ${hub.name}.` });
        spareVehicles.set(donor.hubId, spareVehicles.get(donor.hubId)! - quantity);
        spareParking.set(hub.hubId, spareParking.get(hub.hubId)! - quantity);
        shortage -= quantity;
      }
      if (shortage) recommendations.push({ kind: 'monitor', hubId: hub.hubId, quantity: shortage,
        message: `Còn thiếu ${shortage} xe; cần bổ sung nguồn xe hoặc giảm nhu cầu.` });
      let overflow = hub.overflow;
      for (const target of hubs) {
        if (target.hubId === hub.hubId || !overflow) continue;
        const quantity = Math.min(overflow, spareParking.get(target.hubId) ?? 0);
        if (!quantity) continue;
        recommendations.push({ kind: 'redirect', hubId: hub.hubId, targetHubId: target.hubId, quantity,
          message: `Đề xuất chuyển ${quantity} lượt đỗ sang ${target.name}; cần kiểm tra khoảng cách trước khi duyệt.` });
        spareParking.set(target.hubId, spareParking.get(target.hubId)! - quantity);
        overflow -= quantity;
      }
      if (overflow) recommendations.push({ kind: 'monitor', hubId: hub.hubId, quantity: overflow,
        message: `Thiếu ${overflow} chỗ đỗ sau khi xét các Hub thay thế.` });
      if (hub.chargingQueue) recommendations.push({ kind: 'charging', hubId: hub.hubId, quantity: hub.chargingQueue,
        message: hub.waitMinutes === null ? 'Không còn cổng hoạt động: khôi phục cổng hoặc đổi Hub sạc.' : `Ưu tiên xe pin thấp, giãn lịch ${hub.chargingQueue} xe; ước tính chờ tối đa ${hub.waitMinutes} phút.` });
      if (hub.utilization >= 0.9 && !hub.overflow) recommendations.push({ kind: 'monitor', hubId: hub.hubId,
        message: `${hub.name} đạt ít nhất 90% sức chứa; theo dõi và hạn chế nhận thêm lượt đỗ.` });
    }
    return {
      scenario: structuredClone(scenario), snapshot: structuredClone(snapshot), hubs, recommendations,
      summary: { overloadedHubs: hubs.filter(h => h.utilization >= 0.9).length,
        averageUtilization: hubs.reduce((sum, h) => sum + h.utilization, 0) / hubs.length,
        energyDemandKwh: hubs.reduce((sum, h) => sum + h.energyDemandKwh, 0) },
      assumptions: ['Số xe ban đầu là tổng mạng lưới, phân bổ theo tỷ trọng xe hiện có; xe hỏng làm giảm lượng xe khả dụng.',
        'Nếu pin trung bình dưới ngưỡng ưu tiên, tỷ lệ xe cần sạc thêm được ước tính bằng trọng số ưu tiên.',
        'Thời gian giữ chỗ được cộng vào thời lượng chiếm cổng khi ước tính chờ sạc.',
        'Tham số áp dụng riêng cho mỗi Hub được chọn.', 'Dòng xe đến/đi không đổi trong thời gian mô phỏng.',
        'Thời gian chờ là ước tính theo lô sạc có thời lượng bằng nhau.', 'Khuyến nghị cần người vận hành duyệt; không tự thay đổi dữ liệu thật.'],
    };
  }

  runAndSave(snapshot: NetworkSnapshot, scenario: WhatIfScenario, repository: ScenarioRepository) {
    return repository.save(this.run(snapshot, scenario));
  }
}
