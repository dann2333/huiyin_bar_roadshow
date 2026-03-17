"""
酒馆核心业务路由
处理酒局启动、用户发言、蝴蝶效应、箴言生成
"""
import logging

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from app.client.secondme import SecondMeClient
from app.client.zhihu import ZhihuClient
from app.client.qwen import QwenClient
from app.config import QwenConfig
from app.schema.models import (
    StartRequest, SpeakRequest, ButterflyRequest, ReceiptRequest, AutoModeRequest,
)
from app.service.orchestrator import TavernOrchestrator
from app.api.auth import get_access_token

logger = logging.getLogger(__name__)
router = APIRouter(tags=["酒馆"])

# NOTE: 无状态的共享客户端（线程安全）
_secondme = SecondMeClient()
_zhihu = ZhihuClient()

# NOTE: 按 session_key 缓存编排器实例，每个用户独立
_orchestrators: dict[str, TavernOrchestrator] = {}

# NOTE: 按 session_key 记录引擎偏好，避免全局切换影响所有用户
# 值为 "qwen" 或 "secondme"
_engine_prefs: dict[str, str] = {}


def _create_qwen_for_user() -> QwenClient | None:
    """为用户创建独立的 Qwen 客户端实例（如果 API key 可用）"""
    if QwenConfig.API_KEY:
        return QwenClient()
    return None


async def _get_orchestrator(session_key: str) -> TavernOrchestrator | None:
    """
    获取或创建编排器实例
    NOTE: 每次调用都会检查 Token 是否需要刷新，确保编排器持有最新 Token
    """
    access_token = await get_access_token(session_key)
    if not access_token:
        return None

    if session_key in _orchestrators:
        _orchestrators[session_key].access_token = access_token
        return _orchestrators[session_key]

    # NOTE: 根据用户的引擎偏好决定是否启用 Qwen
    pref = _engine_prefs.get(session_key, "qwen" if QwenConfig.API_KEY else "secondme")
    qwen = _create_qwen_for_user() if pref == "qwen" else None

    orch = TavernOrchestrator(
        secondme=_secondme,
        zhihu=_zhihu,
        access_token=access_token,
        qwen=qwen,
    )
    _orchestrators[session_key] = orch
    if qwen:
        logger.info("编排器已创建 (Qwen 引擎): session_key=%s", session_key)
    return orch


@router.post("/api/tavern/start")
async def start_tavern_session(
    request: StartRequest,
    session_key: str = Query(default="default"),
) -> EventSourceResponse:
    """
    启动酒局
    返回 SSE 流：酒保开场 → 客人匹配 → 首轮辩论
    """
    orch = await _get_orchestrator(session_key)
    if not orch:
        return JSONResponse({"error": "未授权，请先登录"}, status_code=401)

    async def event_generator():
        async for event in orch.start_session(request.concern):
            yield {"data": event.model_dump_json()}

    return EventSourceResponse(event_generator())


@router.post("/api/tavern/speak")
async def user_speak(
    request: SpeakRequest,
    session_key: str = Query(default="default"),
) -> EventSourceResponse:
    """
    用户在辩论中插话
    返回 SSE 流：新一轮辩论
    """
    orch = await _get_orchestrator(session_key)
    if not orch:
        return JSONResponse({"error": "未授权"}, status_code=401)

    async def event_generator():
        async for event in orch.user_speak(request.session_id, request.message):
            yield {"data": event.model_dump_json()}

    return EventSourceResponse(event_generator())


@router.post("/api/tavern/butterfly")
async def trigger_butterfly(
    request: ButterflyRequest,
    session_key: str = Query(default="default"),
) -> EventSourceResponse:
    """
    触发蝴蝶效应（第四幕）
    返回 SSE 流：平行宇宙客人 C 入场
    """
    orch = await _get_orchestrator(session_key)
    if not orch:
        return JSONResponse({"error": "未授权"}, status_code=401)

    async def event_generator():
        async for event in orch.trigger_butterfly(request.session_id, request.what_if):
            yield {"data": event.model_dump_json()}

    return EventSourceResponse(event_generator())


@router.post("/api/tavern/auto-start")
async def start_auto_mode(
    request: AutoModeRequest,
    session_key: str = Query(default="default"),
) -> EventSourceResponse:
    """
    启动自动对话模式
    返回 SSE 流：过去和现在两个 Agent 自动轮流讨论
    """
    logger.info(
        "auto-start 请求: session_key=%s, session_id=%s, 已缓存编排器=%s",
        session_key, request.session_id, list(_orchestrators.keys()),
    )
    orch = await _get_orchestrator(session_key)
    if not orch:
        return JSONResponse({"error": "未授权"}, status_code=401)

    async def event_generator():
        async for event in orch.start_auto_mode(
            request.session_id, request.max_rounds
        ):
            yield {"data": event.model_dump_json()}

    return EventSourceResponse(event_generator())


@router.post("/api/tavern/auto-stop")
async def stop_auto_mode(
    request: AutoModeRequest,
    session_key: str = Query(default="default"),
) -> JSONResponse:
    """停止自动对话模式（柔性停止，等当前轮次结束）"""
    orch = await _get_orchestrator(session_key)
    if not orch:
        return JSONResponse({"error": "未授权"}, status_code=401)

    result = orch.stop_auto_mode(request.session_id)
    return JSONResponse(result)


@router.post("/api/tavern/receipt")
async def generate_receipt(
    request: ReceiptRequest,
    session_key: str = Query(default="default"),
) -> JSONResponse:
    """生成酒馆箴言小票"""
    orch = await _get_orchestrator(session_key)
    if not orch:
        return JSONResponse({"error": "未授权"}, status_code=401)

    result = await orch.generate_receipt(request.session_id)
    return JSONResponse(result)


@router.get("/api/tavern/engine")
async def get_engine_status(
    session_key: str = Query(default="default"),
) -> JSONResponse:
    """查询当前用户的 AI 引擎状态"""
    pref = _engine_prefs.get(session_key, "qwen" if QwenConfig.API_KEY else "secondme")
    # NOTE: 如果用户偏好 qwen 但 API key 不可用，实际引擎应为 secondme
    actual = pref if (pref == "secondme" or QwenConfig.API_KEY) else "secondme"
    return JSONResponse({
        "current": actual,
        "qwen_available": bool(QwenConfig.API_KEY),
        "qwen_model": QwenConfig.MODEL if QwenConfig.API_KEY else None,
    })


@router.post("/api/tavern/engine")
async def switch_engine(
    request: Request,
    session_key: str = Query(default="default"),
) -> JSONResponse:
    """切换 AI 引擎（qwen ↔ secondme），仅影响当前用户"""
    body = await request.json()
    target = body.get("engine", "")

    if target == "qwen":
        if not QwenConfig.API_KEY:
            return JSONResponse({"error": "Qwen API key 未配置"}, status_code=400)
        _engine_prefs[session_key] = "qwen"
        # NOTE: 如果该用户已有编排器，更新其引擎引用
        if session_key in _orchestrators:
            _orchestrators[session_key].qwen = _create_qwen_for_user()
        logger.info("用户切换到 Qwen 引擎: session_key=%s", session_key)
    elif target == "secondme":
        _engine_prefs[session_key] = "secondme"
        if session_key in _orchestrators:
            _orchestrators[session_key].qwen = None
        logger.info("用户切换到 SecondMe 引擎: session_key=%s", session_key)
    else:
        return JSONResponse({"error": "无效引擎类型"}, status_code=400)

    current = _engine_prefs[session_key]
    return JSONResponse({
        "current": current,
        "message": f"已切换到 {'Qwen' if current == 'qwen' else 'SecondMe'} 引擎",
    })
