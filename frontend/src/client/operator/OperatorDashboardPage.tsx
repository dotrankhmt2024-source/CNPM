import { Link } from 'react-router-dom';
import { PageHeader } from '@/client/shared/components/PageHeader';
import { useAppStore } from '@/client/api/useAppStore';
import { freeChargers, freeParking, hubStatusClass, hubStatusLabel } from '@/client/operator/hubStatus';

export function OperatorDashboardPage() {
  const hubs = useAppStore((state) => state.hubs);
  const vehicles = useAppStore((state) => state.vehicles);

  const operatingHubs = hubs.filter((hub) => hub.status === 'normal').length;
  const available = vehicles.filter((vehicle) => vehicle.status === 'available').length;
  const inUse = vehicles.filter((vehicle) => vehicle.status === 'in_use').length;
  const totalParking = hubs.reduce((sum, hub) => sum + hub.capacity, 0);
  const usedParking = hubs.reduce((sum, hub) => sum + hub.occupiedParking, 0);
  const totalChargers = hubs.reduce((sum, hub) => sum + hub.chargers, 0);
  const usedChargers = hubs.reduce((sum, hub) => sum + hub.activeCharging, 0);

  const stats = [
    {
      label: 'HUB đang hoạt động',
      value: `${operatingHubs} / ${hubs.length}`,
      hint: `${hubs.length - operatingHubs} HUB cần kiểm tra`,
      tone: 'text-[#18794E]',
    },
    {
      label: 'Xe khả dụng',
      value: `${available} / ${vehicles.length}`,
      hint: `${inUse} đang sử dụng`,
      tone: 'text-[#2563EB]',
    },
    {
      label: 'Chỗ đỗ khả dụng',
      value: `${totalParking - usedParking} / ${totalParking}`,
      hint: `${usedParking} đang sử dụng`,
      tone: 'text-[#B45309]',
    },
    {
      label: 'Trạm sạc khả dụng',
      value: `${totalChargers - usedChargers} / ${totalChargers}`,
      hint: `${usedChargers} đang sử dụng`,
      tone: 'text-[#18794E]',
    },
  ];

  const warnings = hubs.filter(
    (hub) =>
      hub.status !== 'normal' ||
      freeParking(hub) === 0 ||
      vehicles.filter((vehicle) => vehicle.hubId === hub.id).length === 0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trung tâm vận hành"
        subtitle="Theo dõi tình trạng HUB, xe, bãi đỗ và trạm sạc theo thời gian thực."
      />

      <section className="grid grid-cols-2 gap-5 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card py-4">
            <p className="text-[13px] text-muted dark:text-slate-400">{stat.label}</p>
            <p className="mt-2 text-[30px] font-bold leading-none text-ink dark:text-slate-100">
              {stat.value}
            </p>
            <p className={`mt-2 text-xs font-medium ${stat.tone}`}>{stat.hint}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Tình trạng các HUB</h2>
          <Link to="/operator/mo-phong" className="link-green">
            Mô phỏng kịch bản →
          </Link>
        </div>

        <div className="space-y-3">
          {hubs.map((hub) => {
            const hubVehicles = vehicles.filter((vehicle) => vehicle.hubId === hub.id).length;
            return (
              <div key={hub.id} className="card-row">
                <div className="min-w-[240px]">
                  <p className="text-[15px] font-semibold text-ink dark:text-slate-100">{hub.name}</p>
                  <p className="muted-13 mt-0.5">{hub.location}</p>
                </div>

                <span className={hubStatusClass[hub.status]}>{hubStatusLabel[hub.status]}</span>

                <p className="w-[90px] text-[13px] font-medium text-ink dark:text-slate-100">
                  {hubVehicles} xe
                </p>
                <p className="w-[90px] text-[13px] font-medium text-ink dark:text-slate-100">
                  {freeParking(hub)} chỗ
                </p>
                <p className="w-[90px] text-[13px] font-medium text-ink dark:text-slate-100">
                  {freeChargers(hub)} sạc
                </p>

                <Link to={`/operator/hub?hub=${hub.id}`} className="link-green">
                  Xem chi tiết →
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Cảnh báo vận hành</h2>
          <p className="muted-13">{warnings.length} cảnh báo mới</p>
        </div>

        <div className="space-y-2">
          {warnings.length === 0 && (
            <div className="card">
              <p className="muted-13">Không có cảnh báo nào.</p>
            </div>
          )}
          {warnings.map((hub) => (
            <div
              key={hub.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#FDECEC] px-4 py-3 dark:bg-red-500/10"
            >
              <p className="text-[14px] font-medium text-[#C04343] dark:text-red-300">
                {hub.name}:{' '}
                {freeParking(hub) === 0
                  ? 'bãi đỗ đã hết chỗ — cần điều hướng người dùng'
                  : hub.status === 'warning'
                    ? 'quá tải — cần điều phối'
                    : 'không còn xe khả dụng'}
              </p>
              <Link to={`/operator/hub?hub=${hub.id}`} className="text-[13px] font-semibold text-[#C04343] dark:text-red-300">
                Xử lý →
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
