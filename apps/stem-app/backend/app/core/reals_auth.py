"""SSO client cho stem-app backend (Bước 3 monorepo).

Verify bridge token do main-app (reals.media) cấp qua token exchange:
browser gửi `Authorization: Bearer <token>` → FastAPI dependency `require_auth`
→ POST tới main-app `/api/auth/verify-session` (server-to-server, KHÔNG CORS)
→ nhận user + tier LIVE từ DB main-app.

Bước 4: thêm `consume_separation_credit` — ghi nhận quota tách nhạc qua
main-app POST /api/usage/separation (check-and-record atomic phía main-app).

Thiết kế:
- Fail-closed: main-app không trả lời / lỗi mạng / DB lỗi (503) → từ chối request
  (503), nhất quán với chính sách của main-app. KHÔNG bao giờ chấp nhận token
  khi không verify được.
- KHÔNG tự verify JWT locally bằng shared secret: tier phải đọc live từ DB
  main-app (token payload tier có thể stale tới 24h). Nếu sau này cần bỏ network
  hop, thêm local verify + chỉ fetch tier — hiện chưa cần.
- Cache kết quả valid theo SHA-256(token), TTL ngắn (mặc định 60s) để giảm tải
  cho main-app (rate-limit 120 req/min/IP ở phía server backend này).
  Quota KHÔNG dựa vào cache — luôn hỏi /api/usage/separation (số liệu live).

Env (đặt trong .env của backend):
    REALS_MAIN_APP_URL    — URL gốc main-app (mặc định http://localhost:3000)
    REALS_AUTH_CACHE_TTL  — giây, mặc định 60; 0 = tắt cache
    REALS_AUTH_TIMEOUT    — timeout HTTP tới main-app, giây, mặc định 5
"""
from __future__ import annotations

import hashlib
import os
import time
from typing import Any, Dict, Optional, Tuple

import httpx
from fastapi import Header, HTTPException
from dotenv import load_dotenv

load_dotenv()

MAIN_APP_URL = os.getenv("REALS_MAIN_APP_URL", "http://localhost:3000").rstrip("/")
VERIFY_URL = f"{MAIN_APP_URL}/api/auth/verify-session"
RECORD_USAGE_URL = f"{MAIN_APP_URL}/api/usage/separation"
CACHE_TTL_SECONDS = float(os.getenv("REALS_AUTH_CACHE_TTL", "60"))
REQUEST_TIMEOUT_SECONDS = float(os.getenv("REALS_AUTH_TIMEOUT", "5"))

# Giới hạn kích thước cache chống phình bộ nhớ khi nhiều user (token 24h TTL)
_MAX_CACHE_ENTRIES = 512

# sha256(token) -> (monotonic_timestamp, user_dict)
_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}


class RealsAuthRequiredError(HTTPException):
    """401 — thiếu/sai token."""

    def __init__(self, detail: str = "Yêu cầu đăng nhập qua reals.media"):
        super().__init__(status_code=401, detail=detail)


class RealsAuthServiceUnavailableError(HTTPException):
    """503 — không verify được (main-app down / DB lỗi). Fail-closed."""

    def __init__(self, detail: str = "Dịch vụ xác thực tạm thời không khả dụng, vui lòng thử lại sau"):
        super().__init__(status_code=503, detail=detail)


def _cache_key(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _cache_get(token: str) -> Optional[Dict[str, Any]]:
    if CACHE_TTL_SECONDS <= 0:
        return None
    key = _cache_key(token)
    hit = _cache.get(key)
    if not hit:
        return None
    ts, data = hit
    if time.monotonic() - ts >= CACHE_TTL_SECONDS:
        _cache.pop(key, None)
        return None
    return data


def _cache_put(token: str, data: Dict[str, Any]) -> None:
    if CACHE_TTL_SECONDS <= 0:
        return
    if len(_cache) >= _MAX_CACHE_ENTRIES:
        # drop entry cũ nhất (insertion theo timestamp — đủ tốt ở quy mô này)
        oldest = min(_cache.items(), key=lambda kv: kv[1][0])[0]
        _cache.pop(oldest, None)
    _cache[_cache_key(token)] = (time.monotonic(), data)


def clear_auth_cache() -> None:
    """Xoá cache (dùng khi test hoặc force re-verify toàn bộ)."""
    _cache.clear()


async def verify_bridge_token(token: str) -> Dict[str, Any]:
    """Verify bridge token với main-app.

    Trả dict user khi hợp lệ:
        {valid, userId, email, tier, limit, usedToday, creditsRemaining, expiresAt}
    Raise RealsAuthRequiredError (401) nếu token sai/hết hạn,
    RealsAuthServiceUnavailableError (503) nếu không verify được (fail-closed),
    HTTPException(429) nếu main-app rate-limit.
    """
    cached = _cache_get(token)
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            resp = await client.post(VERIFY_URL, json={"token": token})
    except httpx.HTTPError as exc:
        raise RealsAuthServiceUnavailableError() from exc

    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="Quá nhiều yêu cầu xác thực, thử lại sau")
    if resp.status_code == 503:
        # main-app fail-closed (DB lỗi) → mình cũng fail-closed
        raise RealsAuthServiceUnavailableError()
    if resp.status_code != 200:
        raise RealsAuthServiceUnavailableError()

    try:
        data = resp.json()
    except ValueError as exc:
        raise RealsAuthServiceUnavailableError() from exc

    if not data.get("valid"):
        # KHÔNG cache kết quả invalid — token có thể được cap lại ngay sau đó
        raise RealsAuthRequiredError("Phiên đăng nhập không hợp lệ hoặc đã hết hạn")

    user = {
        "userId": data.get("userId"),
        "email": data.get("email"),
        "tier": data.get("tier", "FREE"),
        "limit": data.get("limit"),
        "usedToday": data.get("usedToday", 0),
        "creditsRemaining": data.get("creditsRemaining"),
        "expiresAt": data.get("expiresAt"),
    }
    _cache_put(token, user)
    return user


async def require_auth(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    """FastAPI dependency: yêu cầu Bearer token hợp lệ.

    Trả về dict user (userId, email, tier, limit, usedToday, creditsRemaining,
    expiresAt) + khoá "token" (bridge token gốc — dùng để ghi quota).

    Dùng:  @router.post("/api/analyze/quick/{task_id}")
           async def quick(task_id: str, user: Dict = Depends(require_auth)):
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise RealsAuthRequiredError("Thiếu Authorization: Bearer <token>")
    token = authorization[7:].strip()
    if not token:
        raise RealsAuthRequiredError("Thiếu Authorization: Bearer <token>")
    user = await verify_bridge_token(token)
    # Không đụng cache dict — ghép token vào bản copy (cache entry giữ nguyên)
    return {**user, "token": token}


async def optional_auth(authorization: Optional[str] = Header(default=None)) -> Optional[Dict[str, Any]]:
    """FastAPI dependency dạng tuỳ chọn: có token hợp lệ → trả user, không/không
    hợp lệ → None (anonymous). Lưu ý service down cũng trả None (degraded).
    Chỉ dùng cho endpoint cho phép anonymous — KHÔNG dùng cho thứ cần enforce tier.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization[7:].strip()
    if not token:
        return None
    try:
        return await verify_bridge_token(token)
    except HTTPException:
        return None


class RealsQuotaExceededError(HTTPException):
    """429 — user đã dùng hết lượt tách nhạc trong 24h qua."""

    def __init__(self, info: Dict[str, Any]):
        super().__init__(
            status_code=429,
            detail={
                "message": (
                    "Bạn đã dùng hết lượt tách nhạc miễn phí trong 24 giờ qua. "
                    "Nâng cấp gói tại reals.media để tiếp tục."
                ),
                "code": "quota_exceeded",
                "tier": info.get("tier"),
                "limit": info.get("limit"),
                "usedToday": info.get("usedToday"),
                "creditsRemaining": info.get("creditsRemaining"),
            },
        )


async def consume_separation_credit(user: Dict[str, Any], meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Ghi nhận 1 lượt tách nhạc (chặn quota) — gọi NGAY TRƯỚC khi bắt đầu GPU work.

    main-app thực hiện check-and-record atomic (transaction serializable):
      200 → còn quota, đã ghi UsageEvent → trả tier info MỚI NHẤT
      409 → hết quota → raise RealsQuotaExceededError (429)
      khác (401/429/503/lỗi mạng) → raise 503 (fail-closed: không chạy GPU
      work khi không chắc còn quota)

    `user` là dict do require_auth trả về (chứa khoá "token").
    `meta` (tuỳ chọn): {"taskId", "stemMode", "endpoint"...} để audit.
    """
    token = user.get("token")
    if not token:
        raise RealsAuthRequiredError("Thiếu bridge token để ghi nhận lượt tách nhạc")

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                RECORD_USAGE_URL,
                json={"meta": meta or {}},
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError as exc:
        raise RealsAuthServiceUnavailableError() from exc

    if resp.status_code == 200:
        try:
            data = resp.json()
        except ValueError as exc:
            raise RealsAuthServiceUnavailableError() from exc
        if not data.get("allowed"):
            raise RealsAuthServiceUnavailableError()
        return data

    if resp.status_code == 409:
        try:
            data = resp.json()
        except ValueError:
            data = {}
        raise RealsQuotaExceededError(data)

    # 401 (token vừa hết hạn giữa phiên), 429 (rate-limit), 503 (DB) → 503/401
    if resp.status_code == 401:
        raise RealsAuthRequiredError("Phiên đăng nhập không hợp lệ hoặc đã hết hạn")
    raise RealsAuthServiceUnavailableError()
