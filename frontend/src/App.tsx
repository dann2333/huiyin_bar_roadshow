import { useState, useRef, useEffect, useCallback } from 'react';
import { useSSEStream } from './hooks/useSSEStream';
import { useBackgroundMusic } from './hooks/use-background-music';
import { getT } from './i18n';
import type { Lang } from './i18n';
import type { TavernEvent, TavernState } from './types';
import './index.css';

// NOTE: 开发时指向后端 dev server，生产时同源请求（前后端整合部署）
const API_BASE = import.meta.env.VITE_API_BASE || '';

/** 热度榜条目类型 */
interface HotItem {
  pin_id: number;
  question: string;
  like_num: number;
  comment_num: number;
  share_num: number;
  heat_score: number;
  publish_time: number;
  url: string;
}

interface BridgeSafeArea {
  SAFE_AREA_TOP?: number;
  SAFE_AREA_BOTTOM?: number;
}

interface SettingsLlmConfig {
  base_url: string;
  api_key: string;
  model: string;
  has_config?: boolean;
}

interface SettingsZhihuConfig {
  app_key: string;
  app_secret: string;
  has_config?: boolean;
}

interface SettingsData {
  language: string;
  llm: SettingsLlmConfig;
  zhihu: SettingsZhihuConfig;
}

declare global {
  interface Window {
    appBridge?: BridgeSafeArea;
  }
}

const INITIAL_SETTINGS_DATA: SettingsData = {
  language: 'zh',
  llm: { base_url: '', api_key: '', model: '' },
  zhihu: { app_key: '', app_secret: '' },
};

/**
 * 播放一次性音效（不影响背景音乐）
 * @param src 音频文件路径
 * @param vol 音量（0-1），默认 0.75
 */
function playSfx(src: string, vol = 0.75): void {
  const audio = new Audio(src);
  audio.volume = vol;
  audio.play().catch(() => { /* 浏览器自动播放策略，静默失败 */ });
}

/**
 * 轻量 Markdown → HTML 渲染
 * 处理标题、粗体、斜体、列表、表格、分割线、引用块、换行
 * NOTE: 顺序很重要——先处理表格（多行结构），再处理行内元素
 */
function renderMarkdown(text: string): string {
  // 先处理表格（多行结构，必须在换行替换之前）
  const lines = text.split('\n');
  const result: string[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // 检测表格行（以 | 开头结尾）
    if (line.startsWith('|') && line.endsWith('|')) {
      // 跳过分隔行（|---|---|）
      if (/^\|[\s\-:|]+\|$/.test(line)) continue;
      const cells = line.slice(1, -1).split('|').map(c => c.trim());
      if (!inTable) {
        result.push('<table>');
        result.push('<tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr>');
        inTable = true;
      } else {
        result.push('<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>');
      }
      continue;
    }
    if (inTable) {
      result.push('</table>');
      inTable = false;
    }
    // 分割线
    if (/^-{3,}$/.test(line)) {
      result.push('<hr/>');
      continue;
    }
    // 引用块
    if (line.startsWith('> ')) {
      result.push(`<blockquote>${line.slice(2)}</blockquote>`);
      continue;
    }
    result.push(line);
  }
  if (inTable) result.push('</table>');

  return result.join('\n')
    // 标题
    .replace(/^###\s+(.+)$/gm, '<h4 style="color:var(--amber-400);margin:0.5rem 0">$1</h4>')
    .replace(/^##\s+(.+)$/gm, '<h3 style="color:var(--amber-400);margin:0.8rem 0 0.3rem">$1</h3>')
    .replace(/^#\s+(.+)$/gm, '<h2 style="color:var(--amber-400);margin:1rem 0 0.5rem">$1</h2>')
    // 图片 ![alt](src)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;margin:0.5rem 0" />')
    // **粗体**（必须在 *斜体* 之前）
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--amber-200)">$1</strong>')
    // *斜体/动作描述*
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // - 列表项
    .replace(/^[-•]\s+(.+)$/gm, '<div style="padding-left:1rem;margin:0.2rem 0">• $1</div>')
    // 数字列表
    .replace(/^(\d+)\.\s+(.+)$/gm, '<div style="padding-left:1rem;margin:0.2rem 0">$1. $2</div>')
    // 换行：先合并连续空行，再转 <br/>
    .replace(/\n{2,}/g, '\n')
    .replace(/\n/g, '<br/>')
    // NOTE: 清除块级元素前后多余的 <br/>，避免标题和内容间出现过大空白
    .replace(/(<br\/>)+(<h[2-4])/g, '$2')
    .replace(/(<\/h[2-4]>)(<br\/>)+/g, '$1')
    .replace(/(<br\/>)+(<hr\/>)/g, '$2')
    .replace(/(<hr\/>)(<br\/>)+/g, '$1')
    .replace(/(<br\/>)+(<table>)/g, '$2')
    .replace(/(<\/table>)(<br\/>)+/g, '$1')
    .replace(/(<br\/>)+(<blockquote>)/g, '$2')
    .replace(/(<\/blockquote>)(<br\/>)+/g, '$1')
    .replace(/(<br\/>)+(<div )/g, '$2')
    .replace(/(<\/div>)(<br\/>)+/g, '$1')
    .replace(/(<br\/>)+(<img )/g, '$2')
    // NOTE: 清理表格内部的 <br/>
    .replace(/<table>(<br\/>)+/g, '<table>')
    .replace(/(<br\/>)+<\/table>/g, '</table>')
    .replace(/<\/tr>(<br\/>)+<tr>/g, '</tr><tr>')
    .replace(/<\/tr>(<br\/>)+<\/table>/g, '</tr></table>');
}

/**
 * 使用 localStorage 持久化 session key
 * 避免页面刷新后丢失
 */
function getStoredSessionKey(): string {
  return localStorage.getItem('tavern_session_key') || '';
}

function storeSessionKey(key: string): void {
  localStorage.setItem('tavern_session_key', key);
}

/**
 * 回音酒馆主应用组件
 */
function App() {
  const [state, setState] = useState<TavernState>({
    sessionId: '',
    stage: 0,
    isLoading: false,
    dialogs: [],
    sessionKey: getStoredSessionKey(),
    autoMode: false,
  });
  const [input, setInput] = useState('');
  const [started, setStarted] = useState(false);
  const [authStatus, setAuthStatus] = useState<'checking' | 'success' | 'none'>('checking');
  // NOTE: 首次登录耳机提示页
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
    return localStorage.getItem('tavern_welcome_done') === 'true';
  });
  // NOTE: 箴言分享相关状态
  const [receiptText, setReceiptText] = useState('');
  const [userConcern, setUserConcern] = useState('');
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing' | 'success' | 'error' | 'cooldown'>('idle');
  const [shareUrl, setShareUrl] = useState('');
  const [guestName, setGuestName] = useState('');
  // NOTE: AI 引擎状态
  const [engine, setEngine] = useState<'qwen' | 'secondme'>('secondme');
  const [engineSwitching, setEngineSwitching] = useState(false);
  // NOTE: 产品文档弹窗
  const [docOpen, setDocOpen] = useState(false);
  const [docContent, setDocContent] = useState('');
  // NOTE: 玩法指南弹窗
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideContent, setGuideContent] = useState('');
  // NOTE: 语言 & i18n
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('tavern_lang') as Lang) || 'zh');
  const t = getT(lang);
  // NOTE: 设置面板
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsData, setSettingsData] = useState<SettingsData>({
    ...INITIAL_SETTINGS_DATA,
    language: lang,
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');
  // NOTE: 蝴蝶效应弹窗
  const [butterflyOpen, setButterflyOpen] = useState(false);
  const [butterflyInput, setButterflyInput] = useState('');
  // NOTE: 热度榜状态
  const [hotList, setHotList] = useState<HotItem[]>([]);
  const [hotLoading, setHotLoading] = useState(false);
  const [hotSidebarOpen, setHotSidebarOpen] = useState(true);
  const dialogEndRef = useRef<HTMLDivElement>(null);
  const { startStream } = useSSEStream();
  // NOTE: 背景音乐控制
  const { isPlaying, volume, togglePlay, setVolume, play: playMusic } = useBackgroundMusic('/audio/酒馆小曲.mp3');
  const [musicPanelOpen, setMusicPanelOpen] = useState(true);
  // NOTE: 跟踪是否已在首次提问时自动播放音乐
  const musicAutoTriggeredRef = useRef(false);
  // NOTE: 使用 ref 确保回调中始终能拿到最新的 sessionKey
  const sessionKeyRef = useRef(getStoredSessionKey());

  useEffect(() => {
    const updateSafeAreaVars = () => {
      const bridge = window.appBridge;
      const safeTop = typeof bridge?.SAFE_AREA_TOP === 'number' && Number.isFinite(bridge.SAFE_AREA_TOP)
        ? Math.max(bridge.SAFE_AREA_TOP, 0)
        : 0;
      const safeBottom = typeof bridge?.SAFE_AREA_BOTTOM === 'number' && Number.isFinite(bridge.SAFE_AREA_BOTTOM)
        ? Math.max(bridge.SAFE_AREA_BOTTOM, 0)
        : 0;

      document.documentElement.style.setProperty('--safe-area-top-app', `${safeTop}px`);
      document.documentElement.style.setProperty('--safe-area-bottom-app', `${safeBottom}px`);
    };

    updateSafeAreaVars();
    window.addEventListener('resize', updateSafeAreaVars);
    window.addEventListener('orientationchange', updateSafeAreaVars);

    return () => {
      window.removeEventListener('resize', updateSafeAreaVars);
      window.removeEventListener('orientationchange', updateSafeAreaVars);
    };
  }, []);

  // 初始化：处理 OAuth 回调
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const sessionFromUrl = params.get('session');

    // 情况 1：URL 中已有 session key（后端回调重定向）
    if (sessionFromUrl) {
      sessionKeyRef.current = sessionFromUrl;
      storeSessionKey(sessionFromUrl);
      // NOTE: 强制刷新页面，确保登录后 UI 完全重新初始化
      window.location.href = '/';
      return;
    }

    // 情况 2：URL 中有 code（OAuth 回调，需要转发给后端换取 Token）
    if (code) {
      setAuthStatus('checking');
      // NOTE: 从 sessionStorage 取出 state，与 code 一起发送给后端验证 CSRF
      const storedState = sessionStorage.getItem('oauth_state') || '';
      sessionStorage.removeItem('oauth_state');
      fetch(`${API_BASE}/api/auth/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state: storedState }),
      })
        .then(resp => resp.json())
        .then(data => {
          if (data.session_key) {
            sessionKeyRef.current = data.session_key;
            storeSessionKey(data.session_key);
            // NOTE: 强制刷新页面，确保登录后 UI 完全重新初始化
            window.location.href = '/';
          } else {
            console.error('换取 Token 失败:', data);
            setAuthStatus('none');
          }
        })
        .catch(err => {
          console.error('OAuth 交换异常:', err);
          setAuthStatus('none');
        });
      return;
    }

    // 情况 3：无 OAuth 参数，检查 localStorage 中是否有已存的 session
    if (getStoredSessionKey()) {
      setAuthStatus('success');
    } else {
      setAuthStatus('none');
    }
  }, []);

  // 初始化：查询当前 AI 引擎
  useEffect(() => {
    fetch(`${API_BASE}/api/tavern/engine`)
      .then(r => r.json())
      .then(data => setEngine(data.current || 'secondme'))
      .catch(() => setEngine('secondme'));
  }, []);

  /** 加载热度榜数据 */
  const fetchHotList = useCallback(async () => {
    setHotLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/social/ring-hot?page_size=20`);
      const data = await resp.json();
      setHotList(data.items || []);
    } catch (err) {
      console.error('加载热度榜失败:', err);
    } finally {
      setHotLoading(false);
    }
  }, []);

  // 初始化：页面加载时获取热度榜
  useEffect(() => {
    fetchHotList();
  }, [fetchHotList]);

  // 自动滚动到最新对话
  useEffect(() => {
    dialogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.dialogs]);

  /** 处理 SSE 事件 → 追加到对话流 */
  const handleEvent = useCallback((event: TavernEvent) => {
    // NOTE: 音效播放放在 setState 外部，避免 React 严格模式 updater 被调用两次
    if (event.type === 'stage' && event.stage === 3) {
      playSfx('/audio/客人.mp3', 0.75);
    }

    setState(prev => {
      const dialogs = [...prev.dialogs];
      // NOTE: 捕获后端推送的酒局 session_id
      let sessionId = prev.sessionId;
      if (event.session_id) {
        sessionId = event.session_id;
      }

      // 空内容的系统事件仅用于传递 session_id，不渲染
      if (event.type === 'system' && !event.content) {
        return { ...prev, sessionId };
      }

      // NOTE: 处理自动对话模式状态事件
      if (event.type === 'auto_status') {
        if (event.content === 'auto_started') {
          return { ...prev, autoMode: true, sessionId };
        }
        if (event.content === 'auto_stopped') {
          return { ...prev, autoMode: false, isLoading: false, sessionId };
        }
        // round_N 事件仅做状态更新，不渲染
        return { ...prev, sessionId };
      }

      if (event.type === 'stage') {
        dialogs.push({
          id: `stage-${event.stage}-${Date.now()}`,
          type: 'stage',
          speaker: '',
          content: event.content,
          timestamp: Date.now(),
        });
        return { ...prev, dialogs, stage: event.stage, sessionId };
      }

      if (event.done) {
        return { ...prev, dialogs, sessionId };
      }

      // 查找最后一条同角色对话追加内容
      const lastIdx = dialogs.length - 1;
      const last = dialogs[lastIdx];

      if (last && last.type === event.type) {
        dialogs[lastIdx] = { ...last, content: last.content + event.content };
      } else {
        dialogs.push({
          id: `${event.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: event.type,
          speaker: event.speaker,
          content: event.content,
          timestamp: Date.now(),
        });
      }

      return { ...prev, dialogs, sessionId };
    });
  }, []);

  /** 启动酒局 */
  const handleStart = useCallback(async () => {
    if (!input.trim()) return;
    const concern = input.trim();
    setInput('');
    setStarted(true);
    setUserConcern(concern);

    setState(prev => ({
      ...prev,
      isLoading: true,
      dialogs: [...prev.dialogs, {
        id: `user-${Date.now()}`,
        type: 'system' as const,
        speaker: '你',
        content: concern,
        timestamp: Date.now(),
      }],
    }));

    // NOTE: 用户推门进入后立即播放问候音效
    playSfx('/audio/问候.mp3');

    // NOTE: 首次提问时自动开启背景音乐（仅一次）
    if (!musicAutoTriggeredRef.current) {
      musicAutoTriggeredRef.current = true;
      playMusic();
    }

    // NOTE: 使用 ref 确保拿到最新的 sessionKey
    await startStream(
      '/api/tavern/start',
      { concern },
      sessionKeyRef.current,
      handleEvent,
      () => setState(prev => ({ ...prev, isLoading: false })),
    );
  }, [input, startStream, handleEvent, playMusic]);

  /** 用户插话 */
  const handleSpeak = useCallback(async () => {
    if (!input.trim() || state.isLoading) return;
    const message = input.trim();
    setInput('');

    setState(prev => ({
      ...prev,
      isLoading: true,
      dialogs: [...prev.dialogs, {
        id: `user-${Date.now()}`,
        type: 'system' as const,
        speaker: '你',
        content: message,
        timestamp: Date.now(),
      }],
    }));

    await startStream(
      '/api/tavern/speak',
      { session_id: state.sessionId, message },
      sessionKeyRef.current,
      handleEvent,
      () => setState(prev => ({ ...prev, isLoading: false })),
    );
  }, [input, state.sessionId, state.isLoading, startStream, handleEvent]);

  /** 触发蝴蝶效应：调用 API 发起平行宇宙请求 */
  const handleButterflySubmit = useCallback(async (whatIf: string) => {
    if (!whatIf || !state.sessionId) return;
    setState(prev => ({ ...prev, isLoading: true }));

    // NOTE: 蝴蝶效应触发后播放音效
    playSfx('/audio/蝴蝶效应.mp3');

    await startStream(
      '/api/tavern/butterfly',
      { session_id: state.sessionId, what_if: whatIf },
      sessionKeyRef.current,
      handleEvent,
      () => setState(prev => ({ ...prev, isLoading: false })),
    );
  }, [state.sessionId, startStream, handleEvent]);

  /** 启动自动对话模式 */
  const handleAutoStart = useCallback(async () => {
    // FIXME: 调试日志，定位「酒局不存在」问题
    console.log('[DEBUG] handleAutoStart', {
      sessionId: state.sessionId,
      sessionKey: sessionKeyRef.current,
      isLoading: state.isLoading,
    });
    if (!state.sessionId || state.isLoading) return;
    setState(prev => ({ ...prev, isLoading: true, autoMode: true }));

    // NOTE: 自动讨论模式启动音效
    playSfx('/audio/自动.mp3');

    await startStream(
      '/api/tavern/auto-start',
      { session_id: state.sessionId },
      sessionKeyRef.current,
      handleEvent,
      // NOTE: SSE 流结束时确保状态重置
      () => setState(prev => ({ ...prev, isLoading: false, autoMode: false })),
    );
  }, [state.sessionId, state.isLoading, startStream, handleEvent]);

  /** 停止自动对话模式（柔性停止） */
  const handleAutoStop = useCallback(async () => {
    if (!state.sessionId) return;
    try {
      await fetch(
        `${API_BASE}/api/tavern/auto-stop?session_key=${sessionKeyRef.current}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: state.sessionId }),
        },
      );
    } catch (err) {
      console.error('停止自动模式失败:', err);
    }
  }, [state.sessionId]);

  /** 生成箴言小票 */
  const handleReceipt = useCallback(async () => {
    if (!state.sessionId) return;
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const resp = await fetch(
        `${API_BASE}/api/tavern/receipt?session_key=${sessionKeyRef.current}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: state.sessionId }),
        },
      );
      const data = await resp.json();
      const receipt = data.receipt || '';
      // NOTE: 保存箴言原文和用户困惑，供后续分享使用
      setReceiptText(receipt);
      if (data.concern) setUserConcern(data.concern);
      if (data.guest_name) setGuestName(data.guest_name);
      // 重置分享状态
      setShareStatus('idle');
      setShareUrl('');
      setState(prev => ({
        ...prev,
        isLoading: false,
        dialogs: [...prev.dialogs, {
          id: `receipt-${Date.now()}`,
          type: 'stage',
          speaker: '',
          content: `📜 今夜酒馆箴言\n\n${receipt}`,
          timestamp: Date.now(),
        }],
      }));

      // NOTE: 箴言生成后播放告别音效
      playSfx('/audio/告别.mp3');
    } catch (err) {
      console.error('生成箴言失败:', err);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [state.sessionId]);

  /** 分享箴言到知乎圈子 */
  const handleShareToZhihu = useCallback(async () => {
    if (!receiptText || shareStatus === 'sharing' || shareStatus === 'cooldown') return;
    setShareStatus('sharing');

    // NOTE: 分享按钮点击音效
    playSfx('/audio/分享.mp3');

    try {
      const resp = await fetch(`${API_BASE}/api/social/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: state.sessionId,
          receipt: receiptText,
          concern: userConcern,
          guest_name: guestName,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.url) {
        setShareStatus('success');
        setShareUrl(data.url);
      } else {
        console.error('分享失败:', data.error);
        // NOTE: 错误后进入 3 秒冷却期，防止用户快速重试触发知乎 API 429 限流
        setShareStatus('cooldown');
        setTimeout(() => setShareStatus('idle'), 3000);
      }
    } catch (err) {
      console.error('分享异常:', err);
      // NOTE: 网络异常同样进入冷却期
      setShareStatus('cooldown');
      setTimeout(() => setShareStatus('idle'), 3000);
    }
  }, [receiptText, userConcern, guestName, state.sessionId, shareStatus]);

  /** 发起 OAuth 登录 */
  const handleLogin = async () => {
    // NOTE: 先从后端获取随机 state 存入 sessionStorage，防止 CSRF 攻击
    try {
      const resp = await fetch(`${API_BASE}/api/auth/state`);
      const data = await resp.json();
      if (data.state) {
        sessionStorage.setItem('oauth_state', data.state);
      }
    } catch (err) {
      console.error('获取 OAuth state 失败:', err);
    }
    window.location.href = `${API_BASE}/api/auth/login`;
  };

  const handleSubmit = started ? handleSpeak : handleStart;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (authStatus === 'checking') {
    return (
      <div className="loading-screen">
        <img
          src="/images/liukanshan-bartender.png"
          alt="刘看山酒保"
          className="loading-avatar"
        />
        <div className="book-animation">
          <div className="page page-left" />
          <div className="page page-right" />
          <div className="book-base" />
        </div>
        <p className="loading-text">{t('loadingText')}</p>
        <p className="loading-hint">{t('loadingHint')}</p>
      </div>
    );
  }

  // NOTE: 已登录但首次进入，显示耳机提示页
  if (authStatus === 'success' && !welcomeDismissed) {
    return (
      <div className="welcome-overlay">
        <div className="welcome-card">
          <div className="welcome-icon">🎧</div>
          <h2 className="welcome-title">{t('welcomeTitle')}</h2>
          <p className="welcome-desc">{t('welcomeDesc')}</p>
          <button
            className="welcome-btn"
            onClick={() => {
              setWelcomeDismissed(true);
              localStorage.setItem('tavern_welcome_done', 'true');
            }}
          >
            {t('welcomeConfirm')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tavern">
      {/* 左侧热度榜侧栏 */}
      <div className={`hot-sidebar ${hotSidebarOpen ? 'open' : ''}`}>
        <button
          className="hot-sidebar-toggle"
          onClick={() => setHotSidebarOpen(prev => !prev)}
          title={t('hotTitle')}
        >
          🔥
        </button>
        <div className="hot-sidebar-content">
          <div className="hot-sidebar-header">
            <h3 className="hot-sidebar-title">{t('hotTitle')}</h3>
            <button
              className="hot-refresh-btn"
              onClick={fetchHotList}
              disabled={hotLoading}
              title={t('hotRefresh')}
            >
              {hotLoading ? '⏳' : '🔄'}
            </button>
          </div>
          <div className="hot-list">
            {hotLoading && hotList.length === 0 && (
              <div className="hot-empty">{t('hotLoading')}</div>
            )}
            {!hotLoading && hotList.length === 0 && (
              <div className="hot-empty">{t('hotEmpty')}</div>
            )}
            {hotList.map((item, index) => (
              <a
                key={item.pin_id}
                className="hot-item"
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                title={item.question}
              >
                <span className={`hot-rank ${index < 3 ? 'top' : ''}`}>
                  {index + 1}
                </span>
                <span className="hot-question">{item.question}</span>
                <span className="hot-score">
                  {item.heat_score > 0 ? item.heat_score : '-'}
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>
      {/* 右下角音乐控制按钮 */}
      <div className={`music-control ${musicPanelOpen ? 'open' : ''}`}>
        <button
          className={`music-toggle ${isPlaying ? 'playing' : ''}`}
          onClick={togglePlay}
          title={isPlaying ? t('musicPause') : t('musicPlay')}
        >
          {isPlaying ? '🎵' : '🔇'}
        </button>
        <button
          className="music-expand"
          onClick={() => setMusicPanelOpen(prev => !prev)}
          title="音量设置"
        >
          {musicPanelOpen ? '▾' : '▴'}
        </button>
        {musicPanelOpen && (
          <div className="music-panel">
            <div className="music-panel-label">{t('musicVolume')}</div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              className="music-volume-slider"
            />
            <div className="music-volume-value">{Math.round(volume * 100)}%</div>
          </div>
        )}
      </div>

      {/* 左上角按钮组 */}
      <div className="top-left-actions">
        <button
          className="doc-trigger"
          onClick={async () => {
            setDocOpen(true);
            if (!docContent) {
              try {
                const resp = await fetch('/product-doc.md');
                const text = await resp.text();
                setDocContent(text);
              } catch {
                setDocContent('# 加载失败\n\n无法加载项目文档。');
              }
            }
          }}
        >
          {t('docTrigger')}
        </button>
        <button
          className="doc-trigger"
          onClick={async () => {
            setSettingsOpen(true);
            setSettingsMsg('');
            setSettingsData(prev => ({ ...prev, language: lang }));
            try {
              const resp = await fetch(`${API_BASE}/api/settings`);
              const data = await resp.json();
              setSettingsData(data);
            } catch {
              setSettingsMsg(t('settingsLoadFail'));
            }
          }}
        >
          {t('settingsTrigger')}
        </button>
      </div>

      {/* 右上角退出登录按钮 */}
      {authStatus === 'success' && (
        <div className="top-right-actions">
          <button
            className="logout-btn"
            onClick={() => window.location.reload()}
            title={t('newSessionTip')}
          >
            {t('newSessionBtn')}
          </button>
          <button
            className="logout-btn"
            onClick={async () => {
              try {
                await fetch(`${API_BASE}/api/auth/logout`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ session_key: sessionKeyRef.current }),
                });
              } catch { /* 静默失败 */ }
              localStorage.removeItem('tavern_session_key');
              localStorage.removeItem('tavern_token');
              localStorage.removeItem('tavern_welcome_done');
              window.location.reload();
            }}
            title={t('logoutTip')}
          >
            {t('logoutBtn')}
          </button>
        </div>
      )}

      {/* 设置弹窗 */}
      {settingsOpen && (
        <div className="doc-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <button className="doc-close" onClick={() => setSettingsOpen(false)}>×</button>
            <h2 className="settings-title">{t('settingsTitle')}</h2>

            {/* 语言切换 */}
            <div className="settings-section">
              <div className="settings-section-title">{t('settingsLanguage')}</div>
              <div className="settings-lang-group">
                <button
                  className={`settings-lang-btn ${settingsData.language === 'zh' ? 'active' : ''}`}
                  onClick={() => {
                    setSettingsData(prev => ({ ...prev, language: 'zh' }));
                    setLang('zh');
                    localStorage.setItem('tavern_lang', 'zh');
                  }}
                >
                  中文
                </button>
                <button
                  className={`settings-lang-btn ${settingsData.language === 'en' ? 'active' : ''}`}
                  onClick={() => {
                    setSettingsData(prev => ({ ...prev, language: 'en' }));
                    setLang('en');
                    localStorage.setItem('tavern_lang', 'en');
                  }}
                >
                  English
                </button>
              </div>
            </div>

            {/* 大模型 API 配置 */}
            <div className="settings-section">
              <div className="settings-section-title">{t('settingsLlm')}</div>
              <label className="settings-label">{t('settingsBaseUrl')}</label>
              <input
                className="settings-input"
                value={settingsData.llm.base_url}
                onChange={e => setSettingsData(prev => ({
                  ...prev,
                  llm: { ...prev.llm, base_url: e.target.value },
                }))}
               placeholder={settingsData.llm.has_config ? t('settingsConfigured') : t('settingsNotConfigured')}
              />
              <label className="settings-label">{t('settingsApiKey')}</label>
              <input
                className="settings-input"
                value={settingsData.llm.api_key}
                onChange={e => setSettingsData(prev => ({
                  ...prev,
                  llm: { ...prev.llm, api_key: e.target.value },
                }))}
                placeholder={settingsData.llm.has_config ? t('settingsConfigured') : t('settingsNotConfigured')}
              />
              <label className="settings-label">{t('settingsModel')}</label>
              <input
                className="settings-input"
                value={settingsData.llm.model}
                onChange={e => setSettingsData(prev => ({
                  ...prev,
                  llm: { ...prev.llm, model: e.target.value },
                }))}
                placeholder={settingsData.llm.has_config ? t('settingsConfigured') : t('settingsNotConfigured')}
              />
            </div>

            {/* 知乎 API 配置 */}
            <div className="settings-section">
              <div className="settings-section-title">{t('settingsZhihu')}</div>
              <label className="settings-label">{t('settingsAppKey')}</label>
              <input
                className="settings-input"
                value={settingsData.zhihu.app_key}
                onChange={e => setSettingsData(prev => ({
                  ...prev,
                  zhihu: { ...prev.zhihu, app_key: e.target.value },
                }))}
                placeholder={settingsData.zhihu.has_config ? t('settingsConfigured') : t('settingsNotConfigured')}
              />
              <label className="settings-label">{t('settingsAppSecret')}</label>
              <input
                className="settings-input"
                value={settingsData.zhihu.app_secret}
                onChange={e => setSettingsData(prev => ({
                  ...prev,
                  zhihu: { ...prev.zhihu, app_secret: e.target.value },
                }))}
                placeholder={settingsData.zhihu.has_config ? t('settingsConfigured') : t('settingsNotConfigured')}
              />
            </div>

            {/* 底部按钮 */}
            <div className="settings-footer">
              {settingsMsg && <span className="settings-msg">{settingsMsg}</span>}
              <button
                className="action-btn"
                disabled={settingsSaving}
                onClick={async () => {
                  setSettingsSaving(true);
                  setSettingsMsg('');
                  try {
                    const resp = await fetch(`${API_BASE}/api/settings/reset`, { method: 'POST' });
                    if (resp.ok) {
                      setSettingsMsg(t('settingsResetOk'));
                      setLang('zh');
                      localStorage.setItem('tavern_lang', 'zh');
                      const r = await fetch(`${API_BASE}/api/settings`);
                      setSettingsData(await r.json());
                    }
                  } catch {
                    setSettingsMsg(t('settingsResetFail'));
                  } finally {
                    setSettingsSaving(false);
                  }
                }}
              >
                {t('settingsResetBtn')}
              </button>
              <button
                className="send-btn"
                disabled={settingsSaving}
                onClick={async () => {
                  setSettingsSaving(true);
                  setSettingsMsg('');
                  try {
                    const resp = await fetch(`${API_BASE}/api/settings`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(settingsData),
                    });
                    if (resp.ok) {
                      setSettingsMsg(t('settingsSaveOk'));
                      const r = await fetch(`${API_BASE}/api/settings`);
                      setSettingsData(await r.json());
                    } else {
                      const data = await resp.json();
                      setSettingsMsg(`❌ ${data.error || t('settingsSaveFail')}`);
                    }
                  } catch {
                    setSettingsMsg(t('settingsNetErr'));
                  } finally {
                    setSettingsSaving(false);
                  }
                }}
              >
                {settingsSaving ? t('settingsSaving') : t('settingsSaveBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 蝴蝶效应弹窗 */}
      {butterflyOpen && (
        <div className="doc-overlay" onClick={() => setButterflyOpen(false)}>
          <div className="butterfly-modal" onClick={e => e.stopPropagation()}>
            <button className="doc-close" onClick={() => setButterflyOpen(false)}>×</button>
            <div className="butterfly-icon">🦋</div>
            <h2 className="butterfly-title">{t('butterflyTitle')}</h2>
            <p className="butterfly-desc">{t('butterflyDesc')}</p>
            <input
              className="settings-input butterfly-input"
              value={butterflyInput}
              onChange={e => setButterflyInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && butterflyInput.trim()) {
                  setButterflyOpen(false);
                  handleButterflySubmit(butterflyInput.trim());
                }
              }}
              placeholder={t('butterflyPlaceholder')}
              autoFocus
            />
            <div className="butterfly-footer">
              <button
                className="action-btn"
                onClick={() => setButterflyOpen(false)}
              >
                {t('butterflyCancel')}
              </button>
              <button
                className="send-btn"
                disabled={!butterflyInput.trim()}
                onClick={() => {
                  setButterflyOpen(false);
                  handleButterflySubmit(butterflyInput.trim());
                }}
              >
                {t('butterflyConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 项目文档弹窗（左侧目录 + 右侧内容） */}
      {docOpen && (() => {
        // 从 markdown 内容提取标题生成目录
        const tocItems = docContent.split('\n')
          .filter(line => /^#{1,3}\s/.test(line.trim()))
          .map(line => {
            const match = line.trim().match(/^(#{1,3})\s+(.+)$/);
            if (!match) return null;
            const level = match[1].length;
            const title = match[2];
            const id = title.replace(/[\s.·]+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '').toLowerCase();
            return { level, title, id };
          })
          .filter(Boolean) as { level: number; title: string; id: string }[];

        // 为内容中的标题添加 id 锚点
        const htmlWithIds = renderMarkdown(docContent)
          .replace(/<h([234])[^>]*>(.*?)<\/h\1>/g, (_match, tag, text) => {
            const cleanText = text.replace(/<[^>]+>/g, '');
            const id = cleanText.replace(/[\s.·]+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '').toLowerCase();
            return `<h${tag} id="${id}" style="color:var(--amber-400);margin:1rem 0 0.5rem;scroll-margin-top:1rem">${text}</h${tag}>`;
          });

        return (
          <div className="doc-overlay" onClick={() => setDocOpen(false)}>
            <div className="doc-modal" onClick={e => e.stopPropagation()}>
              <button className="doc-close" onClick={() => setDocOpen(false)}>×</button>
              {/* 左侧目录 */}
              <nav className="doc-sidebar">
                <div className="doc-sidebar-title">📖 目录</div>
                {tocItems.map((item, i) => (
                  <a
                    key={i}
                    className={`doc-toc-item level-${item.level}`}
                    href={`#${item.id}`}
                    onClick={e => {
                      e.preventDefault();
                      document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    {item.title}
                  </a>
                ))}
              </nav>
              {/* 右侧内容 */}
              <div
                className="doc-body"
                dangerouslySetInnerHTML={{ __html: htmlWithIds }}
              />
            </div>
          </div>
        );
      })()}

      <header className="tavern-header">
        <img
          src="/images/liukanshan-bartender.png"
          alt="刘看山酒保"
          className="bartender-avatar"
        />
        <h1>{t('tavernTitle')}</h1>
        <p className="subtitle">{t('tavernSubtitle')}</p>
        {authStatus === 'success' && (
          <div className="engine-bar">
            <span className="engine-label">{t('connectedSecondMe')}</span>
            <button
              className={`engine-toggle ${engine}`}
              onClick={async () => {
                if (engineSwitching) return;
                const target = engine === 'qwen' ? 'secondme' : 'qwen';
                // NOTE: 切换到定制模型前，先检查是否已配置 API
                if (target === 'qwen') {
                  try {
                    const check = await fetch(`${API_BASE}/api/tavern/engine`);
                    const info = await check.json();
                    if (!info.qwen_available) {
                      alert(t('customModelNotConfigured'));
                      return;
                    }
                  } catch { return; }
                }
                setEngineSwitching(true);
                try {
                  const resp = await fetch(`${API_BASE}/api/tavern/engine`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ engine: target }),
                  });
                  const data = await resp.json();
                  if (data.current) setEngine(data.current);
                } catch (err) {
                  console.error('切换引擎失败:', err);
                } finally {
                  setEngineSwitching(false);
                }
              }}
              disabled={engineSwitching}
              title={engine === 'qwen' ? t('customModelActive') : 'SecondMe'}
            >
              <span className="engine-dot" />
              <span className="engine-name">
                {engine === 'qwen' ? t('customModelLabel') : '🧠 SecondMe'}
              </span>
            </button>
          </div>
        )}
      </header>

      {authStatus === 'none' && (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            {t('authPrompt')}
          </p>
          <button className="send-btn" onClick={handleLogin}>{t('authLogin')}</button>
        </div>
      )}

      {started && (
        <div className="stage-indicator">
          {[1, 2, 3, 4, 5].map(s => (
            <div key={s} className={`stage-dot ${state.stage >= s ? 'active' : ''}`} />
          ))}
        </div>
      )}

      <div className="dialog-stream">
        {!started && authStatus === 'success' && (
          <div className="dialog-entry bartender">
            <div className="dialog-speaker">{t('bartenderName')}</div>
            <div className="dialog-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(t('bartenderWelcome')) }} />
          </div>
        )}

        {state.dialogs.map(entry => (
          <div key={entry.id} className={`dialog-entry ${entry.type}`}>
            {entry.type === 'stage' ? (
              <div className="stage-title" dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.content) }} />
            ) : (
              <>
                {entry.speaker && (
                  <div className="dialog-speaker">
                    {entry.type === 'bartender' && '🦊 '}
                    {entry.type === 'guest_past' && '🔥 '}
                    {entry.type === 'guest_now' && '🌊 '}
                    {entry.type === 'guest_alt' && '🌀 '}
                    {entry.type === 'guest_past'
                      ? t('guestPast')
                      : entry.type === 'guest_now'
                        ? t('guestNow')
                        : entry.type === 'guest_alt'
                          ? t('guestAlt')
                          : entry.speaker}
                  </div>
                )}
                <div
                  className="dialog-content"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.content) }}
                />
              </>
            )}
          </div>
        ))}

        {state.isLoading && (
          <div className="waiting-animation">
            <img
              src="/images/liukanshan-bartender.png"
              alt="刘看山"
              className="waiting-avatar"
            />
            <p className="waiting-text">{t('waitingText')}</p>
            <div className="loading-dots"><span /><span /><span /></div>
          </div>
        )}

        <div ref={dialogEndRef} />
      </div>

      {authStatus === 'success' && (
        <div className="input-area">
          {started && state.stage >= 3 && (
            <div className="action-buttons">
              {/* NOTE: 自动对话模式切换按钮 */}
              {state.autoMode ? (
                <button className="action-btn auto-stop" onClick={handleAutoStop}>
                  {t('autoPause')}
                </button>
              ) : (
                <button
                  className="action-btn auto-start"
                  onClick={handleAutoStart}
                  disabled={state.isLoading}
                >
                  {t('autoStart')}
                </button>
              )}
              {!state.isLoading && !state.autoMode && (
                <>
                  <button className="action-btn butterfly" onClick={() => { setButterflyInput(''); setButterflyOpen(true); }}>{t('butterfly')}</button>
                  <button className="action-btn" onClick={handleReceipt}>{t('receipt')}</button>
                  {receiptText && (
                    <button
                      className={`action-btn share-zhihu ${shareStatus}`}
                      onClick={handleShareToZhihu}
                      disabled={shareStatus === 'sharing' || shareStatus === 'success' || shareStatus === 'cooldown'}
                    >
                      {shareStatus === 'idle' && t('shareZhihu')}
                      {shareStatus === 'sharing' && t('sharePublishing')}
                      {shareStatus === 'success' && t('shareSuccess')}
                      {shareStatus === 'error' && t('shareRetry')}
                      {shareStatus === 'cooldown' && t('shareCooldown')}
                    </button>
                  )}
                  {shareStatus === 'success' && shareUrl && (
                    <a
                      className="share-link"
                      href={shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('shareLink')}
                    </a>
                  )}
                </>
              )}
            </div>
          )}
          <div className="input-container">
            <button
              className="guide-trigger"
              title={t('guideTrigger')}
              onClick={async () => {
                setGuideOpen(true);
                if (!guideContent) {
                  try {
                    const resp = await fetch('/guide.md');
                    const text = await resp.text();
                    setGuideContent(text);
                  } catch {
                    setGuideContent('# 加载失败\n\n无法加载玩法指南。');
                  }
                }
              }}
            >
              {t('guideTrigger')}
            </button>
            <input
              className="input-field"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                state.autoMode
                  ? t('inputAuto')
                  : started
                    ? t('inputSpeaking')
                    : t('inputStart')
              }
              disabled={state.isLoading || state.autoMode}
            />
            <button
              className="send-btn"
              onClick={handleSubmit}
              disabled={state.isLoading || !input.trim()}
            >
              {started ? t('btnSpeak') : t('btnEnter')}
            </button>
          </div>
        </div>
      )}

      {/* 玩法指南弹窗 */}
      {guideOpen && (
        <div className="doc-overlay" onClick={() => setGuideOpen(false)}>
          <div
            className="doc-modal guide-modal"
            onClick={e => e.stopPropagation()}
          >
            <button className="doc-close" onClick={() => setGuideOpen(false)}>✕</button>
            <div
              className="doc-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(guideContent) }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
