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
- Khung ứng dụng sidebar (SEMH) + trang tổng quan học sinh:
  `/student` (tổng quan), `/student/hub`, `/student/dat-xe`, `/student/cho-do`, `/student/dat-sac`, `/student/lich-cua-toi`, `/student/cai-dat`.
  Operator: `/operator` (tổng quan), `/operator/hub`, `/operator/dieu-phoi`, `/operator/dieu-huong`,
  `/operator/lich-sac`, `/operator/mo-phong`, `/operator/cai-dat`.
- Đăng nhập/đăng ký demo + phân quyền theo vai trò (`/login`, `/register`), chặn truy cập khi chưa đăng nhập.
  Tài khoản mẫu: `student@demo.local / Student123!` và `operator@demo.local / Operator123!`.
  Ảnh hero trang đăng nhập: `public/login-hero.jpg` (thay bằng file export từ Figma).
- Light/Dark Mode (chọn trong Cài đặt tài khoản) + menu tài khoản kiểu popover, đăng xuất có hộp thoại xác nhận.
- Seed dữ liệu Hub, xe, sự cố.
- Luồng đặt xe theo đặc tả: tìm Hub theo điểm đi/điểm đến → chọn Hub → chọn HUB nhận/xe/HUB trả →
  xác nhận → sinh **mã nhận/trả xe** (hiệu lực 5 phút) → nhập mã nhận xe → nhập mã trả xe →
  hiển thị thời gian di chuyển.
- Đặt chỗ đỗ: sơ đồ 36 vị trí/HUB (3 tầng), trạng thái trống/đang dùng/đã đặt/bảo trì, chọn vị trí + phí dịch vụ,
  xác nhận và sinh **mã đỗ/lấy xe**.
- Đặt lịch sạc: chọn khung giờ bắt đầu, cổng sạc AC 60/120kW, phí theo công suất, sinh **mã xác nhận**.
- Đặt/nhận/trả/hủy xe; đặt chỗ đỗ; yêu cầu sạc.
- Operator: tổng quan vận hành (chỉ số + trạng thái Hub + cảnh báo), quản lý Hub (cảnh báo thiếu xe/hết chỗ,
  cập nhật trạng thái), điều phối xe theo **Hub cần xe / Hub cung cấp xe + số lượng** (có xác nhận, báo lỗi thiếu xe
  hoặc thiếu sức chứa), điều hướng người dùng sang Hub thay thế, lập lịch sạc ưu tiên, mô phỏng kịch bản What-if
  (tham số, chạy mô phỏng, xem chi tiết Hub, lưu kịch bản).
- What-if Simulation thuần (không thay đổi dữ liệu vận hành).
- Zustand + persist localStorage (key `smart-emobility-demo-v3`); khôi phục dữ liệu demo trong Cài đặt tài khoản.

## Chưa hoàn thiện (cần nhóm code tiếp)
- Chuyển từng frame Figma thành giao diện pixel-accurate, nhất là mobile.
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
