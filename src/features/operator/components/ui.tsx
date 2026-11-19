import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Modal, Radio } from 'antd';
import { useAppStore } from '../../../stores/useAppStore';
import { hubStatus, type HubStatus } from '../../../services/HubService';
import type { Hub } from '../../../types/domain';

export const pct = (n: number) => `${Math.round(n * 100)}%`;
export const formatTime = (d: Date) => d.toLocaleTimeString('vi-VN', { hour12: false });

export function PageHeader({ title, subtitle, extra }: { title: string; subtitle: string; extra?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3 lg:pr-56">
      <div>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>
      {extra}
    </div>
  );
}

const pillStyle: Record<HubStatus, string> = {
  normal: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  maintenance: 'bg-red-100 text-red-600',
};
const pillText: Record<HubStatus, string> = { normal: 'Bình thường', warning: 'Cảnh báo', maintenance: 'Bảo trì' };

export function StatusPill({ status }: { status: HubStatus }) {
  return <span className={`inline-block rounded-full px-4 py-1 text-xs font-semibold ${pillStyle[status]}`}>{pillText[status]}</span>;
}

export function StatCard({ label, value, sub, subClass }: { label: string; value: string; sub: string; subClass?: string }) {
  return (
    <div className="op-card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-[28px] font-bold leading-none text-ink">{value}</p>
      <p className={`mt-3 text-xs font-semibold ${subClass ?? 'text-accent'}`}>{sub}</p>
    </div>
  );
}

export function AlertRow({ children, action, tone = 'danger' }: { children: ReactNode; action?: ReactNode; tone?: 'danger' | 'warning' | 'ok' }) {
  const tones = { danger: 'bg-red-50 text-red-600', warning: 'bg-amber-50 text-amber-700', ok: 'bg-emerald-50 text-emerald-700' } as const;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-6 py-5 text-sm font-bold ${tones[tone]}`}>
      <div>{children}</div>
      {action}
    </div>
  );
}

/** Nút đen dạng viên thuốc ("Điều phối ngay", "Xem chi tiết"...). */
export function BlackPill({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full bg-black px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800">
      {children}
    </button>
  );
}

/** Ô "nhãn | giá trị" màu xám của các form điều phối / điều hướng. */
export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center rounded-xl border border-line bg-[#F5F7FA] px-4 py-2">
      <span className="w-24 shrink-0 text-xs font-semibold text-muted">{label}</span>
      <span className="mx-4 h-7 w-px bg-slate-400" />
      <div className="min-w-0 flex-1 font-bold">{children}</div>
    </div>
  );
}

/** Hộp thoại nền trắng bo tròn dùng chung. */
function Dialog({ open, width = 460, children }: { open: boolean; width?: number; children: ReactNode }) {
  return (
    <Modal open={open} footer={null} closable={false} centered width={width} maskClosable={false} styles={{ content: { borderRadius: 24, padding: 32 } }}>
      {children}
    </Modal>
  );
}

export interface DetailField {
  label: string;
  value: ReactNode;
}

/**
 * Hộp thoại "Chi tiết ..." (thẻ xanh navy).
 * - Có `onOk`: hiện hai nút Thoát / Xác nhận.
 * - Có `autoCloseSeconds`: hiện "Hộp thoại tự động đóng sau (Ns)" rồi tự gọi `onCancel`.
 */
export function DetailModal(props: {
  open: boolean;
  title: string;
  cardTitle: string;
  fields: DetailField[];
  okText?: string;
  onOk?: () => void;
  onCancel: () => void;
  autoCloseSeconds?: number;
}) {
  const { open, title, cardTitle, fields, okText, onOk, onCancel, autoCloseSeconds } = props;
  const [left, setLeft] = useState(autoCloseSeconds ?? 0);
  useEffect(() => {
    if (!open || !autoCloseSeconds) return;
    setLeft(autoCloseSeconds);
    const id = window.setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          onCancel();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoCloseSeconds]);

  return (
    <Dialog open={open}>
      <h2 className="mb-5 text-2xl font-bold text-ink">{title}</h2>
      <div className="rounded-3xl bg-[#334A60] p-7 text-white">
        <h3 className="mb-4 text-xl font-bold">{cardTitle}</h3>
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.label}>
              <p className="text-[11px] text-slate-300">{f.label}</p>
              <div className="text-sm font-bold leading-snug">{f.value}</div>
            </div>
          ))}
        </div>
      </div>
      {autoCloseSeconds ? (
        <p className="mt-6 text-center text-sm font-bold text-ink">Hộp thoại tự động đóng sau ({left}s)</p>
      ) : (
        <div className="mt-6 flex gap-4">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-line bg-white py-3 text-sm font-bold">
            Thoát
          </button>
          <button type="button" onClick={onOk} className="flex-1 rounded-xl bg-accent py-3 text-sm font-bold text-white hover:opacity-90">
            {okText ?? 'Xác nhận'}
          </button>
        </div>
      )}
    </Dialog>
  );
}

/** Hộp thoại thông báo đơn giản có tự đóng (ví dụ "Lưu kịch bản thành công"). */
export function NoticeModal({ open, title, onClose, seconds = 5 }: { open: boolean; title: string; onClose: () => void; seconds?: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (!open) return;
    setLeft(seconds);
    const id = window.setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          onClose();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seconds]);
  return (
    <Dialog open={open} width={420}>
      <h2 className="py-6 text-center text-2xl font-bold text-ink">{title}</h2>
      <div className="flex gap-4">
        <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-line bg-white py-3 text-sm font-bold">
          Thoát
        </button>
        <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-accent py-3 text-sm font-bold text-white">
          Tự động đóng ({left}s)
        </button>
      </div>
    </Dialog>
  );
}

/** Hộp thoại "Vui lòng nhập ..." (một ô nhập + Thoát / Gửi). */
export function InputModal({ open, title, children, onCancel, onSubmit, error }: { open: boolean; title: string; children: ReactNode; onCancel: () => void; onSubmit: () => void; error?: string | null }) {
  return (
    <Dialog open={open} width={480}>
      <h2 className="mb-5 text-center text-2xl font-bold text-ink">{title}</h2>
      <div>{children}</div>
      {error && <p className="mt-2 text-center text-sm font-semibold text-red-600">{error}</p>}
      <div className="mt-6 flex gap-4">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-line bg-white py-3 text-sm font-bold">
          Thoát
        </button>
        <button type="button" onClick={onSubmit} className="flex-1 rounded-xl bg-accent py-3 text-sm font-bold text-white hover:opacity-90">
          Gửi
        </button>
      </div>
    </Dialog>
  );
}

/** Một ô tham số: nhãn + giá trị (viên cam), cập nhật cuối, nút "Thay đổi tham số". */
export function ParamCell({ label, value, updatedAt, onChange, buttonText = 'Thay đổi tham số', extra }: { label: string; value: string; updatedAt: Date; onChange: () => void; buttonText?: string; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
      <div className="w-44 shrink-0">
        <p className="truncate text-xs text-muted" title={label}>{label}</p>
        <span className="mt-1.5 inline-block min-w-20 rounded-full bg-amber-50 px-4 py-1 text-center text-xs font-bold text-amber-700">{value}</span>
      </div>
      <div className="w-36 shrink-0">
        <p className="text-xs text-muted">Cập nhật cuối</p>
        <p className="mt-1.5 text-xs font-bold">{formatTime(updatedAt)} · vừa xong</p>
      </div>
      <div className="flex gap-2">
        <Button type="primary" size="small" onClick={onChange}>{buttonText}</Button>
        {extra}
      </div>
    </div>
  );
}

/**
 * Hub đang được chọn, lưu trong query `?hub=<id>` để các trang chuyển qua lại vẫn giữ lựa chọn.
 * Mặc định: Hub cảnh báo đầu tiên, nếu không có thì Hub đầu tiên.
 */
export function useSelectedHub() {
  const data = useAppStore();
  const [params, setParams] = useSearchParams();
  const hub = useMemo(() => {
    const id = params.get('hub');
    return data.hubs.find((h) => h.id === id) ?? data.hubs.find((h) => hubStatus(h) === 'warning') ?? data.hubs[0];
  }, [data, params]);
  const select = (id: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('hub', id);
      return next;
    });
  return { hub, select };
}

/** Modal "Vui lòng chọn Hub khác" (danh sách radio). */
export function HubPickerModal({ open, hubs, current, onClose, onPick }: { open: boolean; hubs: Hub[]; current: string; onClose: () => void; onPick: (id: string) => void }) {
  const [choice, setChoice] = useState(current);
  useEffect(() => setChoice(current), [current, open]);
  return (
    <Dialog open={open} width={460}>
      <h2 className="mb-4 text-2xl font-bold text-ink">Vui lòng chọn Hub khác</h2>
      <div className="max-h-72 overflow-y-auto rounded-xl border border-black p-3">
        <Radio.Group value={choice} onChange={(e) => setChoice(e.target.value)} className="flex flex-col gap-3">
          {hubs.map((h) => (
            <Radio key={h.id} value={h.id}>
              <span className="font-bold">{h.name} - {h.location}</span>
            </Radio>
          ))}
        </Radio.Group>
      </div>
      <div className="mt-6 flex gap-4">
        <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-line bg-white py-3 text-sm font-bold">Thoát</button>
        <button type="button" onClick={() => { onPick(choice); onClose(); }} className="flex-1 rounded-xl bg-accent py-3 text-sm font-bold text-white">Chọn</button>
      </div>
    </Dialog>
  );
}

/** Thanh thông tin Hub: tên, trạng thái, cập nhật cuối + "Chọn Hub khác" (+ nút phụ, + "Cập nhật trạng thái"). */
export function HubInfoBar({ hub, status, hubs, onPick, extra, onRefresh, compact }: { hub: Hub; status: HubStatus; hubs: Hub[]; onPick: (id: string) => void; extra?: ReactNode; onRefresh?: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  return (
    <>
      <div className={`op-card flex flex-wrap items-center gap-x-10 gap-y-4 p-6 ${compact ? 'max-w-3xl' : ''}`}>
        <div>
          <p className="text-xs text-muted">Tên Hub</p>
          <p className="mt-2 font-bold">{hub.name}</p>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted">Trạng thái HUB</p>
          <StatusPill status={status} />
        </div>
        <div className="mr-auto">
          <p className="text-xs text-muted">Cập nhật cuối</p>
          <p className="mt-2 text-sm font-bold">{formatTime(updatedAt)} · vừa xong</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setOpen(true)}>Chọn Hub khác</Button>
          {extra}
          {onRefresh && (
            <Button onClick={() => { setUpdatedAt(new Date()); onRefresh(); }}>Cập nhật trạng thái</Button>
          )}
        </div>
      </div>
      <HubPickerModal open={open} hubs={hubs} current={hub.id} onClose={() => setOpen(false)} onPick={onPick} />
    </>
  );
}
