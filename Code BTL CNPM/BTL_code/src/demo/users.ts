import type { MockAccount } from '@/shared/types/auth';

/** Tài khoản DEMO. Không sử dụng mật khẩu thật. */
export const mockUsers: MockAccount[] = [
  {
    id: 'student-001',
    fullName: 'Sinh viên Demo',
    email: 'student@demo.local',
    password: 'Student123!',
    role: 'student',
    createdAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'operator-001',
    fullName: 'Nhà điều hành Demo',
    email: 'operator@demo.local',
    password: 'Operator123!',
    role: 'operator',
    createdAt: '2026-11-01T00:00:00.000Z',
  },
];
