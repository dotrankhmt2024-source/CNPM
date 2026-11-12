# Smart E-Mobility Hub — Frontend MVP

Dự án khởi tạo để nhóm phát triển **frontend-only** cho bài tập lớn Software Engineering 261. Không có backend/database; dùng dữ liệu giả lập lưu trong `localStorage`.

## Cài đặt

Yêu cầu Node.js 20.19+ hoặc 22.12+.

```bash
npm install
npm run dev
```

Mở URL Vite hiển thị (thường là http://localhost:5173).

```bash
npm run typecheck
npm run build
```

## Đã có
- React + TypeScript + Vite + Tailwind CSS + Ant Design.
- React Router với hai khu vực `/student` và `/operator`.
- Đăng nhập/đăng ký demo + phân quyền theo vai trò (`/login`, `/register`), chặn truy cập khi chưa đăng nhập.
  Tài khoản mẫu: `student@demo.local / Student123!` và `operator@demo.local / Operator123!`.
  Ảnh hero trang đăng nhập: `public/login-hero.jpg` (thay bằng file export từ Figma).
- Light/Dark Mode.
- Seed dữ liệu Hub, xe, sự cố.
- Đặt/nhận/trả/hủy xe; đặt chỗ đỗ mô phỏng; yêu cầu sạc.
- Operator: giám sát Hub, điều phối xe, hàng đợi sạc, đánh dấu sự cố.
- What-if Simulation thuần (không thay đổi dữ liệu vận hành).
- Zustand + persist localStorage; nút Reset Demo Data.

## Chưa hoàn thiện (cần nhóm code tiếp)
- Chuyển từng frame Figma thành giao diện pixel-accurate, nhất là mobile.
- Đăng nhập/đăng ký và phân quyền demo (hiện chuyển vai trò bằng menu).
- Luồng "Quên mật khẩu" (nút hiện chỉ báo chưa hỗ trợ).
- Đặt chỗ đỗ có thời gian, hủy đặt chỗ và tránh trùng khung giờ.
- Lịch sạc theo khung giờ, bộ lập lịch ưu tiên đầy đủ, hoàn tất phiên sạc.
- Điều phối có lịch sử và trạng thái đang vận chuyển.
- Quy tắc đồng thời/validation nghiệp vụ nâng cao; unit tests.
- What-if nâng cao (đỉnh điểm Metro, hỏng cổng sạc, nhu cầu sạc).
- Không có API thật, IoT thật hay bản đồ định tuyến.

## Phân công gợi ý
- UI/Design System: `src/components`, `src/styles`
- Student flows: `src/features/student`
- Operator flows: `src/features/operator`
- Business logic: `src/stores`, `src/services`
- Mock models: `src/types`, `src/mocks`

**Quy tắc:** Không viết logic nghiệp vụ trực tiếp trong component mới; ưu tiên service/store, giữ các luồng mô phỏng nhất quán.

## Git
Mỗi thành viên tạo branch `feat/<ten-chuc-nang>`, gửi pull request, không commit `node_modules` hoặc `dist`.
