import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App as AntApp, Button, InputNumber, Modal } from 'antd';
import { PageHeader } from '../../components/PageHeader';
import { useAppStore } from '../../stores/useAppStore';

export function DispatchPage() {
  const { message } = AntApp.useApp();
  const [params] = useSearchParams();
  const hubs = useAppStore((state) => state.hubs);
  const vehicles = useAppStore((state) => state.vehicles);
  const dispatchVehicles = useAppStore((state) => state.dispatchVehicles);

  const [needId, setNeedId] = useState(params.get('to') ?? hubs[0]?.id ?? '');
  const [supplyId, setSupplyId] = useState(params.get('from') ?? '');
  const [quantity, setQuantity] = useState(1);
  const [picker, setPicker] = useState<'need' | 'supply' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const need = hubs.find((hub) => hub.id === needId) ?? null;
  const supply = hubs.find((hub) => hub.id === supplyId) ?? null;

  const availableAt = (hubId: string) =>
    vehicles.filter((vehicle) => vehicle.hubId === hubId && vehicle.status === 'available').length;

  const suggestions = useMemo(
    () =>
      hubs
        .filter((hub) => hub.id !== needId && availableAt(hub.id) > 0)
        .sort((a, b) => availableAt(b.id) - availableAt(a.id))
        .slice(0, 4),
    [hubs, vehicles, needId],
  );

  const openConfirm = () => {
    if (!need) {
      message.warning('Vui lòng chọn Hub cần xe.');
      return;
    }
    if (!supply) {
      message.warning('Vui lòng chọn Hub cung cấp xe.');
      return;
    }
    setError(null);
    setConfirmOpen(true);
  };

  const handleDispatch = () => {
    const result = dispatchVehicles({ fromHubId: supplyId, toHubId: needId, quantity });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setConfirmOpen(false);
    setSuccess(result.message);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Điều phối xe giữa các Hub"
        subtitle="Điều phối xe qua lại giữa các Hub để tránh hết xe tại các Hub."
      />

      <div className="card">
        <p className="muted-13">Chọn Hub cần xe / Hub cung cấp xe / Số lượng xe điều phối giữa 2 Hub</p>

        <div className="mt-4 space-y-3">
          <button
            type="button"
            onClick={() => setPicker('need')}
            className="flex w-full items-center gap-4 rounded-lg border border-line bg-white px-4 py-3 text-left dark:border-slate-800 dark:bg-slate-900"
          >
            <span className="w-28 shrink-0 text-[13px] text-muted dark:text-slate-400">Hub cần xe</span>
            <span className="h-8 w-px bg-line dark:bg-slate-700" />
            <span
              className={`text-[14px] font-semibold ${
                need ? 'text-ink dark:text-slate-100' : 'text-muted dark:text-slate-400'
              }`}
            >
              {need?.name ?? 'Chọn Hub cần xe'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setPicker('supply')}
            className="flex w-full items-center gap-4 rounded-lg border border-line bg-white px-4 py-3 text-left dark:border-slate-800 dark:bg-slate-900"
          >
            <span className="w-28 shrink-0 whitespace-nowrap text-[13px] text-muted dark:text-slate-400">
              Hub cung cấp xe
            </span>
            <span className="h-8 w-px bg-line dark:bg-slate-700" />
            <span
              className={`text-[14px] font-semibold ${
                supply ? 'text-ink dark:text-slate-100' : 'text-muted dark:text-slate-400'
              }`}
            >
              {supply?.name ?? 'Chọn Hub cung cấp xe'}
            </span>
          </button>

          <div className="flex items-center gap-4 rounded-lg border border-line bg-white px-4 py-1.5 dark:border-slate-800 dark:bg-slate-900">
            <span className="w-28 shrink-0 text-[13px] text-muted dark:text-slate-400">Số lượng xe</span>
            <span className="h-8 w-px bg-line dark:bg-slate-700" />
            <InputNumber
              min={1}
              value={quantity}
              onChange={(value) => setQuantity(value ?? 1)}
              variant="borderless"
              className="text-[14px] font-semibold"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="primary" size="large" onClick={openConfirm}>
            Gửi lệnh điều phối
          </Button>
        </div>
      </div>

      <div className="card max-w-[820px]">
        <p className="muted-13 mb-3">Các Hub còn xe gần Hub cần xe</p>
        <div className="space-y-2">
          {suggestions.map((hub) => (
            <button
              key={hub.id}
              type="button"
              onClick={() => setSupplyId(hub.id)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition ${
                hub.id === supplyId
                  ? 'border-[#102A43] bg-[#EAF7EF] dark:bg-emerald-500/10'
                  : 'border-line bg-white hover:border-accent/50 dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <span className="text-[14px] font-semibold text-ink dark:text-slate-100">{hub.name}</span>
              <span className="text-[13px] text-[#18794E]">{availableAt(hub.id)} xe</span>
            </button>
          ))}
          {suggestions.length === 0 && <p className="muted-13">Không có Hub nào còn xe để điều phối.</p>}
        </div>
      </div>

      <Modal open={picker !== null} onCancel={() => setPicker(null)} footer={null} centered width={560}>
        <h3 className="text-[19px] font-bold text-ink dark:text-slate-100">
          {picker === 'need' ? 'Chọn Hub cần xe' : 'Chọn Hub cung cấp xe'}
        </h3>
        <div className="mt-4 space-y-2">
          {hubs.map((hub) => (
            <button
              key={hub.id}
              type="button"
              onClick={() => {
                if (picker === 'need') setNeedId(hub.id);
                else setSupplyId(hub.id);
                setPicker(null);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 text-left transition hover:border-accent/50 dark:border-slate-800"
            >
              <span className="text-[14px] font-semibold text-ink dark:text-slate-100">{hub.name}</span>
              <span className="text-[13px] text-[#18794E]">{availableAt(hub.id)} xe</span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={confirmOpen} onCancel={() => setConfirmOpen(false)} footer={null} centered width={560}>
        <h3 className="text-[20px] font-bold text-ink dark:text-slate-100">Xác nhận điều phối xe</h3>

        <div className="mt-4 rounded-2xl bg-[#102A43] p-6 text-white">
          <p className="text-[17px] font-bold">Chi tiết điều phối</p>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Hub cần xe</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{need?.name}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Hub cung cấp xe</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{supply?.name}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#AFC1D4]">Số lượng xe</dt>
              <dd className="mt-0.5 text-[14px] font-semibold">{quantity} xe</dd>
            </div>
          </dl>
        </div>

        {error && <p className="mt-3 text-[13px] text-red-500">{error}</p>}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setConfirmOpen(false)}>Thoát</Button>
          <Button type="primary" onClick={handleDispatch}>
            Điều phối
          </Button>
        </div>
      </Modal>

      <Modal open={success !== null} onCancel={() => setSuccess(null)} footer={null} centered width={480}>
        <h3 className="text-[20px] font-bold text-[#18794E]">Điều phối thành công</h3>
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
