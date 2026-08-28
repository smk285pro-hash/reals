# AI Audio Lab Studio 2026 — Danh sách API

**Base URL (production):** `https://smk285pro--ai-audio-lab-fastapi-web.modal.run`

- Swagger UI (tài liệu tương tác): `{BASE_URL}/docs`
- CORS: mở cho mọi origin (`*`) — gọi trực tiếp từ web/app bên ngoài được
- Không yêu cầu API key / authentication
- Định dạng upload: `multipart/form-data`, field `file` (MP3, WAV, FLAC, M4A, OGG, AAC, AIFF, WMA — tối đa 100 MB)
- **Nguyên tắc xử lý:** audio gửi lên được xử lý nguyên bản — không chuẩn hóa độ lớn (EBU R128), không tối ưu hóa. Audio trả về giữ đúng sample rate gốc.

---

## PHẦN 1 — PUBLIC DEV API (`/api/v1/*`)

API một-chạm dành cho developer xây dựng ứng dụng riêng. Kết quả JSON trả về JSON, kết quả audio trả về audio (WAV).

### 1.1. Phát hiện Tempo & Key — `POST /api/v1/analyze`

Đồng bộ, trả kết quả ngay (~2–5s).

```bash
curl -X POST "{BASE_URL}/api/v1/analyze" -F "file=@song.mp3"
```

**Response 200 (JSON):**

```json
{
  "bpm": 120.0,
  "master_key": "A",
  "scale_mode": "minor",
  "duration": 214.5,
  "sample_rate": 44100,
  "channels": 2,
  "task_id": "80b92a34-..."
}
```

### 1.2. Phát hiện Hợp âm — `POST /api/v1/chords`

Đồng bộ (~15–60s tùy độ dài bài). Giải mã tiến trình hợp âm bằng Viterbi HMM 169 trạng thái.

```bash
curl -X POST "{BASE_URL}/api/v1/chords" -F "file=@song.mp3"
```

**Response 200 (JSON):**

```json
{
  "telemetry": {
    "bpm": 120.4,
    "master_key": "A",
    "scale_mode": "minor",
    "time_signature": "4/4",
    "duration": 214.5
  },
  "beats": [{ "timestamp": 0.498, "beat_number": 1, "is_downbeat": true }],
  "chords": [
    {
      "start": 0.0,
      "end": 2.0,
      "chord": "Am",
      "root": "A",
      "bass": "A",
      "quality": "min",
      "confidence": 0.87
    }
  ],
  "warnings": [],
  "task_id": "08781272-..."
}
```

### 1.3. Tách nhạc (Stem Separation) — `POST /api/v1/separate`

Bất đồng bộ (AI Demucs trên GPU NVIDIA T4, vài phút/bài). Trả `task_id` → poll job → tải audio stems.

```bash
curl -X POST "{BASE_URL}/api/v1/separate?stem_mode=4" -F "file=@song.mp3"
```

**Query params:**

| Param | Giá trị | Mô tả |
|---|---|---|
| `stem_mode` | `2` | vocals + instrumental |
| | `4` (mặc định) | vocals, drums, bass, other |
| | `6` | + guitar, piano |
| | `8` | toàn diện (thử nghiệm) |

**Response 202 (JSON):**

```json
{
  "task_id": "66fa20e3-...",
  "status": "QUEUED",
  "stem_mode": "4",
  "status_url": "/api/v1/jobs/66fa20e3-..."
}
```

**Khi job COMPLETE** (xem 1.5), `result` chứa URL audio từng stem:

```json
{
  "result": {
    "stems": {
      "mode": "4",
      "stems": {
        "vocals": { "url": "/api/stems/{task_id}/vocals", "color": "#a855f7", "default_gain_db": 0.0 },
        "drums": { "url": "/api/stems/{task_id}/drums", "color": "#f97316", "default_gain_db": 0.0 },
        "bass":   { "url": "/api/stems/{task_id}/bass",   "color": "#3b82f6", "default_gain_db": 0.0 },
        "other":  { "url": "/api/stems/{task_id}/other",  "color": "#22c55e", "default_gain_db": 0.0 }
      }
    },
    "zip_url": "/api/export/stems-zip/{task_id}",
    "warnings": []
  }
}
```

Mỗi `url` trả về **audio/wav** (hỗ trợ HTTP Range để streaming). `zip_url` trả về **application/zip** chứa toàn bộ stems.

### 1.4. Lọc nhiễu (Denoise) — `POST /api/v1/denoise`

Bất đồng bộ. Khử noise/hum bằng **DeepFilterNet3** (SOTA deep-learning denoiser, kèm harmonics post-filter). Audio trả về đúng sample rate & số kênh của file gốc.

```bash
curl -X POST "{BASE_URL}/api/v1/denoise?strength=80" -F "file=@recording.mp3"
```

**Query params:**

| Param | Mặc định | Mô tả |
|---|---|---|
| `strength` | `80` (0–100) | Cường độ khử nhiễu. 0 = nhẹ nhất (tự nhiên), 100 = triệt để nhất |

**Response 202 (JSON):**

```json
{
  "task_id": "1dd2dc7d-...",
  "status": "QUEUED",
  "strength": 80,
  "status_url": "/api/v1/jobs/1dd2dc7d-..."
}
```

**Khi job COMPLETE**, `result` chứa URL audio đã lọc:

```json
{
  "result": {
    "task_id": "1dd2dc7d-...",
    "denoise_url": "/api/denoised/1dd2dc7d-...",
    "engine": "deepfilternet",
    "strength": 80,
    "sample_rate": 44100,
    "channels": 2,
    "duration": 214.5,
    "warnings": []
  }
}
```

`denoise_url` trả về **audio/wav** (hỗ trợ HTTP Range). `engine` = `deepfilternet` (AI) hoặc `spectral-fallback` (dự phòng).

### 1.5. Theo dõi Job — `GET /api/v1/jobs/{task_id}`

Poll mỗi 2–5 giây cho các endpoint bất đồng bộ (`separate`, `denoise`).

```bash
curl "{BASE_URL}/api/v1/jobs/{task_id}"
```

**Response 200 (JSON):**

```json
{
  "task_id": "...",
  "status": "QUEUED | RUNNING | COMPLETE | FAILED",
  "percent": 45,
  "stage": "Đang tách stem AI (40%)...",
  "error": null,
  "result": { "...": "chỉ có khi status = COMPLETE" }
}
```

---

## PHẦN 2 — STUDIO SESSION API (`/api/*`)

API theo phiên (upload 1 lần, chạy nhiều tính năng trên cùng `task_id`) — web app chính thức dùng bộ này. Dev cũng có thể dùng nếu muốn tiết kiệm băng thông upload.

### 2.1. Hệ thống

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/health` | Trạng thái server + GPU: `{status, gpu_available, version}` |

### 2.2. Upload & dữ liệu gốc

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/upload` | Upload audio (có chuẩn hóa cho studio). Trả `{task_id, duration, waveform_url, audio_url}` |
| GET | `/api/audio/{task_id}` | Master WAV 44.1kHz (hỗ trợ HTTP Range) |
| GET | `/api/waveform/{task_id}` | Mảng peaks `[[min, max], ...]` ×2000 điểm vẽ waveform |
| DELETE | `/api/session/{task_id}` | Xóa toàn bộ dữ liệu phiên |

### 2.3. Các tính năng phân tích (chạy trên task đã upload)

Tất cả trả **202** `{task_id, status: "QUEUED"}` và chạy nền — theo dõi qua 2.4.

| Method | Endpoint | Tính năng | Kết quả (`result`) |
|---|---|---|---|
| POST | `/api/analyze/quick/{task_id}` | Tempo & Key nhanh (đồng bộ, trả ngay JSON) | `{bpm, master_key, scale_mode, duration}` |
| POST | `/api/analyze/deep/{task_id}?stem_mode=4` | **Tất cả (combo)**: stems + beats + hợp âm + MIDI | `{telemetry, beats[], chords[], stems{...}, warnings[]}` |
| POST | `/api/analyze/chords/{task_id}` | Chỉ hợp âm (bỏ qua tách stem) | `{telemetry, beats[], chords[], warnings[]}` |
| POST | `/api/analyze/stems/{task_id}?stem_mode=4` | Chỉ tách stem (bỏ qua phân tích) | `{stems{...}, warnings[]}` |
| POST | `/api/analyze/denoise/{task_id}?strength=80` | Chỉ lọc nhiễu DeepFilterNet | `{denoise_url, engine, strength, ...}` |

`stem_mode`: `2` | `4` | `6` | `8`. `strength`: 0–100.

### 2.4. Theo dõi tiến trình

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/status/{task_id}` | Polling REST: `{status, percent, stage, error, result?}` |
| GET | `/api/progress/{task_id}` | **SSE stream** (`text/event-stream`): events `progress` / `complete` / `error` |

### 2.5. Tải kết quả (audio & file)

| Method | Endpoint | Trả về | Mô tả |
|---|---|---|---|
| GET | `/api/stems/{task_id}/{stem_name}` | audio/wav | Từng stem (Range OK). `stem_name`: vocals, drums, bass, other, guitar, piano, instrumental |
| GET | `/api/denoised/{task_id}` | audio/wav | Audio đã lọc nhiễu (Range OK) |
| GET | `/api/export/stems-zip/{task_id}` | application/zip | Toàn bộ stems trong 1 file ZIP |
| GET | `/api/export/midi/{task_id}` | audio/midi | MIDI đa track (hợp âm + metronome) |
| GET | `/api/export/json/{task_id}` | application/json | Toàn bộ kết quả phân tích dạng JSON |

---

## Ví dụ flow hoàn chỉnh (Python)

```python
import requests, time

BASE = "https://smk285pro--ai-audio-lab-fastapi-web.modal.run"

# 1) Hợp âm — JSON, một request duy nhất
r = requests.post(f"{BASE}/api/v1/chords", files={"file": open("song.mp3", "rb")}, timeout=280)
for c in r.json()["chords"]:
    print(f'{c["start"]:7.2f}s - {c["chord"]}')

# 2) Lọc nhiễu — audio, async job
r = requests.post(f"{BASE}/api/v1/denoise?strength=80",
                  files={"file": open("song.mp3", "rb")})
job = r.json()["task_id"]
while True:
    st = requests.get(f"{BASE}/api/v1/jobs/{job}").json()
    if st["status"] == "COMPLETE":
        break
    if st["status"] == "FAILED":
        raise RuntimeError(st["error"])
    time.sleep(3)
url = st["result"]["denoise_url"]
audio = requests.get(f"{BASE}{url}")
open("song_clean.wav", "wb").write(audio.content)
```

---

## Ghi chú

- Audio trả về ở dạng **WAV PCM 16-bit**, giữ đúng sample rate file gốc (v1 API & denoise); stems của studio flow ở 44.1 kHz.
- Mọi endpoint stream audio đều hỗ trợ **HTTP Range** (seek/streaming).
- Session tự dọn sau ~24h (cron dọn mỗi giờ) — tải kết quả về sớm.
- Lỗi trả về dạng FastAPI chuẩn: `{"detail": "..."}` với HTTP code tương ứng (400, 404, 409, 413, 500).
