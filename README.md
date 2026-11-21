# Hướng dẫn chạy hệ thống (dành cho người mới)

Tài liệu này hướng dẫn **từ con số 0**: máy chưa cài gì → chạy được hệ thống
**Smart E-Mobility Hub (SEMH)** trên máy của bạn.

> Hệ thống gồm **frontend** (React + TypeScript + Vite) và **backend** (Node.js +
> SQLite), dùng chung lõi nghiệp vụ ở `core/`. Chạy được trên máy cá nhân, **không cần
> cài database server, không cần Docker** (SQLite chỉ là một file trong `backend/data/`).
>
> Cấu trúc thư mục:
>
> | Thư mục | Vai trò |
> |---|---|
> | `frontend/` | Giao diện: `app` (khung + routing), `client` (trang, component, store), `gateway` |
> | `backend/` | HTTP API + SQLite + đăng nhập (`main.ts`, `db.ts`, `accounts.ts`, `services.ts`, `commands.ts`) |
> | `core/` | Lõi nghiệp vụ dùng chung: `subsystems`, `shared`, `contracts`, `demo` |

---

## Bước 0 — Bạn cần có

| Thứ cần | Ghi chú |
|---|---|
| Máy tính Windows / macOS / Linux | 4GB RAM trở lên là đủ |
| Node.js (bản LTS) | Bắt buộc — đây là "môi trường chạy" của dự án |
| Trình duyệt | Chrome / Edge / Firefox bản mới |
| Mạng internet | Chỉ cần ở bước cài thư viện (`npm install`) |

---

## Bước 1 — Cài Node.js (nếu máy chưa có)

1. Vào https://nodejs.org → tải bản **LTS** (nút lớn bên trái).
2. Cài đặt kiểu "Next → Next → Finish", không cần đổi gì.
3. **Đóng hết cửa sổ terminal đang mở**, rồi mở terminal mới.
4. Kiểm tra:

```bash
node -v
npm -v
```

Kết quả mong đợi: `v20.x`, `v22.x` hoặc `v24.x` (và npm `10.x` trở lên).
Nếu báo *"node is not recognized"* → chưa cài đúng hoặc chưa mở terminal mới.

---

## Bước 2 — Mở terminal đúng thư mục dự án

Đây là bước người mới hay sai nhất: **phải đứng trong thư mục có file
`package.json`**.

**Cách nhanh trên Windows:** mở thư mục dự án bằng File Explorer → bấm vào thanh
địa chỉ → gõ `powershell` → Enter. (Hoặc giữ `Shift` + chuột phải vào khoảng trắng
→ *Open PowerShell window here*.)

**Cách khác:** mở terminal rồi `cd` tới thư mục:

```bash
cd "D:\A_Tai_Lieu\DH\CNPM\BTL\submission_3\Chuẩn\CNPM"
```

> Có dấu cách hoặc tiếng Việt trong đường dẫn thì **luôn đặt trong dấu ngoặc kép**.

Kiểm tra đã đúng chỗ chưa:

```bash
dir        # Windows
ls         # macOS / Linux
```

Phải thấy `package.json`, `index.html`, `vite.config.ts`, và ba thư mục `frontend`, `backend`, `core`.

---

## Bước 3 — Cài thư viện (chỉ làm lần đầu)

```bash
npm install
```

- Việc này tải các thư viện (React, Ant Design, Zustand…) vào thư mục
  `node_modules`. Mất khoảng 1–3 phút, cần mạng.
- Xong khi thấy dòng kiểu `added 350 packages in 40s`.
- Lần sau mở lại dự án **không cần** chạy lại bước này.

---

## Bước 4 — Chạy hệ thống

Cần **hai cửa sổ terminal** (cùng đứng ở thư mục dự án):

```bash
# Cửa sổ 1 — backend (API + SQLite), cổng 4000
npm run server
```

Chờ tới khi thấy:

```
SEMH API đang chạy tại http://localhost:4000
Tài khoản demo: student@demo.local / Student123!  ·  operator@demo.local / Operator123!
```

```bash
# Cửa sổ 2 — frontend, cổng 5173
npm run dev
```

Terminal thứ hai sẽ in ra:

```
  VITE v6.x  ready in 500 ms
  ➜  Local:   http://localhost:5173/
```

Mở trình duyệt, dán **http://localhost:5173** vào thanh địa chỉ.

> ⚠️ **Giữ nguyên cả hai cửa sổ terminal** trong lúc dùng. Tắt cửa sổ backend =
> trình duyệt báo lỗi gọi API; tắt cửa sổ frontend = không mở được giao diện.
>
> ⚠️ **Không** mở file `index.html` bằng cách nhấp đúp — mở kiểu đó sẽ ra trang
> trắng, vì ứng dụng cần dev server biên dịch TypeScript.

> 💡 Muốn chạy **một tiến trình duy nhất**: `npm run build` rồi `npm run server`,
> sau đó mở `http://localhost:4000` (server phục vụ luôn bản build frontend).

---

## Bước 5 — Đăng nhập

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Sinh viên | `student@demo.local` | `Student123!` |
| Nhà điều hành | `operator@demo.local` | `Operator123!` |

Muốn thử cả hai phía cùng lúc: mở **2 tab**, mỗi tab đăng nhập một vai trò. Hai tab
dùng chung dữ liệu — sinh viên đặt chỗ thì tab nhà điều hành cập nhật ngay.

Cũng có thể bấm **Đăng ký** để tạo tài khoản sinh viên mới (dữ liệu của tài khoản
mới tách riêng, không lẫn với tài khoản demo).