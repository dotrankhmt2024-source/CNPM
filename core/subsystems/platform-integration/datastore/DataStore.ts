/**
 * DataStore phía client — chỉ còn là **read model** trong bộ nhớ.
 *
 * Dữ liệu thật nằm ở backend (SQLite). Client nạp `/api/state`, sau mỗi lệnh thì thay
 * bằng ảnh chụp `state` mà server trả về. Nhờ vậy:
 *  - mọi quy tắc nghiệp vụ do server quyết định,
 *  - hai tab / hai máy luôn thấy cùng một dữ liệu,
 *  - không còn tình trạng mỗi trình duyệt giữ một bản localStorage riêng.
 *
 * Các component vẫn đọc qua `useAppStore((s) => s.hubs)` như trước.
 */
import { create } from 'zustand';
import { createInitialData } from '@/demo/seed';
import type { IDataSource } from '@/contracts/Platform';
import type { AppData } from '@/shared/types/domain';

/** Ảnh chụp tạm trước khi server trả dữ liệu (App sẽ hiện màn hình chờ). */
export const appDataStore = create<AppData>()(() => createInitialData());

/** IDataSource trên read model — được gateway dùng để trả lời các truy vấn chỉ-đọc. */
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
