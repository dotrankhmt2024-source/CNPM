import { useUiStore } from '../state/useUiStore';

const en: Record<string, string> = {
  'Tổng quan': 'Overview', 'Tìm kiếm Hub': 'Find a Hub', 'Đặt xe': 'Book a vehicle',
  'Đặt chỗ đỗ': 'Reserve parking', 'Đặt lịch sạc': 'Book charging', 'Quản lý HUB': 'Manage Hubs',
  'Điều phối xe': 'Vehicle dispatch', 'Điều hướng người dùng': 'User redirection',
  'Lập lịch sạc ưu tiên': 'Priority charging', 'Mô phỏng kịch bản': 'What-if simulation',
  'Cài đặt hệ thống': 'Settings', 'Trợ giúp': 'Help', 'Đơn vị vận hành': 'Operator', 'Sinh viên': 'Student',
  'Chưa hỗ trợ trong bản demo.': 'Not available in this demo.',
};

export function useTranslation() {
  const language = useUiStore(s => s.language);
  return (vi: string, english?: string) => language === 'en' ? english ?? en[vi] ?? vi : vi;
}
