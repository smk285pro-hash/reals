# Reals Web — Monorepo

Gộp 2 dự án thành 1 monorepo, giữ nguyên toàn bộ git history:

| Ứng dụng | Đường dẫn | Stack | Port (dev) | Vai trò |
|---|---|---|---|---|
| **main-app** (reals.media) | `.` (repo root) | Next.js 16 + React 19 + Prisma 6 + PostgreSQL | 3000 | Nguồn dữ liệu chính (users, products, purchases). Auth = NextAuth v4 (Google OAuth + email/password) |
| **stem-app** (stem.reals.media) | `apps/stem-app/` | Next.js 15 frontend + FastAPI backend (Python) | frontend 3100, backend 3031 | AI Audio Lab Studio 2026 — tách nguồn âm (Demucs 2/4/6/8 stems), phân tích hoà âm/nhịp (Chords Viterbi HMM, BPM, Key), xuất MIDI SMF-1 |

> Lưu ý: stem-app là ứng dụng 2 tiến trình — frontend Next.js (`src/`) gọi backend FastAPI (`backend/`) qua `NEXT_PUBLIC_API_URL`. Backend chứa ML workload (torch/demucs) nên phải chạy server Python riêng (Oracle Cloud GPU hoặc Modal), không chạy được trên Vercel serverless.

## Git history

- **main-app quay về root repo** (2026-08-29, sau khi merge PR #1): Vercel project `realstore` (reals.media) vốn build từ repo root từ thời single-repo. Để deploy tiếp tục chạy mà **không cần đổi Root Directory** trên dashboard, `apps/main-app/*` đã được `git mv` ngược lên root (rename detection giữ `git log --follow`). pnpm workspace vẫn hoạt động: `pnpm-workspace.yaml` (root) + `workspaces` field trong `package.json`.
- `apps/stem-app/` — merge commit với `--allow-unrelated-histories`, parent thứ 2 trỏ tới commit gốc của repo `reals-lab-ai` (giữ nguyên vẹn lịch sử). Repo `reals-lab-ai` gốc giữ nguyên, không đụng tới.
- ⚠️ Lịch sử nhánh đã được viết lại 1 lần (2026-08-29): import ban đầu dùng nhầm repo cũ `reals-audio-lab` (đã lỗi thời), đã thay bằng `reals-lab-ai`. Branch local `merge-monorepo-backup-wrongrepo` giữ lại trạng thái cũ để đối chiếu, có thể xoá khi đã xác nhận.

## Lệnh thường dùng

```bash
pnpm install                      # cài dependencies toàn workspace

pnpm dev                          # chạy main-app (root, next dev :3000)
pnpm --filter stem-app dev        # chạy stem-app FRONTEND (next dev :3100)
pnpm --filter stem-app backend    # chạy stem-app BACKEND (uvicorn :3031)
                                  # (cần python + uvicorn trong PATH, hoặc activate venv có đủ deps)

pnpm build                        # build main-app (root)
pnpm --filter stem-app build      # build riêng stem-app frontend
```

Frontend stem-app dev gọi backend tại `NEXT_PUBLIC_API_URL` (mặc định same-origin). Khi dev local, tạo `apps/stem-app/.env.local`:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:3031
```

Dependencies Python cho backend stem-app (trước lần chạy đầu):

```bash
cd apps/stem-app
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt

# (tuỳ chọn) ML GPU — CPU-only: cài torch nhẹ trước để tránh kéo CUDA wheels ~2GB
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install -r backend/requirements-ml.txt
```

Backend tự fallback sang DSP (HPSS + librosa) khi thiếu torch/demucs/BeatNet — không crash.

## Deploy

- **main-app**: Vercel project `realstore` (reals.media), build từ **repo root** — main-app đặt tại root nên KHÔNG cần cấu hình Root Directory. Lockfile duy nhất `pnpm-lock.yaml` ở root → Vercel tự dùng pnpm; không có package-lock.json/bun.lock ở root (đã xoá để tránh Vercel detect nhầm package manager).
- **stem-app**: 2 thành phần tách bạch:
  - **Backend** (FastAPI): production đang chạy trên **Modal serverless** (GPU T4) — `https://smk285pro--ai-audio-lab-fastapi-web.modal.run`. File deploy `apps/stem-app/modal_app.py` (đã gắn SSO + tier gating, 12 endpoint auth + quota). Deploy: `cd apps/stem-app && modal deploy modal_app.py`. Chi tiết + thứ tự deploy: `apps/stem-app/DEPLOY.md`. *(Phương án self-host VPS qua Dockerfile.backend vẫn giữ trong repo nhưng không dùng.)*
  - **Frontend** (Next.js): Vercel project riêng (Root Directory `apps/stem-app`); `.env.production` đã trỏ `NEXT_PUBLIC_API_URL` tới Modal URL + `NEXT_PUBLIC_MAIN_APP_URL=https://reals.media`.
  - SSO với main-app qua token exchange (`packages/auth-client`) — backend Modal verify bridge token với main-app, hết quota → 429.
- **Thứ tự deploy khi lên production**: (1) chạy `sql/001-add-subscription-and-usageevent.sql` (ở repo root) trên DB + set `STEM_SSO_SECRET` trên Vercel — PR monorepo đã merge vào main 2026-08-29; (2) `modal deploy` backend SSO; (3) deploy frontend stem-app. Deploy sai thứ tự → backend Modal fail-closed 503.

## Lockfiles

- `pnpm-lock.yaml` (root) — canonical, dùng cho mọi lệnh pnpm. Importer root = main-app (đặt ở root), kèm `apps/stem-app` + `packages/*`.
- `package-lock.json` / `bun.lock` (main-app) + `apps/stem-app/package-lock.json` — đã **xoá khỏi repo** (2026-08-29): để Vercel detect đúng pnpm qua `pnpm-lock.yaml` duy nhất, tránh cài thiếu workspace package `@reals/ui`.

## Cấu trúc dự kiến (hoàn thiện dần theo các bước)

```
reals/
  (repo root)         # main-app Next.js 16 — reals.media (Vercel build từ root)
  apps/
    stem-app/          # Next.js 15 frontend + FastAPI backend — app con
  packages/
    auth-client/       # (Bước 3) @reals/auth-client — SSO client TS cho frontend
    ui/                # (Bước 5) @reals/ui — design tokens + TierBadge dùng chung
  package.json         # main-app deps + workspaces (pnpm-workspace.yaml cạnh bên)
```

## packages/ui — design tokens + components (Bước 5)

Vấn đề: main-app dùng Tailwind **v4** (CSS-first), stem-app dùng Tailwind **v3** (JS config) → không share được config Tailwind trực tiếp. Giải pháp: tokens là **thuần CSS custom properties** (`tokens.css`) + component dùng inline style bám token → chạy được với mọi Tailwind version.

- `tokens.css` — `--reals-*` (brand oklch, surface, trạng thái, màu 4 tier, radius, font). Import trong globals.css của app: `@import "@reals/ui/tokens.css";` (resolve qua workspace, đã test cả Turbopack v4 lẫn Next 15 v3).
- `src/index.tsx` — `TierBadge` (badge tier + "còn X/Y lượt" / "Không giới hạn" — đang dùng thật ở stem-app Header, sẵn sàng cho trang account/pricing của main-app), `StatusDot`, `TIER_LABELS`. Không phụ thuộc Tailwind — nhận `className` tuỳ ý.
- `tailwind.preset.js` — preset Tailwind v3 (stem-app): `presets: [require('@reals/ui/tailwind.preset.js')]` → utility `bg-reals-brand`, `text-reals-tier-max-fg`...

Tích hợp hiện tại: stem-app Header dùng `TierBadge` + preset + tokens (badge đếm "còn 3/3 → 2/3 lượt" realtime theo quota, style bám token `--reals-tier-*`); main-app import tokens.css (additive, không đụng style hiện có).

## packages/auth-client — SSO client (Bước 3)

Hai phần, một cơ chế token exchange với main-app:

**1. `packages/auth-client` (TypeScript)** — cho stem-app frontend (Next.js):

- Quản lý bridge token: `extractTokenFromLocation()` đọc `#token=` từ URL (sau khi authorize redirect về), lưu localStorage, xoá hash khỏi address bar.
- Silent re-auth: `ensureAuth()` (redirect sang main-app khi chưa có token), `authFetch()` (tự gắn `Authorization: Bearer`, gặp 401 → clear token + redirect ngầm qua authorize — user giữ session NextAuth 30 ngày nên không cần gõ mật khẩu lần 2).
- `fetchAuthMe(apiBaseUrl)` gọi endpoint `/api/auth/me` của stem backend (thêm ở Bước 4).
- Browser KHÔNG gọi thẳng API main-app (không cần mở CORS) — mọi verify đều do stem backend thực hiện server-to-server.
- Import: `import { configureRealsAuth, authFetch } from '@reals/auth-client'` + thêm `'@reals/auth-client'` vào `transpilePackages` trong `next.config.ts` của stem-app.

**2. `apps/stem-app/backend/app/core/reals_auth.py` (Python/FastAPI)** — cho stem backend:

- `require_auth` (FastAPI dependency): đọc Bearer token → POST main-app `/api/auth/verify-session` → trả user + tier LIVE. Dùng: `user: dict = Depends(require_auth)`.
- `optional_auth`: dạng tuỳ chọn (anonymous → None) cho endpoint không bắt buộc đăng nhập.
- Fail-closed: main-app down / DB lỗi → 503 từ chối request (không bao giờ chấp nhận token khi verify không được).
- Cache kết quả valid 60s theo SHA-256(token) — giảm tải cho main-app (rate-limit 120 req/min/IP).
- Env backend: `REALS_MAIN_APP_URL` (mặc định http://localhost:3000), `REALS_AUTH_CACHE_TTL` (60), `REALS_AUTH_TIMEOUT` (5).
- Lưu ý: đặt trong backend (không phải packages/) vì Docker build context của stem-app chỉ gồm apps/stem-app.

Kiểm thử (2026-08-29): TS client 23/23 unit + typecheck OK; Python client 18/18 E2E (verify hợp lệ/rác/hết hạn, cache, FastAPI dependency, fail-closed khi main-app chết); regression Step 2 22/22 PASS.

## Bước 4 — SSO + tier gating toàn chuỗi (đã gắn vào stem-app)

**Kiến trúc quota tách nhạc** (giá trị limit ở `src/lib/tiers.ts` — FREE 3 / BASIC 10 / MAX 30 / ULTRA ∞ mỗi 24h, PROVISIONAL):

```
SPA stem-app ── Bearer bridge token ──► stem backend FastAPI
                                          │ require_auth (verify qua main-app, cache 60s)
                                          │ consume_separation_credit
                                          ▼
                       main-app POST /api/usage/separation
                       (check-and-record ATOMIC, transaction Serializable)
                       200 → ghi UsageEvent, trả tier info mới nhất
                       409 → hết quota → backend trả 429 quota_exceeded
```

**Endpoint stem backend** (`apps/stem-app/backend/app/api/routes.py`):

- `GET /api/auth/me` — user + tier hiện tại (SPA hiển thị badge).
- Bảo vệ bằng `require_auth`: `upload`, `analyze/quick|chords|denoise`, `session DELETE`, `v1/analyze|chords|denoise`.
- Bảo vệ + quota (`consume_separation_credit`): `analyze/deep`, `analyze/stems`, `v1/separate` — quota ghi TRƯỚC khi khởi động GPU work; response 202 kèm `quota` (tier info mới nhất) để SPA cập nhật badge ngay không lag cache.
- Giữ capability-URL (uuid4 không đoán được, TTL session): `status`, `progress` (SSE — EventSource không gửi được header), `audio`, `stems`, `denoised`, `export/*`, `waveform`.
- CORS theo env `REALS_ALLOWED_ORIGINS` (mặc định đã gồm `:3000`, `:3100`, `https://stem.reals.media`).

**Frontend** (`apps/stem-app/src/`):

- `lib/auth.ts` — `initAuth()` (đọc `#token=` → localStorage → xoá hash; thiếu token → redirect authorize), `loadCurrentUser()`.
- `lib/api-client.ts` — mọi call được bảo vệ đi qua `authFetch` (Bearer + 401 → silent re-auth); XHR upload gắn `authHeaders()` **sau** `xhr.open()`; lỗi FastAPI (detail string | `{message}`) → message tiếng Việt (429 quota → "Bạn đã dùng hết lượt tách nhạc miễn phí trong 24 giờ qua. Nâng cấp gói tại reals.media để tiếp tục.").
- `page.tsx` + `Header.tsx` — badge tier (FREE/BASIC/MAX/ULTRA) + "còn X/Y lượt" / "Không giới hạn"; cập nhật NGAY từ `quota` trong response 202.
- Env: `NEXT_PUBLIC_MAIN_APP_URL` (dev `http://localhost:3000`, prod `https://reals.media`); `NEXT_PUBLIC_API_URL` để TRỐNG — API call đi same-origin qua rewrite `/api/*` của next.config.ts → `BACKEND_API_URL` (default `http://127.0.0.1:3031`) → không cần CORS khi deploy cùng VPS.

**Kiểm thử Bước 4 (2026-08-29)**: E2E API 36/36 PASS (3 tiến trình thật: embedded PG + `next start` :3000 + uvicorn :3031) — token exchange, auth gating mọi endpoint, quota FREE 3 lượt → 429 lần 4, không bypass qua v1, chords-only không tiêu quota, live tier upgrade BASIC giữa phiên, quota trong response 202, CORS :3100, verify-session regression, fail-closed 503 khi main-app chết. Browser E2E (agent-browser, production build :3100): redirect login → token → badge "FREE còn 3/3 lượt" → upload XHR Bearer → deep/stems badge đếm 3→2→1→0 realtime → lần 4 hiện banner hết quota. Browser test bắt được 2 bug thật (XHR setRequestHeader trước open; MultiEdit gán nhầm return chords) — cả hai đã fix + thêm regression test.
