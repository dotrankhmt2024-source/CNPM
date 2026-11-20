import type { Hub } from '../../types/domain';

export const hubStatusLabel = {
  normal: 'Bình thường',
  warning: 'Cảnh báo',
  maintenance: 'Bảo trì',
} as const;

export const hubStatusClass = {
  normal: 'pill-green',
  warning: 'pill-orange',
  maintenance:
    'rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-300',
} as const;

export const freeParking = (hub: Hub) => hub.capacity - hub.occupiedParking;
export const freeChargers = (hub: Hub) => hub.chargers - hub.activeCharging;

export const hubStatusOrder = { normal: 0, warning: 1, maintenance: 2 } as const;
