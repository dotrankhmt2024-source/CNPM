# SEMH Backend

Backend cho Smart E-Mobility Hub, viết bằng **Node.js + TypeScript**, dùng lại
nguyên vẹn các component nghiệp vụ trong `src/subsystems` (chúng không phụ thuộc React).

## Công nghệ

| Thành phần | Chọn dùng | Ghi chú |
|---|---|---|
| Runtime | Node.js ≥ 20 (đã test trên Node 24) | không cần cài thêm gì |
| HTTP server | `node:http` | tự viết router nhỏ, không cần Express |
| Database | **SQLite** qua `node:sqlite` | file `backend/data/semh.db` |
| Mật khẩu | `node:crypto` scrypt + salt | không lưu mật khẩu dạng rõ |
| Phiên đăng nhập | token ngẫu nhiên (Bearer), hạn 8 giờ | bảng `sessions` |
| Build | Vite SSR build (`vite.server.config.ts`) | resolve alias `@/`, bundle 1 file |

> Có thể thay `node:http` bằng Express/Fastify sau này mà không phải sửa nghiệp vụ:
> các service đã nằm sau interface (`IPersistence`, `IAuth`, …).

## Cấu trúc

```
backend/
├── main.ts        # HTTP server + router + phục vụ dist/ (production)
├── accounts.ts    # đăng ký/đăng nhập, scrypt, session
├── db.ts          # SQLite: app_state, users, sessions
├── services.ts    # lắp ghép service (dùng lại src/subsystems)
├── commands.ts    # bảng lệnh ghi (student.*, operator.*, system.*)
└── data/semh.db   # database (tự tạo, không commit)
```

## Chạy

```bash
npm run server          # build rồi chạy tại http://localhost:4000
# hoặc
npm run server:build    # chỉ build ra .server-dist/server.js
node .server-dist/server.js
```

Biến môi trường: `PORT` (mặc định 4000), `HOST`, `SEMH_DB` (đường dẫn file SQLite).

Lần chạy đầu, server tự tạo 2 tài khoản demo:

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Sinh viên | `student@demo.local` | `Student123!` |
| Nhà điều hành | `operator@demo.local` | `Operator123!` |

## API

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/health` | kiểm tra sống |
| POST | `/api/auth/register` | `{ fullName, email, password }` → `{ user, token }` |
| POST | `/api/auth/login` | `{ email, password }` → `{ user, token }` |
| POST | `/api/auth/logout` | huỷ token hiện tại |
| GET | `/api/me` | người đang đăng nhập |
| GET | `/api/state` | ảnh chụp dữ liệu vận hành (`AppData`) |
| POST | `/api/command` | `{ name, args }` → `{ ok, message, state }` |
| POST | `/api/reset` | khôi phục dữ liệu demo (chỉ operator) |

Mọi endpoint (trừ auth/health) cần header `Authorization: Bearer <token>`.
Lệnh `operator.*` chỉ dành cho tài khoản operator, `student.*` chỉ dành cho sinh viên.

### Ví dụ

```bash
curl -s http://localhost:4000/api/health

TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"student@demo.local","password":"Student123!"}' | jq -r .token)

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/state | jq '.state.hubs | length'

curl -s -X POST http://localhost:4000/api/command \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"student.bookParking","args":{"hubId":"h1","slotId":"h1-slot-1","vehicleType":"Xe may","startTime":"09:00","endTime":"11:00"}}' | jq '{ok,message}'
```

## Chạy toàn hệ thống

### Cách 1 — dev (hai tiến trình, có HMR)

```bash
# cửa sổ 1: backend (cổng 4000)
npm run server

# cửa sổ 2: frontend (cổng 5173, tự proxy /api → 4000)
npm run dev
```

Mở `http://localhost:5173`, đăng nhập bằng tài khoản demo. Dữ liệu nằm trong
`backend/data/semh.db` nên nhiều tab/trình duyệt thấy cùng một trạng thái.

### Cách 2 — production (một tiến trình)

```bash
npm run build          # tạo dist/
npm run server         # server phục vụ luôn dist/ tại cổng 4000
```

Mở `http://localhost:4000`.

## Trạng thái tích hợp với frontend

Đã nối xong — frontend không còn tự quyết định nghiệp vụ:

1. `src/client/api/http.ts` — lớp gọi HTTP (token trong localStorage).
2. `useAuthStore` — đăng nhập/đăng ký/đăng xuất qua `/api/auth/*`, không lưu mật khẩu.
3. `useAppStore` — read model nạp từ `/api/state`; mọi lệnh ghi gọi `/api/command`
   và thay read model bằng `state` server trả về; có `refresh()` đồng bộ định kỳ 10 giây.
4. `DataStore` phía client bỏ `persist` localStorage — chỉ còn read model trong bộ nhớ.
5. Vite proxy `/api` → `http://localhost:4000` khi dev.

Các truy vấn chỉ-đọc (danh sách cổng sạc trống, hàng đợi ưu tiên, mô phỏng…) vẫn dùng
`apiGateway` trong tiến trình, nhưng đọc từ read model đã đồng bộ với server.

### Việc còn có thể làm thêm

- Refresh token / "ghi nhớ đăng nhập" theo lựa chọn ở form login.
- API thiết lập cá nhân (hiện `notificationsEnabled` lưu tạm ở localStorage).
- WebSocket/SSE thay cho polling 10 giây.
