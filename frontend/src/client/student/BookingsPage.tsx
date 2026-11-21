import { Link } from 'react-router-dom';
import { App as AntApp, Button } from 'antd';
import { PageHeader } from '@/client/shared/components/PageHeader';
import { useAppStore } from '@/client/api/useAppStore';
import { useMyBookings } from '@/client/api/useMyData';

const statusLabel = {
  reserved: 'Đã xác nhận',
  picked_up: 'Đang sử dụng',
  completed: 'Hoàn tất',
  cancelled: 'Đã hủy',
} as const;

const statusClass = {
  reserved: 'pill-blue',
  picked_up: 'pill-green',
  completed:
    'rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  cancelled: 'pill-orange',
} as const;

export function BookingsPage() {
  const { message } = AntApp.useApp();
  const hubs = useAppStore((state) => state.hubs);
  const vehicles = useAppStore((state) => state.vehicles);
  const bookings = useMyBookings();
  const cancelBooking = useAppStore((state) => state.cancelBooking);

  const handleCancel = async (bookingId: string) => {
    const result = await cancelBooking(bookingId);
    if (result.ok) message.success(result.message);
    else message.error(result.message);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lịch của tôi"
        subtitle="Các lượt đặt xe gần đây. Mã nhận/trả xe được dùng ở trang Đặt xe điện."
      />

      {bookings.length === 0 ? (
        <div className="card">
          <p className="muted-13">
            Bạn chưa có lượt đặt nào.{' '}
            <Link to="/student/dat-xe" className="link-green">
              Đặt xe ngay
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => {
            const vehicle = vehicles.find((item) => item.id === booking.vehicleId);
            return (
              <div key={booking.id} className="card-row">
                <div>
                  <p className="text-[15px] font-semibold text-ink dark:text-slate-100">
                    Xe {vehicle?.code ?? '—'} • {vehicle?.model ?? ''}
                    <span className="ml-2 text-[13px] font-normal text-muted dark:text-slate-400">
                      {hubs.find((hub) => hub.id === booking.hubId)?.name}
                    </span>
                  </p>
                  <p className="muted-13 mt-1">
                    {new Date(booking.createdAt).toLocaleString('vi-VN')}
                    {booking.status === 'reserved' && booking.pickupCode
                      ? ` · Mã: ${booking.pickupCode}`
                      : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={statusClass[booking.status]}>{statusLabel[booking.status]}</span>

                  {(booking.status === 'reserved' || booking.status === 'picked_up') && (
                    <Link to="/student/dat-xe">
                      <Button type="primary">
                        {booking.status === 'reserved' ? 'Nhận xe' : 'Trả xe'}
                      </Button>
                    </Link>
                  )}

                  {booking.status === 'reserved' && (
                    <Button onClick={() => handleCancel(booking.id)}>Hủy</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
