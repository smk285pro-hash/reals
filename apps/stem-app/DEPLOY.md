# Deploy AI Audio Lab lên Modal

## Bước 1: Setup Modal account
```bash
pip install modal
modal setup
```

## Bước 2: Deploy app
```bash
modal deploy modal_app.py
```
Output sẽ hiển thị URL: `https://<workspace>--ai-audio-lab-fastapi-web.modal.run`

## Bước 3: Test API
```bash
# 1. Health check
curl https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/health

# 2. Upload file audio
curl -F "file=@test.mp3" https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/upload

# 3. Phân tích nhanh Telemetry (<2s)
curl -X POST "https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/analyze/quick/<task_id>"

# 4. Kích hoạt phân tích sâu trên GPU T4
curl -X POST "https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/analyze/deep/<task_id>?stem_mode=4"

# 5. Theo dõi tiến trình qua SSE
curl -N "https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/progress/<task_id>"

# 6. Tải từng Stem audio
curl -O "https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/stems/<task_id>/vocals"

# 7. Xuất file MIDI đa track
curl -O "https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/export/midi/<task_id>"

# 8. Tải file ZIP trọn bộ Stems
curl -O "https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/export/stems-zip/<task_id>"

# 9. Xuất kết quả JSON
curl "https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/export/json/<task_id>"
```

## Bước 4: Cấu hình Frontend trên Vercel
Cập nhật biến môi trường `NEXT_PUBLIC_API_URL` trong dự án Next.js trên Vercel:
```
NEXT_PUBLIC_API_URL=https://<workspace>--ai-audio-lab-fastapi-web.modal.run
```

## Chi phí ước tính (Modal Serverless)
- Web container (CPU 2 cores, 2GB RAM): ~$0.02/giờ (~$15/tháng nếu chạy 24/7, tự scale to zero nếu min_containers=0)
- GPU Function (NVIDIA T4 16GB VRAM): $0.59/giờ (chỉ tính tiền theo từng giây khi chạy phân tích Deep Analysis)
- 1 bài hát 4 phút: ~45-75 giây GPU T4 = ~$0.007 - $0.012 / bài
- Free tier Modal cấp $30/tháng credit = Miễn phí ~2,500 lượt phân tích mỗi tháng

## Troubleshooting & Tối ưu
- **Cold start GPU**: Khoảng 15-25 giây ở lần đầu tiên để khởi tạo container và nạp model vào VRAM.
- **Dọn dẹp Storage**: Chạy `modal volume delete audio-storage` nếu cần giải phóng toàn bộ dữ liệu âm thanh cũ.
- **Nâng cấp GPU**: Đổi `gpu="T4"` thành `gpu="A10G"` (24GB VRAM) trong `modal_app.py` nếu muốn tăng tốc gấp 2.5 lần.
