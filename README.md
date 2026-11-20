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
npm test           # unit test (Vitest) cho lập lịch sạc & điều phối
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
- Quy tắc đồng thời/validation nghiệp vụ nâng cao cho các phân hệ còn lại.
- What-if nâng cao (đỉnh điểm Metro, hỏng cổng sạc, nhu cầu sạc).
- Không có API thật, IoT thật hay bản đồ định tuyến.

## Sạc, điều phối & điều hướng (nhánh `feat/charging-dispatch`)

Logic nghiệp vụ viết dạng hàm thuần, có unit test, bám theo Class diagram / state-chart trong báo cáo:

| File | Nội dung |
|---|---|
| `src/services/chargingScheduler.ts` | Lịch sạc theo khung giờ, điểm ưu tiên, hàng đợi ưu tiên, overflow, phiên sạc |
| `src/services/dispatchService.ts` | Vòng đời lệnh điều phối, sức chứa Hub đích, ETA, gợi ý cân bằng xe |
| `src/services/redirectService.ts` | Phát hiện quá tải, Hub thay thế, phương án điều hướng, phản hồi của sinh viên |
| `src/stores/slices/chargingSlice.ts`, `dispatchSlice.ts` | Nối service vào `useAppStore` |
| `src/types/charging.ts`, `src/types/dispatch.ts` | Mô hình dữ liệu (phía nhà điều hành) |
| `src/services/__tests__/*` | Test case 4.7, 4.8, 4.13–4.16, điều hướng người dùng và các trường hợp biên (`npm test`) |

**Lịch sạc theo khung giờ** (`/operator/lich-sac`, tab "Lịch theo khung giờ"): sơ đồ theo cổng × khung
30 phút trong ngày gồm lịch đặt, phiên đang sạc / đã đầy / đã xong, bỏ chỗ. Service chặn trùng lịch theo cổng
và theo xe, kiểm tra đầu nối AC/DC; lịch không check-in trong thời gian giữ chỗ tự hủy (bỏ chỗ) và giải phóng
cổng. Nhà điều hành xác nhận check-in tại cổng trong "Lịch sạc chi tiết".
Phần này dùng dữ liệu riêng (`chargePoints`, `chargingBookings`, `chargingSessions`); trang Đặt lịch sạc của
sinh viên (`chargingPorts`, `chargingReservations`, `bookCharging`) giữ nguyên bản `do-dev`.

**Bộ lập lịch ưu tiên** (`/operator/lich-sac`): điểm = (100 − pin) × 0,6 + 15 (pin ≤ ngưỡng nguy cấp)
+ tối đa 25 (sắp có chuyến đi trong cửa sổ thời gian) + 10 (xe dùng chung) + tối đa 10 (thời gian chờ).
"Lập lịch sạc ưu tiên" quét xe pin dưới ngưỡng, xếp hàng đợi, cấp điện theo số cổng trống; xe dư được giữ
trong hàng đợi kèm thời gian chờ ước tính và Hub thay thế. Xe từ hàng đợi tự nhường cổng khi tới giờ của
lịch đặt kế tiếp. Có sơ đồ lịch theo khung giờ (Gantt), bảo trì cổng (tự chuyển lịch sang cổng khác),
chỉnh tham số sạc và lịch sử phiên sạc.

**Hoàn tất phiên sạc**: phiên chuyển "Đã đầy · chờ rút" khi đạt mức mục tiêu; rút sạc / dừng sớm ghi nhận
kWh, chi phí, pin cuối của xe, giải phóng cổng và (tuỳ chọn) chuyển cổng cho xe ưu tiên kế tiếp.

**Điều phối** (`/operator/dieu-phoi`): Khởi tạo → Đã phân công → Đang vận chuyển → Đã hoàn thành / Đã hủy.
Xe bị khóa khi tạo lệnh, rời Hub nguồn khi xuất phát, nhập Hub đích khi xác nhận giao; Hub đích được giữ
chỗ trước cho xe đang đến. Theo dõi tiến độ và trễ hạn theo ETA, lịch sử có bộ lọc và nhật ký từng lệnh.

**Điều hướng người dùng** (`/operator/dieu-huong`, sequence 2.9 / activity 3.9): phát hiện Hub có nguy cơ quá
tải (bãi đỗ ≥ 85%, hết cổng sạc, thiếu xe, cảm biến cảnh báo) → quét Hub thay thế theo bán kính, xếp theo mức phù
hợp (chỗ trống, cổng sạc, xe, khoảng cách) → nhà điều hành duyệt → gửi đề xuất tới các lịch đặt tại Hub quá tải
(trả xe, chỗ đỗ, lịch sạc). Sinh viên nhận thông báo ở góc màn hình (`src/features/redirect/RedirectNotifier.tsx`,
component riêng, không sửa trang sinh viên): *Đồng ý* → lịch đặt chuyển sang Hub mới; *Bỏ qua* → giữ nguyên và cảnh
báo chờ lâu; Hub mới hết chỗ → giữ nguyên lịch cũ. Có lịch sử phương án và trạng thái từng đề xuất
(`src/services/redirectService.ts`).

**Demo**: nút đồng hồ ở góc phải (`+5′ / +15′ / +1 giờ`) tua nhanh thời gian để thấy lịch quá hạn, xe sạc đầy,
xe tới nơi. HUB A4 cổng CS-02 có sẵn lịch mã `SAC246810` bắt đầu sau 5 phút (nhà điều hành check-in được ngay).
HUB C2 có sẵn dữ liệu test case 4.13/4.14 (5 xe pin 8/15/40/60/75%, 3 cổng trống).

## Phân công gợi ý
- UI/Design System: `src/components`, `src/styles`
- Student flows: `src/features/student`
- Operator flows: `src/features/operator`
- Business logic: `src/stores`, `src/services`
- Mock models: `src/types`, `src/mocks`

**Quy tắc:** Không viết logic nghiệp vụ trực tiếp trong component mới; ưu tiên service/store, giữ các luồng mô phỏng nhất quán.

## Git
Mỗi thành viên tạo branch `feat/<ten-chuc-nang>`, gửi pull request, không commit `node_modules` hoặc `dist`.
