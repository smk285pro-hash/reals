# Reals Web — Monorepo

Gộp 2 dự án thành 1 monorepo, giữ nguyên toàn bộ git history:

| Ứng dụng | Đường dẫn | Stack | Port (dev) | Vai trò |
|---|---|---|---|---|
| **main-app** (reals.media) | `apps/main-app/` | Next.js 16 + React 19 + Prisma 6 + PostgreSQL | 3000 | Nguồn dữ liệu chính (users, products, purchases). Auth = NextAuth v4 (Google OAuth + email/password) |
| **stem-app** (stem.reals.media) | `apps/stem-app/` | Python FastAPI + SPA tĩnh | 8000 | Tách nhạc AI (Demucs). ML workload — chạy server Python riêng (Oracle Cloud GPU), không chạy được trên Vercel serverless |

## Git history

- `apps/main-app/` — di chuyển bằng `git mv` từ root repo `reals` (88 commits, rename detection giữ `git log --follow` hoạt động).
- `apps/stem-app/` — merge commit với `--allow-unrelated-histories`, parent thứ 2 trỏ tới commit gốc của repo `reals-audio-lab` (giữ nguyên vẹn lịch sử). Repo gốc `reals-audio-lab` giữ nguyên, không đụng tới.

## Lệnh thường dùng

```bash
pnpm install                      # cài dependencies toàn workspace

pnpm dev --filter main-app        # chạy main-app (next dev :3000) qua turbo
pnpm dev --filter stem-app        # chạy stem-app (uvicorn :8000) qua turbo
pnpm --filter main-app dev        # tương đương, gọi trực tiếp qua pnpm
pnpm --filter stem-app dev

pnpm build                        # build tất cả apps (turbo cache)
pnpm --filter main-app build      # build riêng main-app
```

Lưu ý stem-app là ứng dụng Python: trước lần chạy đầu cần cài dependencies:

```bash
cd apps/stem-app
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

(CPU-only: có thể cài torch nhẹ trước — `pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu` — rồi mới `pip install -r requirements.txt` để tránh kéo CUDA wheels ~2GB.)

## Deploy

- **main-app**: giữ nguyên Vercel. ⚠️ Khi merge nhánh `merge-monorepo` vào `main`, phải đổi **Root Directory** của Vercel project thành `apps/main-app` trong cùng cửa sổ bảo trì (vì code đã chuyển từ root vào subfolder). Production hiện tại không bị ảnh hưởng cho tới khi merge.
- **stem-app**: deploy trên server Python riêng (Oracle Cloud GPU), trỏ DNS `stem.reals.media` về server đó. SSO với main-app qua token exchange (xem `packages/auth-client` — sẽ thêm ở các bước sau).

## Lockfiles

- `pnpm-lock.yaml` (root) — canonical, dùng cho mọi lệnh pnpm.
- `apps/main-app/package-lock.json` + `bun.lock` — legacy từ thời single-repo, giữ lại để tham chiếu; không dùng nữa.

## Cấu trúc dự kiến (hoàn thiện dần theo các bước)

```
reals/
  apps/
    main-app/          # Next.js 16 — nguồn dữ liệu chính
    stem-app/          # FastAPI + SPA — app con
  packages/
    ui/                # (Bước 5) design tokens + components dùng chung
    auth-client/       # (Bước 3) SDK: verifyToken, getUserTier, redirectToLogin
  package.json         # pnpm workspaces + turbo
  turbo.json
```
