import { useNavigate } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { useAppStore } from '../../../stores/useAppStore';
import { freeSlots, hubStatus, isOverloaded, scheduledCount, suggestDonor, vehicleCount } from '../../../services/HubService';
import { AlertRow, BlackPill, HubInfoBar, PageHeader, pct, useSelectedHub } from '../components/ui';
import { utilizationRate } from '../../../services/HubService';

export function HubManagementPage() {
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const data = useAppStore();
  const { hub, select } = useSelectedHub();
  if (!hub) return null;

  const vehicles = vehicleCount(hub);
  const slotsLeft = freeSlots(hub);
  const scheduled = scheduledCount(data, hub.id);
  const donor = suggestDonor(data, hub);

  return (
    <div>
      <PageHeader title="Quản lý Hub" subtitle="Quản lý trạng thái và tài nguyên của một Hub." />
      <HubInfoBar
        hub={hub}
        status={hubStatus(hub)}
        hubs={data.hubs}
        onPick={select}
        onRefresh={() => message.success('Đã cập nhật trạng thái Hub')}
        extra={null}
      />

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-xl font-bold">Xe tại HUB</h2>
        <span className="mr-24 text-sm font-semibold text-accent">{vehicles} xe</span>
      </div>
      {hub.maintenance ? (
        <AlertRow tone="warning">Hub đang bảo trì, tạm ngừng nhận và cho thuê xe.</AlertRow>
      ) : vehicles === 0 ? (
        <AlertRow action={donor ? <BlackPill onClick={() => navigate(`/operator/dispatch?dest=${hub.id}&src=${donor.id}`)}>Điều phối ngay</BlackPill> : undefined}>
          Hiện tại Hub không còn xe{donor ? `, gợi ý: điều phối xe từ ${donor.name}` : ''}
        </AlertRow>
      ) : null}

      <h2 className="mb-3 mt-8 text-xl font-bold">Bãi đỗ</h2>
      {hub.maintenance ? (
        <AlertRow tone="warning">Hub đang bảo trì nên bãi đỗ tạm đóng.</AlertRow>
      ) : slotsLeft === 0 ? (
        <AlertRow action={<BlackPill onClick={() => navigate(`/operator/redirect?src=${hub.id}`)}>Điều phối ngay</BlackPill>}>
          Hiện tại Hub không còn chỗ đỗ xe, gợi ý: Điều hướng người dùng tới các Hub lân cận
        </AlertRow>
      ) : isOverloaded(hub) ? (
        <AlertRow tone="warning" action={<BlackPill onClick={() => navigate(`/operator/redirect?src=${hub.id}`)}>Điều phối ngay</BlackPill>}>
          Hub đang quá tải ({pct(utilizationRate(hub))}), chỉ còn {slotsLeft} chỗ trống.
        </AlertRow>
      ) : (
        <AlertRow tone="ok">Còn {slotsLeft} chỗ đỗ trống ({pct(utilizationRate(hub))} đang sử dụng).</AlertRow>
      )}

      <h2 className="mb-3 mt-8 text-xl font-bold">Lịch sạc</h2>
      <div className="max-w-md rounded-2xl border border-black bg-white p-5">
        <p className="text-sm font-bold text-red-600">Hiện tại Hub có {scheduled} xe đang trong lịch sạc</p>
        <div className="mt-4 flex justify-between gap-3">
          <BlackPill onClick={() => navigate(`/operator/charging?hub=${hub.id}`)}>Xem chi tiết</BlackPill>
          <BlackPill onClick={() => navigate('/operator/charging/params')}>Thay đổi tham số</BlackPill>
        </div>
      </div>
    </div>
  );
}
