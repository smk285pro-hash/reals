// Auth init cho stem-app SPA (Bước 4 monorepo).
//
// Luồng SSO: lần đầu vào app → redirect sang main-app authorize → quay về với
// #token=<JWT> → extractTokenFromLocation() lưu localStorage + xoá hash →
// loadCurrentUser() GET /api/auth/me của backend (backend verify với main-app).
// Token hết hạn 24h → mọi authFetch nhận 401 → tự silent re-auth (redirect).
import {
  configureRealsAuth,
  ensureAuth,
  extractTokenFromLocation,
  fetchAuthMe,
  getToken,
  type RealsAuthUser,
} from "@reals/auth-client";

/** URL main-app (reals.media) — nguồn đăng nhập + cấp bridge token. */
export const MAIN_APP_URL = (
  process.env.NEXT_PUBLIC_MAIN_APP_URL || "https://reals.media"
).replace(/\/+$/, "");

/** URL backend FastAPI của stem-app (đặt trùng NEXT_PUBLIC_API_URL của api-client). */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

let configured = false;

function ensureConfigured(): void {
  if (!configured) {
    configureRealsAuth({ mainAppUrl: MAIN_APP_URL });
    configured = true;
  }
}

/**
 * Khởi tạo auth ở client — gọi 1 lần khi app mount:
 * 1. configure + đọc #token= từ URL (nếu vừa redirect về) → lưu localStorage
 * 2. ensureAuth: có token → trả token; không → redirect sang main-app + trả null
 * Caller nhận null → đang được chuyển hướng, nên dừng render flow.
 */
export function initAuth(): string | null {
  ensureConfigured();
  extractTokenFromLocation();
  return ensureAuth();
}

/** Bridge token hiện tại (hoặc null — SSR / chưa đăng nhập). */
export function currentToken(): string | null {
  ensureConfigured();
  return getToken();
}

/** User + tier hiện tại — gọi GET <API_BASE>/api/auth/me (backend verify). */
export async function loadCurrentUser(): Promise<RealsAuthUser> {
  ensureConfigured();
  return fetchAuthMe(API_BASE);
}

export type { RealsAuthUser };
