import { useState } from 'react';
import { App as AntApp, Button, InputNumber, Switch } from 'antd';
import type { ChargingConfig } from '@/shared/types/domain';
import { formatDateTime } from '@/shared/clock';
import { useAppStore } from '@/client/api/useAppStore';

type NumericKey = Exclude<keyof ChargingConfig, 'autoAllocate' | 'updatedAt'>;

const FIELDS: { key: NumericKey; label: string; hint: string; unit: string; min: number; max: number; step?: number }[] = [
  { key: 'lowBatteryThreshold', label: 'Ngưỡng pin cần sạc', hint: 'Xe dùng chung dưới ngưỡng tự vào hàng đợi khi lập lịch.', unit: '%', min: 0, max: 100 },
  { key: 'criticalBatteryThreshold', label: 'Ngưỡng pin nguy cấp', hint: 'Cộng +15 điểm ưu tiên.', unit: '%', min: 0, max: 100 },
  { key: 'defaultTargetBattery', label: 'Ngưỡng pin mức đầy mong đợi', hint: 'Mức sạc tới mặc định của xe dùng chung.', unit: '%', min: 1, max: 100 },
  { key: 'timeWindowMinutes', label: 'Cửa sổ "sắp có chuyến đi"', hint: 'Xe cần dùng trong khoảng này được ưu tiên.', unit: 'phút', min: 5, max: 480, step: 5 },
  { key: 'slotMinutes', label: 'Độ dài khung giờ', hint: 'Đơn vị đặt lịch sạc.', unit: 'phút', min: 15, max: 120, step: 15 },
  { key: 'maxSessionMinutes', label: 'Thời lượng sạc tối đa', hint: 'Phiên quá thời lượng sẽ tự kết thúc.', unit: 'phút', min: 30, max: 720, step: 30 },
  { key: 'holdMinutes', label: 'Thời gian giữ chỗ sạc', hint: 'Sau giờ bắt đầu chưa check-in sẽ tự hủy.', unit: 'phút', min: 1, max: 60 },
  { key: 'earlyCheckInMinutes', label: 'Cho phép check-in sớm', hint: 'Trước giờ bắt đầu.', unit: 'phút', min: 0, max: 60 },
  { key: 'openHour', label: 'Giờ mở nhận lịch', hint: '', unit: 'giờ', min: 0, max: 23 },
  { key: 'closeHour', label: 'Giờ đóng nhận lịch', hint: '', unit: 'giờ', min: 1, max: 24 },
  { key: 'pricePerKwh', label: 'Đơn giá điện', hint: '', unit: 'đ/kWh', min: 0, max: 20000, step: 100 },
  { key: 'bookingFee', label: 'Phí giữ chỗ', hint: '', unit: 'đ', min: 0, max: 100000, step: 1000 },
];

/** Màn hình thay đổi tham số sạc (SmartChargingScreen.showChargingParametersForm). */
export function ChargingParamsForm({ onBack }: { onBack: () => void }) {
  const { message } = AntApp.useApp();
  const config = useAppStore((state) => state.chargingConfig);
  const updateChargingConfig = useAppStore((state) => state.updateChargingConfig);
  const [draft, setDraft] = useState<ChargingConfig>(config);
  const dirty = FIELDS.some((field) => draft[field.key] !== config[field.key]) || draft.autoAllocate !== config.autoAllocate;

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="link-green w-fit">
        ← Quay lại sơ đồ cổng sạc
      </button>

      <div className="card divide-y divide-line dark:divide-slate-800">
        {FIELDS.map((field) => (
          <div key={field.key} className="flex flex-wrap items-center gap-4 py-3 first:pt-0">
            <div className="min-w-[240px] flex-1">
              <p className="text-[14px] font-semibold text-ink dark:text-slate-100">{field.label}</p>
              {field.hint && <p className="muted-13">{field.hint}</p>}
            </div>
            <InputNumber
              className="w-[180px]"
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              suffix={field.unit}
              value={draft[field.key]}
              onChange={(value) => setDraft({ ...draft, [field.key]: value ?? 0 })}
            />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-4 py-3">
          <div className="min-w-[240px] flex-1">
            <p className="text-[14px] font-semibold text-ink dark:text-slate-100">Tự động cấp điện cho xe kế tiếp</p>
            <p className="muted-13">Khi một phiên sạc hoàn tất, cổng được chuyển ngay cho xe ưu tiên cao nhất đang chờ.</p>
          </div>
          <Switch checked={draft.autoAllocate} onChange={(value) => setDraft({ ...draft, autoAllocate: value })} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="muted-13">Cập nhật cuối: {formatDateTime(config.updatedAt)}</p>
        <div className="flex gap-2">
          <Button disabled={!dirty} onClick={() => setDraft(config)}>
            Hoàn tác
          </Button>
          <Button
            type="primary"
            disabled={!dirty}
            onClick={async () => {
              const result = await updateChargingConfig(draft);
              result.ok ? message.success(result.message) : message.error(result.message);
            }}
          >
            Lưu tham số
          </Button>
        </div>
      </div>
    </div>
  );
}
