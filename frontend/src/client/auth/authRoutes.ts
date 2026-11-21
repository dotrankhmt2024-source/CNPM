import type { UserRole } from '@/shared/types/auth';

/** Trang chủ tương ứng với từng vai trò sau khi đăng nhập. */
export const homeFor = (role: UserRole) => (role === 'operator' ? '/operator' : '/student');

export const roleLabel: Record<UserRole, string> = {
  student: 'Sinh viên',
  operator: 'Nhà điều hành',
};
