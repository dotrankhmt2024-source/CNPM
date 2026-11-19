import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App as AntApp, Button, Modal, Select } from 'antd';
import { PageHeader } from '../../components/PageHeader';
import { useAppStore } from '../../stores/useAppStore';
import { freeParking, hubStatusClass, hubStatusLabel } from './hubStatus';

export function RoutingPage() {
  const { message } = AntApp.useApp();
  const [params] = useSearchParams();
  const hubs = useAppStore((state) => state.hubs);

  const [overloadedId, setOverloadedId] = useState(
    params.get('hub') ?? hubs.find((hub) => hub.status !== 'normal')?.id ?? hubs[0]?.id ?? '',
  );
  const [targetId, setTargetId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const overloaded = hubs.find((hub) => hub.id === overloadedId) ?? null;
  const target = hubs.find((hub) => hub.id === targetId) ?? null;
  const alternatives = hubs.filter((hub) => hub.id !== overloadedId && freeParking(hub) > 0);

  const openConfirm = () => {
    if (!target) {
      message.warning('Vui lòng chọn Hub thay thế.');
      return;
    }
    setConfirmOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Điều hướng người dùng đến các Hub"
        subtitle="Điều hướng người dùng đến Hub thay thế khi Hub hiện tại bị quá tải."
      />

      <div className="card">
        <p className="muted-13">Chọn Hub quá tải / Danh sách Hub thay thế</p>

        <div className="mt-4 flex items-center gap-4 rounded-lg border border-line bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <span className="w-24 shrink-0 text-[13px] text-muted dark:text-slate-400">Hub quá tải</span>
          <span className="h-8 w-px bg-line dark:bg-slate-700" />
          <Select
            value={overloadedId}
            onChange={(value) => {
              setOverloadedId(value);
              setTargetId(null);
            }}
            variant="borderless"
            className="min-w-[320px] text-[14px] font-semibold"
            options={hubs.map((hub) => ({ value: hub.id, label: hub.name }))}
          />
          {overloaded && (
            <span className={`${hubStatusClass[overloaded.status]} ml-auto`}>
              {hubStatusLabel[overloaded.status]}
            </span>
          )}
        </div>

        <div className="mt-5 rounded-xl border border-line p-4 dark:border-slate-800">
          <p className="muted-13 mb-3">Các Hub còn chỗ đỗ gần Hub hiện tại</p>
          <div className="space-y-2">
            {alternatives.map((hub) => (
              <button
                key={hub.id}
                type="button"
                onClick={() => setTargetId(hub.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition ${
                  hub.id === targetId
                    ? 'border-[#102A43] bg-[#EAF7EF] dark:bg-emerald-500/10'
                    : 'border-line bg-white hover:border-accent/50 dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <span className="text-[14px] font-semibold text-ink dark:text-slate-100">
                  {hub.name}
                </span>
                <span className="text-[13px] text-[#18794E]">{freeParking(hub)} chỗ</span>
              </button>
            ))}
            {alternatives.length === 0 && (
              <p className="muted-13">Không có Hub nào còn chỗ đỗ.</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="primary" size="large" onClick={openConfirm}>
            Gửi lệnh điều hướng
          </Button>
        </div>
      </div>

      <Modal open={confirmOpen} onCancel={() => setConfirmOpen(false)} footer={null} centered width={540}>
        <h3 className="text-[20px] font-bold text-ink dark:text-slate-100">
          Xác nhận điều hướng người dùng
        </h3>

        <div className="mt-4 rounded-2xl bg-[#102A43] p-6 text-white">
          <p className="text-[17px] font-bold">Chi tiết điều hướng</p>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Hub quá tải</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{overloaded?.name}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Hub thay thế</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{target?.name}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Chỗ đỗ còn trống</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{target ? freeParking(target) : 0} chỗ</dd>
            </div>
          </dl>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setConfirmOpen(false)}>Thoát</Button>
          <Button
            type="primary"
            onClick={() => {
              setConfirmOpen(false);
              setSuccess(`Đã gửi lệnh điều hướng người dùng từ ${overloaded?.name} tới ${target?.name}.`);
            }}
          >
            Điều hướng
          </Button>
        </div>
      </Modal>

      <Modal open={success !== null} onCancel={() => setSuccess(null)} footer={null} centered width={480}>
        <h3 className="text-[20px] font-bold text-[#18794E]">Điều hướng thành công</h3>
        <p className="mt-3 text-[14px] text-ink dark:text-slate-200">{success}</p>
        <div className="mt-6 flex justify-end">
          <Button type="primary" onClick={() => setSuccess(null)}>
            Đóng
          </Button>
        </div>
      </Modal>
    </div>
  );
}
