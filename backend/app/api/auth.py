"""
OAuth2 认证路由
处理 SecondMe OAuth2 授权回调和 Token 管理
Token 持久化到文件，避免 --reload 重启后丢失
"""
import json
import logging
import os

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, JSONResponse

from app.client.secondme import SecondMeClient

logger = logging.getLogger(__name__)
router = APIRouter(tags=["认证"])

_secondme = SecondMeClient()

# NOTE: Token 持久化到文件，解决 uvicorn --reload 重启丢失的问题
TOKEN_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "token_store.json")


def _load_tokens() -> dict[str, dict]:
    """从文件加载 token 存储"""
    try:
        if os.path.exists(TOKEN_FILE):
            with open(TOKEN_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        logger.warning("Token 文件读取失败: %s", e)
    return {}


def _save_tokens(store: dict[str, dict]) -> None:
    """将 token 存储写入文件"""
    try:
        with open(TOKEN_FILE, "w", encoding="utf-8") as f:
            json.dump(store, f, ensure_ascii=False)
    except IOError as e:
        logger.error("Token 文件写入失败: %s", e)


@router.get("/api/auth/login")
async def login() -> RedirectResponse:
    """生成 SecondMe OAuth2 授权 URL 并重定向"""
    state = "echo_tavern_state"
    auth_url = _secondme.get_auth_url(state=state)
    return RedirectResponse(url=auth_url)


@router.get("/api/auth/callback")
async def oauth_callback(code: str, state: str = "") -> RedirectResponse:
    """OAuth2 回调（后端直接接收时使用）"""
    token_resp = await _secondme.exchange_token(code)
    if not token_resp:
        return RedirectResponse(url="http://localhost:5173/?auth=failed")

    session_key = token_resp.access_token[:16] if token_resp.access_token else "default"
    store = _load_tokens()
    store[session_key] = {
        "access_token": token_resp.access_token,
        "refresh_token": token_resp.refresh_token,
        "expires_in": token_resp.expires_in,
    }
    _save_tokens(store)
    logger.info("OAuth2 授权成功（回调模式）, session_key: %s", session_key)

    return RedirectResponse(
        url=f"http://localhost:5173/?auth=success&session={session_key}"
    )


@router.post("/api/auth/exchange")
async def exchange_code(request: Request) -> JSONResponse:
    """前端转发授权码，换取 Token"""
    body = await request.json()
    code = body.get("code", "")
    if not code:
        return JSONResponse({"error": "缺少 code 参数"}, status_code=400)

    token_resp = await _secondme.exchange_token(code)
    if not token_resp:
        return JSONResponse({"error": "换取 Token 失败"}, status_code=401)

    session_key = token_resp.access_token[:16] if token_resp.access_token else "default"
    store = _load_tokens()
    store[session_key] = {
        "access_token": token_resp.access_token,
        "refresh_token": token_resp.refresh_token,
        "expires_in": token_resp.expires_in,
    }
    _save_tokens(store)
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
    store = _load_tokens()
    stored = store.get(session_key)
    if not stored:
        return JSONResponse({"error": "session not found"}, status_code=401)

    token_resp = await _secondme.refresh_token(stored["refresh_token"])
    if not token_resp:
        return JSONResponse({"error": "refresh failed"}, status_code=401)

    store[session_key] = {
        "access_token": token_resp.access_token,
        "refresh_token": token_resp.refresh_token,
        "expires_in": token_resp.expires_in,
    }
    _save_tokens(store)
    return JSONResponse({"message": "refreshed", "expires_in": token_resp.expires_in})


def get_access_token(session_key: str) -> str | None:
    """获取已存储的 access_token（供其他路由使用）"""
    store = _load_tokens()
    stored = store.get(session_key)
    return stored["access_token"] if stored else None
