import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App as AntApp, Button, Input } from 'antd';
import { MapPin, Search } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { useAppStore } from '../../stores/useAppStore';

const blackPill =
  'rounded-full bg-[#0B1220] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1B2A3D]';

export function HubSearchPage() {
  const { message } = AntApp.useApp();
  const hubs = useAppStore((state) => state.hubs);
  const vehicles = useAppStore((state) => state.vehicles);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState<{ from: string; to: string } | null>(null);
  const [selectedHubId, setSelectedHubId] = useState<string | null>(null);

  const selectedHub = hubs.find((hub) => hub.id === selectedHubId) ?? null;

  const countAvailable = (hubId: string) =>
    vehicles.filter((vehicle) => vehicle.hubId === hubId && vehicle.status === 'available').length;

  /**
   * Demo chưa có dữ liệu bản đồ: nếu chữ người dùng nhập khớp tên/khu vực Hub thì ưu tiên Hub đó,
   * nếu không khớp gì thì chia danh sách thành 2 nhóm mô phỏng "gần điểm đi" / "gần điểm đến".
   * Chỉ tính lại khi bấm "Tìm kiếm Hub" (query), không chạy theo từng ký tự đang gõ.
   */
  const groups = useMemo(() => {
    const matches = (hub: (typeof hubs)[number], text: string) => {
      const keyword = text.trim().toLowerCase();
      if (!keyword) return false;
      return `${hub.name} ${hub.location}`.toLowerCase().includes(keyword);
    };

    const fromText = query?.from ?? '';
    const toText = query?.to ?? '';

    let nearFrom = hubs.filter((hub) => matches(hub, fromText));
    let nearTo = hubs.filter((hub) => matches(hub, toText) && !nearFrom.includes(hub));
    const hadMatch = nearFrom.length > 0 || nearTo.length > 0;

    if (!hadMatch) {
      nearFrom = hubs.slice(0, 2);
      nearTo = hubs.slice(2);
    } else if (nearFrom.length === 0) {
      nearFrom = hubs.filter((hub) => !nearTo.includes(hub)).slice(0, 2);
    } else if (nearTo.length === 0) {
      nearTo = hubs.filter((hub) => !nearFrom.includes(hub)).slice(0, 2);
    }

    return { nearFrom, nearTo, hadMatch };
  }, [hubs, query]);

  const handleSearch = () => {
    if (!from.trim() && !to.trim()) {
      message.warning('Vui lòng nhập điểm đi hoặc điểm đến trước khi tìm.');
      return;
    }
    setQuery({ from: from.trim(), to: to.trim() });
    setSelectedHubId(null);
  };

  if (selectedHub) {
    const freeSpots = selectedHub.capacity - selectedHub.occupiedParking;
    const freeChargers = selectedHub.chargers - selectedHub.activeCharging;

    return (
      <div className="space-y-6">
        <PageHeader title="Tìm kiếm Hub" subtitle="Tìm Hub và xem thông tin tại từng Hub." />

        <div className="card flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="muted-13">Tên Hub</p>
            <p className="mt-1 text-[16px] font-semibold text-ink dark:text-slate-100">
              {selectedHub.name}
            </p>
          </div>
          <Button onClick={() => setSelectedHubId(null)}>Chọn Hub khác</Button>
        </div>

        <section>
          <h2 className="section-title mb-3">Đặt xe</h2>
          <div className="card-row">
            <div>
              <p className="text-[15px] font-semibold text-ink dark:text-slate-100">Xe máy điện</p>
              <p className="muted-13 mt-1">
                Xe máy điện sẵn sàng tại Hub, giữ chỗ trong 5 phút kể từ khi bạn đặt.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[15px] font-semibold text-ink dark:text-slate-100">
                {countAvailable(selectedHub.id)} xe
              </span>
              <Link to={`/student/dat-xe?hub=${selectedHub.id}`} className={blackPill}>
                Đặt ngay
              </Link>
            </div>
          </div>
        </section>

        <section>
          <h2 className="section-title mb-3">Đặt chỗ đỗ</h2>
          <div className="card-row">
            <div>
              <p className="text-[15px] font-semibold text-ink dark:text-slate-100">
                Chỗ đỗ trong bãi
              </p>
              <p className="muted-13 mt-1">Chỗ đỗ trong bãi xe của Hub, đặt lịch đỗ xe ngay.</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[15px] font-semibold text-ink dark:text-slate-100">
                {freeSpots} chỗ đỗ
              </span>
              <Link to="/student/cho-do" className={blackPill}>
                Đặt ngay
              </Link>
            </div>
          </div>
        </section>

        <section>
          <h2 className="section-title mb-3">Đặt lịch sạc</h2>
          <div className="card-row">
            <div>
              <p className="text-[15px] font-semibold text-ink dark:text-slate-100">Cổng sạc</p>
              <p className="muted-13 mt-1">Cổng sạc nhanh lên tới 120kW, đặt lịch sạc ngay.</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[15px] font-semibold text-ink dark:text-slate-100">
                {freeChargers} cổng sạc
              </span>
              <Link to="/student/dat-sac" className={blackPill}>
                Đặt ngay
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const renderHubButton = (hub: (typeof hubs)[number]) => (
    <button
      key={hub.id}
      type="button"
      onClick={() => setSelectedHubId(hub.id)}
      className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-3 text-left transition hover:border-accent/50 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <span className="text-[14px] font-semibold text-ink dark:text-slate-100">{hub.name}</span>
      <span className="text-[13px] font-medium text-[#18794E]">{countAvailable(hub.id)} xe</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Tìm kiếm Hub" subtitle="Tìm Hub và xem thông tin tại từng Hub." />

      <div className="card">
        <p className="muted-13 mb-3">Tìm Hub</p>

        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
            <span className="w-14 shrink-0 text-[13px] text-muted dark:text-slate-400">Đi từ</span>
            <MapPin size={16} className="shrink-0 text-muted" />
            <Input
              variant="borderless"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              onPressEnter={handleSearch}
              placeholder="Ví dụ: Trường Đại học Bách Khoa TP.HCM"
            />
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
            <span className="w-14 shrink-0 text-[13px] text-muted dark:text-slate-400">Đi đến</span>
            <MapPin size={16} className="shrink-0 text-muted" />
            <Input
              variant="borderless"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              onPressEnter={handleSearch}
              placeholder="Ví dụ: KTX khu B - ĐHQG TP.HCM"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="primary" icon={<Search size={15} />} onClick={handleSearch}>
            Tìm kiếm Hub
          </Button>
        </div>
      </div>

      {query ? (
        <>
          <div className="card space-y-4">
            <p className="muted-13">
              Kết quả cho:{' '}
              <span className="font-medium text-ink dark:text-slate-200">
                {query.from || 'mọi điểm đi'}
              </span>{' '}
              →{' '}
              <span className="font-medium text-ink dark:text-slate-200">
                {query.to || 'mọi điểm đến'}
              </span>
            </p>

            {!groups.hadMatch && (
              <p className="muted-13">
                Không có Hub nào khớp chính xác điểm đi/đến, đang hiển thị toàn bộ Hub (demo).
              </p>
            )}

            <div>
              <p className="muted-13 mb-2">Các Hub gần điểm đi</p>
              <div className="space-y-2">
                {groups.nearFrom.map(renderHubButton)}
                {groups.nearFrom.length === 0 && (
                  <p className="muted-13">Không có Hub nào gần điểm đi.</p>
                )}
              </div>
            </div>

            <div>
              <p className="muted-13 mb-2">Các Hub gần điểm đến</p>
              <div className="space-y-2">
                {groups.nearTo.map(renderHubButton)}
                {groups.nearTo.length === 0 && (
                  <p className="muted-13">Không có Hub nào gần điểm đến.</p>
                )}
              </div>
            </div>
          </div>

          <p className="muted-13">
            Bản demo chưa có dữ liệu bản đồ: danh sách được chia thành 2 nhóm mô phỏng "gần điểm đi" và
            "gần điểm đến". Bấm vào một Hub để xem chi tiết và đặt dịch vụ.
          </p>
        </>
      ) : (
        <div className="card">
          <p className="muted-13">
            Nhập điểm đi và/hoặc điểm đến rồi bấm "Tìm kiếm Hub" để xem danh sách Hub phù hợp.
          </p>
        </div>
      )}
    </div>
  );
}
