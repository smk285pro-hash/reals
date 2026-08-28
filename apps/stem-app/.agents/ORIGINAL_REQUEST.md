# Original User Request

## 2026-08-19T16:28:02Z

# Teamwork Project: AI Audio Lab 2026 (Phase 1)

Xây dựng ứng dụng web hoàn chỉnh "AI Audio Lab 2026" để phân tích đặc trưng âm nhạc (BPM, Key, Chord recognition) và giao diện trực quan hóa âm thanh chuyên nghiệp (Interactive Waveform, Beat Grid, Real-time Chord Canvas, Stem Mixer Preview).

Working directory: c:/Users/smk28/Desktop/reals audio lab
Integrity mode: development

## Requirements

### R1. Backend Architecture & DSP Baseline Engine (FastAPI & Librosa)
- Xây dựng backend FastAPI với cấu trúc module hóa (`app/core/`, `app/api/`, `storage/`, `main.py`).
- Cài đặt module `audio_utils.py` để chuẩn hóa âm thanh (resample 44.1kHz, stereo to mono, kiểm tra định dạng và chuẩn hóa biên độ).
- Cài đặt module `dsp_baseline.py` chứa hàm `analyze_basic(audio_path)`:
  - Tính Onset Envelope và đo BPM + Beat/Downbeat timestamps chính xác sử dụng Dynamic Programming (`librosa.beat.beat_track`).
  - Xác định Master Key bằng Chroma STFT/CQT và thuật toán tương quan Krumhansl-Schmuckler (Major/Minor profiles).
  - Nhận diện chuỗi hợp âm Triads (Major, Minor) theo từng phách qua Template Matching, trả về mảng `[{"start": float, "end": float, "chord": str}]`.
- Cung cấp API Endpoints:
  - `POST /api/upload`: Nhận file âm thanh (MP3, WAV, FLAC, M4A, OGG), sinh Task UUID, lưu vào `storage/` và trả về `task_id`, `audio_url`.
  - `POST /api/analyze/basic`: Nhận `task_id`, gọi `analyze_basic` và trả về JSON chuẩn: `{ "task_id": str, "bpm": float, "key": str, "time_signature": str, "beats": [float], "chords": [{"start": float, "end": float, "chord": str}] }`.
  - `GET /`: Phục vụ SPA Web tĩnh.

### R2. Frontend Interactive Web Studio (HTML5, TailwindCSS, Wavesurfer.js, Canvas API)
- Giao diện Single-Page Application hiện đại (Dark Theme / Studio Look) không dùng bundler phức tạp, chạy trực tiếp:
  - **Header**: Hiển thị "AI Audio Lab 2026", trạng thái kết nối và thiết bị xử lý CPU/GPU.
  - **Khu vực Upload**: Hỗ trợ Drag & Drop file nhạc, chọn file, hiển thị thanh tiến trình tải lên và trạng thái phân tích.
  - **Interactive Waveform**: Tích hợp Wavesurfer.js 7.x với Play/Pause, phím tắt Spacebar, seek, zoom dải sóng, và hiển thị các đường Beat Grid Lines màu vàng mờ khớp timestamps.
  - **Chord Timeline Canvas**: Canvas API vẽ các khối hợp âm (Chord Blocks) đồng bộ song song với Waveform, tự động highlight hợp âm đang phát theo thời gian thực (Playhead tracking).
  - **Music Telemetry Bar**: Thẻ hiển thị trực quan Tempo (BPM), Master Key, Time Signature, Độ dài bản nhạc.
  - **4-Stem Mixer Preview**: Bảng 4 kênh (Vocals, Drums, Bass, Other) có Volume fader, nút Mute và Solo.

### R3. Error Handling & Deployment Readiness
- Backend bẫy lỗi toàn diện (HTTPException, định dạng file không hợp lệ, lỗi DSP decoding).
- Cung cấp đầy đủ `requirements.txt` và file cấu hình để khởi chạy `uvicorn main:app --reload`.

## Acceptance Criteria

### Backend & DSP Verification
- [ ] API khởi động thành công và phục vụ đầy đủ các endpoint `/`, `/api/upload`, `/api/analyze/basic`.
- [ ] File audio tải lên được xử lý qua `dsp_baseline.py` và trả về đúng schema JSON với danh sách BPM, Key, Beats, Chords hợp lệ.
- [ ] Xử lý ngoại lệ chuẩn khi upload file hỏng hoặc sai định dạng (trả về mã HTTP 400/422 rõ ràng).

### Frontend & Visualizer Verification
- [ ] Giao diện Web hiển thị đầy đủ Header, Upload Box, Waveform, Beat Grid, Chord Canvas, Telemetry Bar, 4-Stem Mixer.
- [ ] Tải file nhạc lên: Wavesurfer load âm thanh thành công, vẽ đầy đủ Beat Grid và Chord Blocks.
- [ ] Khi phát nhạc (Play), con trỏ chạy mượt mà và khối hợp âm tương ứng với vị trí thời gian hiện tại được highlight theo thời gian thực.
- [ ] Thanh Mixer hỗ trợ tương tác Fader, Solo, Mute trực quan.
