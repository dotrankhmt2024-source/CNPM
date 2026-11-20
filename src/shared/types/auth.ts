export type UserRole = 'student' | 'operator';

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

// Chỉ dành cho MVP giả lập, tuyệt đối không dùng để lưu tài khoản thật.
export interface MockAccount extends User {
  password: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends LoginCredentials {
  fullName: string;
  confirmPassword: string;
}

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; message: string };
