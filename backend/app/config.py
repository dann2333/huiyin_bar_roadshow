"""
配置管理模块
从环境变量加载所有外部服务凭证
"""
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '..', '.env'))


class ZhihuConfig:
    """知乎 API 配置"""
    APP_KEY: str = os.getenv("ZHIHU_APP_KEY", "")
    APP_SECRET: str = os.getenv("ZHIHU_APP_SECRET", "")
    BASE_URL: str = "https://openapi.zhihu.com"

    @staticmethod
    def get_share_image_url() -> str:
        """
        运行时读取分享图片 URL
        NOTE: 每次调用都重新加载 .env，确保修改后无需重启
        """
        load_dotenv(
            dotenv_path=os.path.join(os.path.dirname(__file__), '..', '..', '.env'),
            override=True,
        )
        return os.getenv("ZHIHU_SHARE_IMAGE_URL", "")


class SecondMeConfig:
    """SecondMe OAuth2 + API 配置"""
    CLIENT_ID: str = os.getenv("SECONDME_CLIENT_ID", "")
    CLIENT_SECRET: str = os.getenv("SECONDME_CLIENT_SECRET", "")
    REDIRECT_URI: str = os.getenv("SECONDME_REDIRECT_URI", "http://localhost:5173/auth/callback")
    BASE_URL: str = os.getenv("SECONDME_BASE_URL", "https://api.mindverse.com/gate/lab")
    AUTH_URL: str = "https://go.second.me/oauth/"


class QwenConfig:
    """通义千问（Qwen）API 配置"""
    API_KEY: str = os.getenv("QWEN_API_KEY", "")
    BASE_URL: str = os.getenv("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    MODEL: str = os.getenv("QWEN_MODEL", "qwen-plus")


# NOTE: 支持的知乎圈子白名单 ID
ZHIHU_RING_IDS = [
    "2001009660925334090",
    "2015023739549529606",
]
