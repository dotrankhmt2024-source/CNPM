/**
 * DataStore — nguồn lưu trữ dữ liệu của hệ thống (thay cho database trong bản demo).
 *
 * Chỉ tầng Platform biết dữ liệu được giữ trong bộ nhớ và đồng bộ xuống localStorage.
 * Các subsystem nghiệp vụ chỉ nhìn thấy IDataSource / IPersistence.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createInitialData } from '@/demo/seed';
import type { IDataSource } from '@/contracts/Platform';
import type { AppData } from '@/shared/types/domain';

/** Giữ nguyên khoá lưu trữ để dữ liệu demo của người dùng cũ vẫn đọc được. */
export const STORAGE_KEY = 'smart-emobility-demo-v7';

export const appDataStore = create<AppData>()(
  persist(() => createInitialData(), { name: STORAGE_KEY }),
);

/** Cài đặt IDataSource trên nguồn dữ liệu thật của bản demo. */
export class LocalDataSource implements IDataSource {
  read(): AppData {
    return appDataStore.getState();
  }

  write(patch: Partial<AppData>): void {
    appDataStore.setState(patch);
  }

  replaceAll(data: AppData): void {
    appDataStore.setState(data, true);
  }

  subscribe(listener: (data: AppData) => void): () => void {
    return appDataStore.subscribe((state) => listener(state));
  }
}
