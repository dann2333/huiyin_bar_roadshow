"""
OAuth2 认证路由
处理 SecondMe OAuth2 授权回调和 Token 管理
Token 持久化到文件，避免 --reload 重启后丢失
"""
import logging
import os
import secrets
import time

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, JSONResponse

from app.client.secondme import SecondMeClient
from app.config import FRONTEND_URL
from app.utils.safe_json import load_json, update_json

logger = logging.getLogger(__name__)
router = APIRouter(tags=["认证"])

_secondme = SecondMeClient()

# NOTE: CSRF state 持久化到文件，解决 uvicorn --reload 重启丢失的问题
STATE_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "state_store.json")
# NOTE: state 有效期 10 分钟，超时自动清理
STATE_TTL_SECONDS = 600


def _create_state() -> str:
    """生成随机 state 并持久化，同时清理过期条目（线程安全）"""
    state = secrets.token_urlsafe(16)
    now = time.time()

    def updater(store: dict) -> dict:
        # 清理过期的 state
        cleaned = {s: t for s, t in store.items() if now - t < STATE_TTL_SECONDS}
        cleaned[state] = now
        return cleaned

    update_json(STATE_FILE, updater)
    return state


def _validate_state(state: str) -> bool:
    """
    验证 state 是否合法且未过期（线程安全）
    验证成功后立即删除，防止重放攻击
    """
    if not state:
        return False

    result = {"valid": False}

    def updater(store: dict) -> dict | None:
        created_at = store.get(state)
        if created_at is None:
            logger.warning("CSRF state 验证失败: state 不存在 (%s)", state)
            return None
        if time.time() - created_at > STATE_TTL_SECONDS:
            logger.warning("CSRF state 验证失败: state 已过期 (%s)", state)
            del store[state]
            return store
        # NOTE: 验证通过后立即删除，确保 state 只能使用一次
        del store[state]
        result["valid"] = True
        return store

    update_json(STATE_FILE, updater)
    return result["valid"]


# NOTE: Token 持久化到文件，解决 uvicorn --reload 重启丢失的问题
TOKEN_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "token_store.json")


@router.get("/api/auth/login")
async def login() -> RedirectResponse:
    """生成 SecondMe OAuth2 授权 URL 并重定向"""
    state = _create_state()
    auth_url = _secondme.get_auth_url(state=state)
    return RedirectResponse(url=auth_url)


@router.get("/api/auth/state")
async def get_state() -> JSONResponse:
    """
    前端 exchange 流程专用：生成 state 并返回
    前端发起 OAuth 授权前调用，获取 state 存入 sessionStorage
    """
    state = _create_state()
    return JSONResponse({"state": state})


@router.get("/api/auth/callback")
async def oauth_callback(code: str, state: str = "") -> RedirectResponse:
    """OAuth2 回调（后端直接接收时使用）"""
    # NOTE: 验证 state 防止 CSRF 攻击
    if not _validate_state(state):
        logger.warning("OAuth2 回调 CSRF 验证失败: state=%s", state)
        return RedirectResponse(url=f"{FRONTEND_URL}/?auth=csrf_error")

    token_resp = await _secondme.exchange_token(code)
    if not token_resp:
        return RedirectResponse(url=f"{FRONTEND_URL}/?auth=failed")

    session_key = token_resp.access_token[:16] if token_resp.access_token else "default"

    def updater(store: dict) -> dict:
        store[session_key] = {
            "access_token": token_resp.access_token,
            "refresh_token": token_resp.refresh_token,
            "expires_in": token_resp.expires_in,
            "obtained_at": int(time.time()),
        }
        return store

    update_json(TOKEN_FILE, updater)
    logger.info("OAuth2 授权成功（回调模式）, session_key: %s", session_key)

    return RedirectResponse(
        url=f"{FRONTEND_URL}/?auth=success&session={session_key}"
    )


@router.post("/api/auth/exchange")
async def exchange_code(request: Request) -> JSONResponse:
    """前端转发授权码，换取 Token"""
    body = await request.json()
    code = body.get("code", "")
    state = body.get("state", "")

    if not code:
        return JSONResponse({"error": "缺少 code 参数"}, status_code=400)

    # NOTE: 验证 state 防止 CSRF 攻击
    if not _validate_state(state):
        logger.warning("OAuth2 exchange CSRF 验证失败: state=%s", state)
        return JSONResponse({"error": "state 验证失败，请重新登录"}, status_code=403)

    token_resp = await _secondme.exchange_token(code)
    if not token_resp:
        return JSONResponse({"error": "换取 Token 失败"}, status_code=401)

    session_key = token_resp.access_token[:16] if token_resp.access_token else "default"

    def updater(store: dict) -> dict:
        store[session_key] = {
            "access_token": token_resp.access_token,
            "refresh_token": token_resp.refresh_token,
            "expires_in": token_resp.expires_in,
            "obtained_at": int(time.time()),
        }
        return store

    update_json(TOKEN_FILE, updater)
    logger.info("OAuth2 授权成功（exchange 模式）, session_key: %s", session_key)

    return JSONResponse({
        "session_key": session_key,
        "expires_in": token_resp.expires_in,
    })


@router.post("/api/auth/refresh")
async def refresh_token(request: Request) -> JSONResponse:
    """刷新过期的 Access Token"""
    body = await request.json()
    session_key = body.get("session_key", "")
    stored = load_json(TOKEN_FILE).get(session_key)
    if not stored:
        return JSONResponse({"error": "session not found"}, status_code=401)

    token_resp = await _secondme.refresh_token(stored["refresh_token"])
    if not token_resp:
        return JSONResponse({"error": "refresh failed"}, status_code=401)

    def updater(store: dict) -> dict:
        store[session_key] = {
            "access_token": token_resp.access_token,
            "refresh_token": token_resp.refresh_token,
            "expires_in": token_resp.expires_in,
            "obtained_at": int(time.time()),
        }
        return store

    update_json(TOKEN_FILE, updater)
    return JSONResponse({"message": "refreshed", "expires_in": token_resp.expires_in})


@router.post("/api/auth/logout")
async def logout(request: Request) -> JSONResponse:
    """退出登录：清除 Token 存储"""
    body = await request.json()
    session_key = body.get("session_key", "")

    def updater(store: dict) -> dict:
        if session_key and session_key in store:
            del store[session_key]
            logger.info("用户退出登录, session_key: %s", session_key)
        else:
            store.clear()
            logger.info("清除全部 Token 存储")
        return store

    update_json(TOKEN_FILE, updater)
    return JSONResponse({"message": "logged out"})


# NOTE: Token 过期提前 5 分钟触发自动刷新
TOKEN_REFRESH_MARGIN_SECONDS = 300


async def get_access_token(session_key: str) -> str | None:
    """
    获取已存储的 access_token（供其他路由使用）
    自动检测过期并使用 refresh_token 刷新（线程安全）
    """
    stored = load_json(TOKEN_FILE).get(session_key)
    if not stored:
        return None

    # 计算 Token 是否即将过期
    obtained_at = stored.get("obtained_at", 0)
    expires_in = stored.get("expires_in", 7200)
    elapsed = int(time.time()) - obtained_at

    if elapsed >= expires_in - TOKEN_REFRESH_MARGIN_SECONDS:
        # NOTE: Token 即将过期，自动刷新
        refresh_token_val = stored.get("refresh_token", "")
        if not refresh_token_val:
            logger.warning("无 refresh_token，无法自动刷新: session_key=%s", session_key)
            return stored["access_token"]

        logger.info(
            "Token 即将过期 (已经过 %ds / 有效期 %ds)，自动刷新: session_key=%s",
            elapsed, expires_in, session_key,
        )
        token_resp = await _secondme.refresh_token(refresh_token_val)
        if token_resp:
            def updater(store: dict) -> dict:
                store[session_key] = {
                    "access_token": token_resp.access_token,
                    "refresh_token": token_resp.refresh_token,
                    "expires_in": token_resp.expires_in,
                    "obtained_at": int(time.time()),
                }
                return store

            update_json(TOKEN_FILE, updater)
            logger.info("Token 自动刷新成功: session_key=%s", session_key)
            return token_resp.access_token
        else:
            logger.error("Token 自动刷新失败，使用旧 Token: session_key=%s", session_key)
            return stored["access_token"]

    return stored["access_token"]
