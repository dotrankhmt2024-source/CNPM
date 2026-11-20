/**
 * NotificationService — component của subsystem Access & Identify.
 *
 * Cài đặt INotification để mọi subsystem gửi thông báo tới người dùng mà không cần
 * biết giao diện hiển thị ra sao. Trong bản demo, thông báo được giữ trong bộ nhớ
 * và Client có thể đăng ký nhận (subscribe) để hiển thị.
 */
import type { AppNotification, INotification, NotificationKind } from '@/contracts/AccessIdentity';

const MAX_ITEMS = 50;
let counter = 0;

export class NotificationService implements INotification {
  private items: AppNotification[] = [];
  private readonly listeners = new Set<(items: AppNotification[]) => void>();

  publish(input: { kind: NotificationKind; title: string; message: string }): AppNotification {
    const item: AppNotification = {
      id: `ntf-${Date.now().toString(36)}${(counter++).toString(36)}`,
      kind: input.kind,
      title: input.title,
      message: input.message,
      createdAt: new Date().toISOString(),
      read: false,
    };
    this.items = [item, ...this.items].slice(0, MAX_ITEMS);
    this.emit();
    return item;
  }

  list(): AppNotification[] {
    return this.items;
  }

  subscribe(listener: (items: AppNotification[]) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  markAllRead(): void {
    this.items = this.items.map((item) => ({ ...item, read: true }));
    this.emit();
  }

  clear(): void {
    this.items = [];
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.items));
  }
}
