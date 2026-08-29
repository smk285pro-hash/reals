# Deploy stem-app lên Modal (production backend)

Backend production của stem-app chạy trên **Modal serverless** — GPU NVIDIA T4 theo
từng giây sử dụng. File deploy là `modal_app.py` (ngay thư mục `apps/stem-app/`,
mount thư mục `backend/` cạnh nó vào image).

> Lịch sử: trước monorepo, file này chỉ nằm trên máy local (không được commit) —
> từ Bước 4+ nó đã được đưa vào repo kèm SSO + tier gating.

## Kiến trúc

| Thành phần | Modal function | Cấu hình |
|---|---|---|
| Web layer (REST + SSE) | `fastapi_web` | 2 CPU / 2GB, `min_containers=1` (luôn nóng) |
| Deep analysis (Demucs + Viterbi) | `analyze_deep_task` | **GPU T4**, timeout 900s, scale-to-zero |
| Stems only (Demucs) | `analyze_stems_task` | **GPU T4**, timeout 900s, scale-to-zero |
| Chords only (CPU) | `analyze_chords_task` | 2 CPU / 4GB, scale-to-zero |
| Denoise (DeepFilterNet) | `denoise_task` | 4 CPU / 4GB, scale-to-zero |
| Dọn session TTL | `cleanup_stale_sessions` | cron mỗi giờ |
| Storage xuyên container | Volume `audio-storage` | mount `/storage` |

## SSO + tier gating

Web layer gate **12 endpoint** bằng `require_auth` (verify bridge token qua
main-app `POST /api/auth/verify-session` — xem `backend/app/core/reals_auth.py`):

- `GET /api/auth/me` *(mới — SPA load tier badge)*
- `POST /api/upload`, `POST /api/analyze/quick|deep|chords|stems|denoise/{task_id}`, `DELETE /api/session/{task_id}`
- Dev API: `POST /api/v1/analyze|chords|separate|denoise`

3 endpoint tách nhạc (`deep`, `stems`, `v1/separate`) gọi
`consume_separation_credit` **trước khi spawn GPU worker** — main-app
check-and-record atomic: hết quota → 429, main-app lỗi → 503 fail-closed
(KHÔNG chạy GPU khi không chắc còn quota). Response 202 trả kèm `quota` mới
nhất để SPA cập nhật badge.

Endpoint polling/tải file (status, progress SSE, audio, stems, denoised,
export, v1/jobs) giữ **public** — task_id là UUID khó đoán, và `<audio>` tag
không gắn được Authorization header.

## Bước 1: Setup Modal account

```bash
pip install modal
modal setup
```

## Bước 2: (Tuỳ chọn) Modal Secret ghi đè cấu hình SSO

Mặc định image đã baked `REALS_MAIN_APP_URL=https://reals.media`. Muốn ghi đè:

```bash
modal secret create reals-sso \
  REALS_MAIN_APP_URL=https://reals.media \
  REALS_AUTH_CACHE_TTL=60 \
  REALS_AUTH_TIMEOUT=5
```

rồi thêm `secrets=[modal.Secret.from_name("reals-sso")]` vào `@app.function`
của `fastapi_web` trong `modal_app.py`.

## Bước 3: Deploy

```bash
cd apps/stem-app
modal deploy modal_app.py
```

Output hiển thị URL: `https://<workspace>--ai-audio-lab-fastapi-web.modal.run`

> ⚠️ **THỨ TỰ DEPLOY QUAN TRỌNG**: backend Modal (bản SSO) chỉ deploy **SAU KHI**
> main-app reals.media đã có SSO endpoints. PR monorepo đã merge vào `main`
> (2026-08-29) — code SSO đã chạy trên Vercel; còn thiếu 2 việc trước khi
> `modal deploy`: chạy `sql/001-add-subscription-and-usageevent.sql` (repo root)
> trên DB production + set `STEM_SSO_SECRET` trên Vercel. Deploy Modal SSO
> trước khi main-app sẵn sàng → mọi endpoint gated trả 503 (fail-closed) →
> app vỡ.
>
> Frontend (Vercel) deploy **CUỐI CÙNG** sau khi Modal đã chạy bản SSO.

## Bước 4: Test API

```bash
# 1. Health check (public)
curl https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/health
# → {"status":"ok","gpu_available":true,"version":"2026.2.0","platform":"modal-serverless"}

# 2. Endpoint gated giờ trả 401 nếu thiếu token
curl -i -X POST "https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/analyze/quick/xxx"
# → HTTP 401 {"detail":"Thiếu Authorization: Bearer <token>"}

# 3. Upload file audio (cần bridge token — lấy sau khi login reals.media)
curl -H "Authorization: Bearer <bridge_token>" \
  -F "file=@test.mp3" \
  https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/upload

# 4. Phân tích nhanh Telemetry (<2s)
curl -X POST -H "Authorization: Bearer <bridge_token>" \
  "https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/analyze/quick/<task_id>"

# 5. Kích hoạt phân tích sâu trên GPU T4 (trừ quota, trả kèm quota còn lại)
curl -X POST -H "Authorization: Bearer <bridge_token>" \
  "https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/analyze/deep/<task_id>?stem_mode=4"

# 6. Theo dõi tiến trình qua SSE
curl -N "https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/progress/<task_id>"

# 7. Tải từng Stem / MIDI / ZIP / JSON
curl -O "https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/stems/<task_id>/vocals"
curl -O "https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/export/midi/<task_id>"
curl -O "https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/export/stems-zip/<task_id>"
curl -O "https://<workspace>--ai-audio-lab-fastapi-web.modal.run/api/export/json/<task_id>"
```

Bridge token lấy từ đâu: mở stem-app → bị redirect sang reals.media authorize →
login → redirect về kèm `#token=<JWT TTL 24h>`; hoặc lấy từ localStorage
`reals_stem_sso_token` trong DevTools.

## Bước 5: Cấu hình Frontend trên Vercel

Project Vercel của stem-app (Root Directory `apps/stem-app`), set env:

```
NEXT_PUBLIC_MAIN_APP_URL=https://reals.media
NEXT_PUBLIC_API_URL=https://<workspace>--ai-audio-lab-fastapi-web.modal.run
```

(Trùng file `.env.production` trong repo — nếu deploy từ repo thì không cần
set lại trên dashboard trừ khi muốn ghi đè.)

## Chi phí ước tính (Modal Serverless)

- Web container (CPU 2 cores, 2GB RAM): ~$0.02/giờ (~$15/tháng chạy 24/7)
- GPU Function (NVIDIA T4 16GB VRAM): $0.59/giờ — chỉ tính từng giây khi chạy
- 1 bài hát 4 phút: ~45–75 giây GPU T4 = ~$0.007–0.012 / bài
- Free tier Modal cấp $30/tháng credit ≈ miễn phí ~2,500 lượt phân tích / tháng
- Tier gating (SSO) giúp kiểm soát chi phí: FREE 3 lượt/ngày, BASIC 10, MAX 30, ULTRA không giới hạn

## Troubleshooting & Tối ưu

- **Mọi endpoint trả 503**: main-app chưa có SSO endpoints (chưa merge PR monorepo
  / chưa chạy SQL / Vercel chưa set `STEM_SSO_SECRET`) → hoàn tất main-app trước.
- **401 liên tục dù đã login**: bridge token hết hạn 24h → xoá localStorage
  `reals_stem_sso_token` + reload (SPA sẽ silent re-auth).
- **429 quota_exceeded**: user hết lượt tách nhạc 24h (tier limit) — đúng hành vi.
- **Cold start GPU**: 15–25 giây lần đầu để nạp model vào VRAM (GPU scale-to-zero).
- **Dọn Storage**: `modal volume delete audio-storage` (mất toàn bộ audio cũ —
  cron hourly đã tự dọn session TTL 24h).
- **Nâng cấp GPU**: đổi `gpu="T4"` → `gpu="A10G"` (24GB VRAM) trong `modal_app.py`
  — nhanh gấp ~2.5 lần, giá ~$1.10/giờ.
- **Logs**: `modal app logs ai-audio-lab`.

## Phương án thay thế: self-host VPS (không dùng)

Repo vẫn giữ `Dockerfile.backend` + `docker-compose.yml` cho ai muốn self-host
trên VPS GPU riêng (Oracle Cloud...) — backend local giống hệt Modal (cùng
`reals_auth.py`, chạy uvicorn :3031). Khi đó frontend set `NEXT_PUBLIC_API_URL=`
trống + `BACKEND_API_URL=http://127.0.0.1:3031` (rewrite same-origin). Production
hiện tại KHÔNG dùng phương án này.
