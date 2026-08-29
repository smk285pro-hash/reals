# AI Audio Lab Studio 2026

Hệ thống phân tích âm nhạc chuyên sâu, tách nguồn âm (Stem Separation), trích xuất hòa âm & nhịp điệu (Chroma, Key, BPM, Downbeat, 169-State Viterbi HMM Chords) và xuất bản MIDI SMF-1 đa track.

---

## 1. Bảng 4 Chế Độ Tách Nguồn Âm (Stem Modes)

| Mode | Nguồn âm (Stems) | Model AI (Demucs) | Cấu hình & Fallback | VRAM khuyến nghị |
|:---:|---|---|---|:---:|
| **2** | `vocals`, `instrumental` | `htdemucs` | Tách Vocals và lấy hiệu dư lượng ($Mix - Vocals$) | $\ge 4\text{ GB}$ (hoặc CPU) |
| **4** | `vocals`, `drums`, `bass`, `other` | `htdemucs` | Hybrid Transformer v4 (4 stems chuẩn) / HPSS DSP Fallback | $\ge 6\text{ GB}$ (hoặc CPU) |
| **6** | `vocals`, `drums`, `bass`, `other`, `guitar`, `piano` | `htdemucs_6s` | 6 Stems chuyên sâu / Tự động hạ về 4 stems trên DSP Fallback | $\ge 8\text{ GB}$ |
| **8** | `vocals`, `drums`, `bass`, `other`, `guitar`, `piano`, `strings`, `synth` | `htdemucs_6s` + Mel-Band RoFormer | Tách tiếp `other` nếu có checkpoint RoFormer; nếu không trả 6 stems | $\ge 12\text{ GB}$ |

---

## 2. Hướng Dẫn Cài Đặt & Khởi Chạy

### A. Chạy Trực Tiếp (Local Python 3.10+)

1. **Cài đặt thư viện nền tảng (DSP):**
   ```bash
   pip install -r backend/requirements.txt
   ```

2. **(Tùy chọn) Cài đặt AI/ML GPU Acceleration:**
   - **Với GPU NVIDIA CUDA 12.4:**
     ```bash
     pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
     pip install -r backend/requirements-ml.txt
     ```
   - **Với CPU thuần:**
     ```bash
     pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
     pip install -r backend/requirements-ml.txt
     ```

3. **Khởi chạy Backend:**
   ```bash
   # Linux / macOS / Git Bash:
   bash backend/run_backend.sh

   # Windows PowerShell:
   python -m uvicorn app.main:app --host 0.0.0.0 --port 3031 --reload
   ```

---

### B. Chạy Qua Docker & Docker Compose

- **Chế độ DSP Fallback (nhẹ, không tải PyTorch):**
  ```bash
  docker-compose up --build
  ```

- **Chế độ AI GPU Full Power:**
  Mở file `docker-compose.yml`, đổi `INSTALL_ML: "true"` và mở comment khối `deploy.resources.reservations.devices` (yêu cầu cài NVIDIA Container Toolkit), sau đó chạy:
  ```bash
  docker-compose up --build
  ```

---

## 3. Bảng Endpoint API Hoàn Chỉnh (11 Routes)

| Phương thức | Endpoint | Mô tả chức năng |
|:---:|---|---|
| `GET` | `/api/health` | Kiểm tra trạng thái server & nhận diện GPU CUDA. |
| `POST` | `/api/upload` | Tải file âm thanh lên, chuẩn hóa EBU R128 (-14 LUFS) và tạo 2000 peak points waveform. |
| `GET` | `/api/audio/{task_id}` | Phát master audio hỗ trợ HTTP 206 Partial Content (Streaming Range). |
| `GET` | `/api/waveform/{task_id}` | Lấy mảng 2000 cặp $[min, max]$ biên độ sóng âm. |
| `POST` | `/api/analyze/quick/{task_id}` | Phân tích nhanh ($< 2\text{s}$): BPM, Master Key, Scale Mode (Krumhansl-Schmuckler). |
| `POST` | `/api/analyze/deep/{task_id}?stem_mode=4` | Kích hoạt bộ máy phân tích chuyên sâu đa luồng bất đồng bộ (202 Accepted). |
| `GET` | `/api/progress/{task_id}` | Server-Sent Events (SSE) stream theo dõi tiến trình 5% $\rightarrow$ 100%. |
| `GET` | `/api/stems/{task_id}/{stem_name}` | Nghe / tải từng stem WAV riêng biệt (hỗ trợ HTTP 206 Range). |
| `GET` | `/api/export/midi/{task_id}` | Tải file MIDI SMF-1 đa track (Chords, Bassline, Beat Click) tương thích 100% DAW. |
| `GET` | `/api/export/stems-zip/{task_id}` | Tải file nén `.zip` in-memory chứa trọn bộ các stem WAV. |
| `GET` | `/api/export/json/{task_id}` | Tải file JSON kết quả phân tích đầy đủ. |
| `DELETE` | `/api/session/{task_id}` | Dọn dẹp toàn bộ dữ liệu session trên ổ đĩa và bộ nhớ. |

---

## 4. Xử Lý Sự Cố (Troubleshooting)

1. **Tràn bộ nhớ GPU (CUDA Out Of Memory - OOM):**
   - Hệ thống tự động đo VRAM khả dụng: nếu $< 4\text{GB}$, tự hạ `segment` xuống $8\text{s}$; với file dài $> 300\text{s}$, tự động kích hoạt chế độ chunking $120\text{s}$ overlap $10\text{s}$ với crossfade Cosine.
   - Sau mỗi lượt suy luận, hệ thống giải phóng bộ nhớ bằng `model.cpu()`, `torch.cuda.empty_cache()` và `gc.collect()`.

2. **Chưa cài PyTorch / Demucs / BeatNet:**
   - Hệ thống tự động chuyển sang chế độ **Spectral HPSS DSP Fallback** và **Librosa Rhythm Tracking**, hoàn toàn không crash, trả về đầy đủ 4 stem, hợp âm và nhịp điệu với warning kèm theo.
