/**
 * Persistence — cài đặt IPersistence, lớp đệm giữa nghiệp vụ và DataStore.
 *
 * Mọi component nghiệp vụ đọc/ghi dữ liệu qua đây, nhờ vậy có thể thay DataStore
 * (localStorage → REST API → database thật) mà không sửa service nào.
 */
import type { IDataSource, IPersistence } from '@/contracts/Platform';
import { createInitialData } from '@/demo/seed';
import type { AppData } from '@/shared/types/domain';

export class Persistence implements IPersistence {
  constructor(private readonly source: IDataSource) {}

  load(): AppData {
    return this.source.read();
  }

  save(patch: Partial<AppData>): void {
    this.source.write(patch);
  }

  replaceAll(data: AppData): void {
    this.source.replaceAll(data);
  }

  subscribe(listener: (data: AppData) => void): () => void {
    return this.source.subscribe(listener);
  }

  reset(): void {
    this.source.replaceAll(createInitialData());
  }
}
