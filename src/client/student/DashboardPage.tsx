import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PageHeader } from '@/client/shared/components/PageHeader';
import { useAppStore } from '@/client/api/useAppStore';
import { useAuthStore } from '@/client/api/useAuthStore';
import { useMyBookings } from '@/client/api/useMyData';

const statusLabel = {
  reserved: 'Đã xác nhận',
  picked_up: 'Đang sử dụng',
  completed: 'Hoàn tất',
  cancelled: 'Đã hủy',
} as const;

export function DashboardPage() {
  const user = useAuthStore((state) => state.currentUser);
  const hubs = useAppStore((state) => state.hubs);
  const vehicles = useAppStore((state) => state.vehicles);
  const bookings = useMyBookings();

  const availableVehicles = vehicles.filter((vehicle) => vehicle.status === 'available');
  const freeParking = hubs.reduce((sum, hub) => sum + (hub.capacity - hub.occupiedParking), 0);
  const freeChargers = hubs.reduce((sum, hub) => sum + (hub.chargers - hub.activeCharging), 0);
  const activeBookings = bookings.filter(
    (booking) => booking.status === 'reserved' || booking.status === 'picked_up',
  );

  // Lịch gần nhất trong các lịch còn hiệu lực.
  const upcoming = [...activeBookings].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )[0];

  const minutesLeft = upcoming
    ? Math.max(
        0,
        Math.round(
          (new Date(upcoming.expiresAt ?? upcoming.createdAt).getTime() - Date.now()) / 60_000,
        ),
      )
    : 0;

  const stats = [
    {
      label: 'Xe khả dụng',
      value: `${availableVehicles.length} xe`,
      hint: `Tại ${hubs.length} HUB`,
      tone: 'text-[#18794E]',
      to: '/student/dat-xe',
    },
    {
      label: 'Chỗ đỗ trống',
      value: `${freeParking} chỗ`,
      hint: `Trong ${hubs.length} HUB`,
      tone: 'text-[#2563EB]',
      to: '/student/cho-do',
    },
    {
      label: 'Trạm sạc trống',
      value: `${freeChargers} trạm`,
      hint: 'Sẵn sàng đặt',
      tone: 'text-[#18794E]',
      to: '/student/dat-sac',
    },
    {
      label: 'Lịch đang hoạt động',
      value: `${activeBookings.length} lịch`,
      hint: 'Xe + sạc',
      tone: 'text-[#B45309]',
      to: '/student/lich-cua-toi',
    },
  ];

  const services = [
    { title: 'Đặt xe', description: 'Chọn xe và HUB nhận', to: '/student/dat-xe' },
    { title: 'Đặt chỗ đỗ', description: 'Giữ chỗ tại HUB', to: '/student/cho-do' },
    { title: 'Đặt lịch sạc', description: 'Chọn trạm & khung giờ', to: '/student/dat-sac' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Xin chào, ${user?.fullName ?? 'bạn'}`}
        subtitle="Quản lý phương tiện và đặt dịch vụ tại các HUB trong khu đô thị ĐHQG."
      />

      <section className="grid grid-cols-2 gap-5 xl:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            to={stat.to}
            className="card py-4 transition hover:border-accent/40 hover:shadow-sm"
          >
            <p className="text-[13px] text-muted dark:text-slate-400">{stat.label}</p>
            <p className="mt-2 text-[30px] font-bold leading-none text-ink dark:text-slate-100">
              {stat.value}
            </p>
            <p className={`mt-2 text-xs font-medium ${stat.tone} dark:opacity-90`}>{stat.hint}</p>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="section-title mb-3">Dịch vụ nhanh</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {services.map((service) => (
            <Link
              key={service.to}
              to={service.to}
              className="card group transition hover:border-accent/40 hover:shadow-sm"
            >
              <p className="text-[15px] font-semibold text-ink dark:text-slate-100">
                {service.title}
              </p>
              <p className="muted-13 mt-1">{service.description}</p>
              <p className="link-green mt-3 flex items-center gap-1">
                Mở dịch vụ
                <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">HUB gần bạn</h2>
          <Link to="/student/hub" className="link-green flex items-center gap-1">
            Xem tất cả
            <ArrowRight size={14} />
          </Link>
        </div>
        <div className="space-y-3">
          {hubs.slice(0, 3).map((hub) => {
            const hubVehicles = vehicles.filter(
              (vehicle) => vehicle.hubId === hub.id && vehicle.status === 'available',
            ).length;
            const freeSpots = hub.capacity - hub.occupiedParking;
            const full = freeSpots <= 0;
            return (
              <Link
                key={hub.id}
                to={`/student/dat-xe?hub=${hub.id}`}
                className="card-row transition hover:border-accent/40 hover:shadow-sm"
              >
                <div>
                  <p className="text-[15px] font-semibold text-ink dark:text-slate-100">
                    {hub.name}
                  </p>
                  <p className="muted-13 mt-1">
                    {hubVehicles} xe • {freeSpots} chỗ • {hub.chargers - hub.activeCharging} sạc
                  </p>
                </div>
                <span className={full ? 'pill-orange' : 'pill-green'}>
                  {full ? 'Đầy chỗ' : 'Đang hoạt động'}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Lịch sắp tới</h2>
          <Link to="/student/lich-cua-toi" className="link-green flex items-center gap-1">
            Quản lý lịch
            <ArrowRight size={14} />
          </Link>
        </div>
        {upcoming ? (
          <Link
            to="/student/lich-cua-toi"
            className="card-row transition hover:border-accent/40 hover:shadow-sm"
          >
            <div>
              <p className="text-[15px] font-semibold text-ink dark:text-slate-100">
                Xe {vehicles.find((vehicle) => vehicle.id === upcoming.vehicleId)?.code ?? '—'} •{' '}
                {hubs.find((hub) => hub.id === upcoming.hubId)?.name ?? '—'}
              </p>
              <p className="muted-13 mt-1">
                {minutesLeft > 0
                  ? `Hết hạn trong ${minutesLeft} phút`
                  : 'Đã quá thời gian giữ chỗ'}
              </p>
            </div>
            <span className="pill-blue">{statusLabel[upcoming.status]}</span>
          </Link>
        ) : (
          <div className="card-row">
            <p className="muted-13">Bạn chưa có lịch nào. Đặt xe để bắt đầu.</p>
            <Link to="/student/dat-xe" className="link-green">
              Đặt xe ngay
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
