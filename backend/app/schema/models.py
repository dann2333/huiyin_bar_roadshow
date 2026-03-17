"""
Pydantic 数据模型
定义所有 API 请求/响应和内部数据结构
"""
from pydantic import BaseModel


# ============ 知乎相关模型 ============

class ZhihuSearchResult(BaseModel):
    """知乎搜索结果条目"""
    title: str = ""
    content_type: str = ""
    content_id: str = ""
    content_text: str = ""
    url: str = ""
    author_name: str = ""
    author_token: str = ""
    comment_count: int = 0
    vote_up_count: int = 0
    edit_time: int = 0


class ZhihuBillboardItem(BaseModel):
    """知乎热榜条目"""
    title: str = ""
    body: str = ""
    link_url: str = ""
    token: str = ""
    heat_score: int = 0


# ============ SecondMe 相关模型 ============

class TokenResponse(BaseModel):
    """OAuth2 Token 响应"""
    access_token: str = ""
    refresh_token: str = ""
    token_type: str = "Bearer"
    expires_in: int = 7200
    scope: list[str] = []


class ChatChunk(BaseModel):
    """SSE 聊天流的单个增量块"""
    content: str = ""
    session_id: str = ""
    done: bool = False


# ============ 酒馆业务模型 ============

class GuestProfile(BaseModel):
    """酒馆客人的人格档案"""
    author_name: str
    author_token: str
    role: str  # guest_past / guest_now / guest_alt
    system_prompt: str
    source_contents: list[str] = []


class TavernSession(BaseModel):
    """一场酒局的会话状态"""
    session_id: str
    user_concern: str
    guest_past: GuestProfile | None = None
    guest_now: GuestProfile | None = None
    guest_alt: GuestProfile | None = None
    dialog_history: list[dict] = []
    current_stage: int = 1  # 当前第几幕
    secondme_session_ids: dict[str, str] = {}
    # NOTE: 自动对话模式状态
    auto_mode: bool = False
    auto_round_count: int = 0


class TavernEvent(BaseModel):
    """推给前端的统一事件格式"""
    type: str  # bartender / guest_past / guest_now / guest_alt / system / stage
    speaker: str = ""
    content: str = ""
    action: str = ""
    stage: int = 1
    done: bool = False
    session_id: str = ""  # 酒局 ID，首次事件会携带


# ============ API 请求模型 ============

class StartRequest(BaseModel):
    """启动酒局请求"""
    concern: str


class SpeakRequest(BaseModel):
    """用户发言请求"""
    session_id: str
    message: str


class ButterflyRequest(BaseModel):
    """触发蝴蝶效应请求"""
    session_id: str
    what_if: str


class ReceiptRequest(BaseModel):
    """生成箴言请求"""
    session_id: str


class AutoModeRequest(BaseModel):
    """自动对话模式请求"""
    session_id: str
    max_rounds: int = 5  # 默认最多 5 轮自动对话


class PublishRequest(BaseModel):
    """发布到知乎圈子请求"""
    session_id: str
    ring_id: str = "2001009660925334090"
    title: str = ""
    content: str = ""
