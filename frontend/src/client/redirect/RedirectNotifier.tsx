import { App as AntApp, Button } from 'antd';
import { ArrowRight, Navigation } from 'lucide-react';
import { REDIRECT_KIND_LABEL } from '@/shared/domain/redirectMath';
import { useAppStore } from '@/client/api/useAppStore';
import { useAuthStore } from '@/client/api/useAuthStore';

/**
 * Thông báo điều hướng phía sinh viên (bước 5–6 của use case "Điều hướng người dùng
 * đến Hub thay thế"). Component độc lập, chỉ được gắn vào khung ứng dụng khi người
 * đăng nhập là sinh viên — không thay đổi trang nào của phân hệ sinh viên.
 *  - Đề xuất cá nhân (lịch đặt tại Hub quá tải): Đồng ý → chuyển lịch sang Hub mới,
 *    Bỏ qua → giữ nguyên lịch và cảnh báo nguy cơ chờ lâu.
 *  - Phương án đang hiệu lực: gợi ý chung cho sinh viên chưa có lịch đặt; sinh viên cũng
 *    chọn Đồng ý / Bỏ qua (Bỏ qua → cảnh báo nguy cơ chờ lâu), lựa chọn được ghi nhận.
 */
export function RedirectNotifier() {
  const { message, notification } = AntApp.useApp();
  const hubs = useAppStore((state) => state.hubs);
  const plans = useAppStore((state) => state.redirectPlans);
  const offers = useAppStore((state) => state.redirectOffers);
  const acceptRedirectionOffer = useAppStore((state) => state.acceptRedirectionOffer);
  const rejectRedirectionOffer = useAppStore((state) => state.rejectRedirectionOffer);
  const respondToGeneralNotice = useAppStore((state) => state.respondToGeneralNotice);
  const studentName = useAuthStore((state) => state.currentUser?.fullName ?? 'Sinh viên');

  const shortName = (id: string) => hubs.find((hub) => hub.id === id)?.name.split(' - ')[0] ?? id;
  const pending = offers.filter((offer) => offer.status === 'PENDING');
  const notices = plans.filter(
    (plan) =>
      plan.status === 'ACTIVE' &&
      !pending.some((offer) => offer.planId === plan.id) &&
      !offers.some((offer) => offer.planId === plan.id && offer.kind === 'general' && offer.studentName === studentName),
  );
  if (pending.length === 0 && notices.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex w-[360px] max-w-[calc(100vw-2.5rem)] flex-col gap-3">
      {pending.map((offer) => {
        const plan = plans.find((item) => item.id === offer.planId);
        return (
          <div key={offer.id} className="rounded-2xl border border-amber-200 bg-white p-4 shadow-lg dark:border-amber-500/30 dark:bg-slate-900">
            <p className="flex items-center gap-2 text-[14px] font-bold text-ink dark:text-slate-100">
              <Navigation size={16} className="text-[#176B5B]" /> Đề xuất chuyển Hub
            </p>
            <p className="mt-2 text-[13px] text-ink dark:text-slate-200">
              <b>{shortName(offer.fromHubId)}</b> đang quá tải. Bạn có muốn chuyển {REDIRECT_KIND_LABEL[offer.kind].toLowerCase()} sang{' '}
              <b>{shortName(offer.toHubId)}</b> không?
            </p>
            <p className="muted-13 mt-1">{offer.refLabel}</p>
            {plan && (
              <p className="muted-13 mt-1 flex items-center gap-1">
                {shortName(offer.fromHubId)} <ArrowRight size={12} /> {shortName(offer.toHubId)} · {plan.targetSnapshot.distanceKm} km · còn{' '}
                {plan.targetSnapshot.freeParking} chỗ, {plan.targetSnapshot.freeChargers} cổng sạc
              </p>
            )}
            {plan?.note && <p className="mt-1 text-[12px] italic text-muted">“{plan.note}”</p>}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                onClick={async () => {
                  const result = await rejectRedirectionOffer(offer.id);
                  if (!result.ok) return message.error(result.message);
                  notification.warning({
                    message: 'Nguy cơ chờ đợi lâu',
                    description: `${result.warning} Lịch đặt ban đầu được giữ nguyên.`,
                    placement: 'topRight',
                    duration: 5,
                  });
                }}
              >
                Bỏ qua
              </Button>
              <Button
                type="primary"
                onClick={async () => {
                  const result = await acceptRedirectionOffer(offer.id);
                  if (!result.ok) return message.error(result.message);
                  result.moved ? message.success(result.message) : message.warning(result.message);
                }}
              >
                Đồng ý chuyển
              </Button>
            </div>
          </div>
        );
      })}

      {notices.map((plan) => (
        <div key={plan.id} className="rounded-2xl border border-amber-200 bg-white p-4 shadow-lg dark:border-amber-500/30 dark:bg-slate-900">
          <p className="flex items-center gap-2 text-[14px] font-bold text-ink dark:text-slate-100">
            <Navigation size={16} className="text-[#176B5B]" /> Gợi ý chuyển Hub
          </p>
          <p className="mt-2 text-[13px] text-ink dark:text-slate-200">
            <b>{shortName(plan.overloadedHubId)}</b> đang quá tải. Nên sử dụng <b>{shortName(plan.targetHubId)}</b> (cách{' '}
            {plan.targetSnapshot.distanceKm} km, còn {plan.targetSnapshot.freeParking} chỗ đỗ, {plan.targetSnapshot.freeChargers} cổng sạc).
          </p>
          {plan.note && <p className="mt-1 text-[12px] italic text-muted">“{plan.note}”</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              onClick={async () => {
                const result = await respondToGeneralNotice(plan.id, false);
                if (!result.ok) return message.error(result.message);
                notification.warning({
                  message: 'Nguy cơ chờ đợi lâu',
                  description: result.warning,
                  placement: 'topRight',
                  duration: 5,
                });
              }}
            >
              Bỏ qua
            </Button>
            <Button
              type="primary"
              onClick={async () => {
                const result = await respondToGeneralNotice(plan.id, true);
                result.ok ? message.success(result.message) : message.error(result.message);
              }}
            >
              Đồng ý chuyển
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
