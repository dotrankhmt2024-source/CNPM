# Sơ đồ Use Case — Smart E-Mobility Hub

| Tệp | Mô tả |
|---|---|
| `use-case-diagram.png` | Ảnh 3360×2240 (2x), dùng chèn vào báo cáo Word/PDF |
| `use-case-diagram.svg` | Bản vector, mở bằng Figma / Illustrator / Inkscape để sửa chữ, màu, vị trí |

Sơ đồ phản ánh **phạm vi Frontend MVP** đang có trong code: dữ liệu mô phỏng, lưu `localStorage`, không có backend.

## Actor

| Actor | Loại | Mô tả |
|---|---|---|
| Sinh viên | Chính | Đặt xe, đặt chỗ đỗ, yêu cầu sạc, xem lịch |
| Nhà điều hành | Chính | Giám sát Hub, điều phối xe, xử lý sự cố, mô phỏng |

## Danh sách use case

| Mã | Use case | Actor | Màn hình / Ghi chú |
|---|---|---|---|
| UC01 | Đăng nhập | Sinh viên, Nhà điều hành | `/login` |
| UC02 | Đăng ký tài khoản | Sinh viên | `/register` (chỉ tạo được tài khoản Sinh viên) |
| UC03 | Xem tổng quan | Sinh viên | `/student` — 4 chỉ số + dịch vụ nhanh + Hub gần bạn + lịch sắp tới |
| UC04 | Tìm kiếm Hub | Sinh viên | `/student/hub` — nhập điểm đi / điểm đến |
| UC05 | Xem chi tiết Hub | Sinh viên | `/student/hub` — chọn 1 Hub, xem 3 dịch vụ |
| UC06 | Đặt xe | Sinh viên | `/student/dat-xe` — chọn HUB nhận, xe, HUB trả; «include» UC07 |
| UC07 | Sinh mã nhận/trả xe | Hệ thống | Sinh mã `SEMH######`, hiệu lực 5 phút |
| UC08 | Nhận xe | Sinh viên | Nhập mã nhận; «include» UC09 |
| UC09 | Xác thực mã nhận xe | Hệ thống | Kiểm tra mã + hạn 5 phút |
| UC10 | Trả xe | Sinh viên | Nhập mã trả; «include» UC11 |
| UC11 | Xác thực mã trả xe | Hệ thống | Mã trả trùng mã nhận |
| UC12 | Hủy đặt xe | Sinh viên | Chỉ khi chưa nhận xe |
| UC13 | Đặt chỗ đỗ | Sinh viên | `/student/cho-do` |
| UC14 | Yêu cầu sạc | Sinh viên | `/student/dat-sac` — sạc ngay hoặc vào hàng đợi |
| UC15 | Xem lịch của tôi | Sinh viên | `/student/lich-cua-toi` |
| UC16 | Giám sát tình trạng Hub | Nhà điều hành | `/operator` — bãi đỗ, cổng sạc, xe khả dụng |
| UC17 | Điều phối xe | Nhà điều hành | `/operator` — chuyển xe giữa các Hub |
| UC18 | Xem hàng đợi sạc | Nhà điều hành | `/operator` — sắp theo điểm ưu tiên |
| UC19 | Xử lý sự cố | Nhà điều hành | `/operator` — đánh dấu đã xử lý |
| UC20 | Chạy mô phỏng what-if | Nhà điều hành | `/operator` — không đổi dữ liệu vận hành |

## Ghi chú khi trình bày

- **«include»**: UC06 → UC07, UC08 → UC09, UC10 → UC11 (bắt buộc, không tách rời).
- **Đăng xuất** có trong ứng dụng (menu tài khoản) nhưng lược khỏi sơ đồ cho gọn; nếu cần thì thêm một use case nối cả 2 actor.
- **Thanh toán** nằm ngoài phạm vi theo đặc tả: nút "Thanh toán ngay" chỉ đóng hộp thoại và quay về trang đặt xe.
- UC07/UC09/UC11 là xử lý phía client (không có backend), vẽ là use case của **Hệ thống** để thể hiện ràng buộc nghiệp vụ.
