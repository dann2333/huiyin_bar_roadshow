import { useState, useRef, useEffect, useCallback } from 'react';
import { useSSEStream } from './hooks/useSSEStream';
import { useBackgroundMusic } from './hooks/use-background-music';
import { getT } from './i18n';
import type { Lang } from './i18n';
import type { TavernEvent, TavernState } from './types';
import './index.css';

const API_BASE = 'http://localhost:8000';

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
    // **粗体**（必须在 *斜体* 之前）
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--amber-200)">$1</strong>')
    // *斜体/动作描述*
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // - 列表项
    .replace(/^[-•]\s+(.+)$/gm, '<div style="padding-left:1rem;margin:0.2rem 0">• $1</div>')
    // 数字列表
    .replace(/^(\d+)\.\s+(.+)$/gm, '<div style="padding-left:1rem;margin:0.2rem 0">$1. $2</div>')
    // 换行
    .replace(/\n/g, '<br/>');
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
  // NOTE: 箴言分享相关状态
  const [receiptText, setReceiptText] = useState('');
  const [userConcern, setUserConcern] = useState('');
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing' | 'success' | 'error'>('idle');
  const [shareUrl, setShareUrl] = useState('');
  const [guestName, setGuestName] = useState('');
  // NOTE: AI 引擎状态
  const [engine, setEngine] = useState<'qwen' | 'secondme'>('qwen');
  const [engineSwitching, setEngineSwitching] = useState(false);
  // NOTE: 产品文档弹窗
  const [docOpen, setDocOpen] = useState(false);
  const [docContent, setDocContent] = useState('');
  // NOTE: 语言 & i18n
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('tavern_lang') as Lang) || 'zh');
  const t = getT(lang);
  // NOTE: 设置面板
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsData, setSettingsData] = useState({
    language: lang as string,
    llm: { base_url: '', api_key: '', model: '' },
    zhihu: { app_key: '', app_secret: '' },
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');
  const dialogEndRef = useRef<HTMLDivElement>(null);
  const { startStream } = useSSEStream();
  // NOTE: 背景音乐控制
  const { isPlaying, volume, togglePlay, setVolume } = useBackgroundMusic('/audio/酒馆小曲.mp3');
  const [musicPanelOpen, setMusicPanelOpen] = useState(true);
  // NOTE: 使用 ref 确保回调中始终能拿到最新的 sessionKey
  const sessionKeyRef = useRef(getStoredSessionKey());

  // 初始化：处理 OAuth 回调
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const sessionFromUrl = params.get('session');

    // 情况 1：URL 中已有 session key（后端回调重定向）
    if (sessionFromUrl) {
      sessionKeyRef.current = sessionFromUrl;
      storeSessionKey(sessionFromUrl);
      setState(prev => ({ ...prev, sessionKey: sessionFromUrl }));
      setAuthStatus('success');
      window.history.replaceState({}, '', '/');
      return;
    }

    // 情况 2：URL 中有 code（OAuth 回调，需要转发给后端换取 Token）
    if (code) {
      setAuthStatus('checking');
      fetch(`${API_BASE}/api/auth/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
        .then(resp => resp.json())
        .then(data => {
          if (data.session_key) {
            sessionKeyRef.current = data.session_key;
            storeSessionKey(data.session_key);
            setState(prev => ({ ...prev, sessionKey: data.session_key }));
            setAuthStatus('success');
            window.history.replaceState({}, '', '/');
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

  // 自动滚动到最新对话
  useEffect(() => {
    dialogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.dialogs]);

  /** 处理 SSE 事件 → 追加到对话流 */
  const handleEvent = useCallback((event: TavernEvent) => {
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

    // NOTE: 使用 ref 确保拿到最新的 sessionKey
    await startStream(
      '/api/tavern/start',
      { concern },
      sessionKeyRef.current,
      handleEvent,
      () => setState(prev => ({ ...prev, isLoading: false })),
    );
  }, [input, startStream, handleEvent]);

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

  /** 触发蝴蝶效应 */
  const handleButterfly = useCallback(async () => {
    const whatIf = prompt('如果当年做了什么不同的选择？');
    if (!whatIf || !state.sessionId) return;
    setState(prev => ({ ...prev, isLoading: true }));

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
    } catch (err) {
      console.error('生成箴言失败:', err);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [state.sessionId]);

  /** 分享箴言到知乎圈子 */
  const handleShareToZhihu = useCallback(async () => {
    if (!receiptText || shareStatus === 'sharing') return;
    setShareStatus('sharing');
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
        setShareStatus('error');
      }
    } catch (err) {
      console.error('分享异常:', err);
      setShareStatus('error');
    }
  }, [receiptText, userConcern, state.sessionId, shareStatus]);

  /** 发起 OAuth 登录 */
  const handleLogin = () => {
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

  return (
    <div className="tavern">
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
                placeholder={(settingsData.llm as any).has_config ? t('settingsConfigured') : t('settingsNotConfigured')}
              />
              <label className="settings-label">{t('settingsApiKey')}</label>
              <input
                className="settings-input"
                value={settingsData.llm.api_key}
                onChange={e => setSettingsData(prev => ({
                  ...prev,
                  llm: { ...prev.llm, api_key: e.target.value },
                }))}
                placeholder={(settingsData.llm as any).has_config ? t('settingsConfigured') : t('settingsNotConfigured')}
              />
              <label className="settings-label">{t('settingsModel')}</label>
              <input
                className="settings-input"
                value={settingsData.llm.model}
                onChange={e => setSettingsData(prev => ({
                  ...prev,
                  llm: { ...prev.llm, model: e.target.value },
                }))}
                placeholder={(settingsData.llm as any).has_config ? t('settingsConfigured') : t('settingsNotConfigured')}
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
                placeholder={(settingsData.zhihu as any).has_config ? t('settingsConfigured') : t('settingsNotConfigured')}
              />
              <label className="settings-label">{t('settingsAppSecret')}</label>
              <input
                className="settings-input"
                value={settingsData.zhihu.app_secret}
                onChange={e => setSettingsData(prev => ({
                  ...prev,
                  zhihu: { ...prev.zhihu, app_secret: e.target.value },
                }))}
                placeholder={(settingsData.zhihu as any).has_config ? t('settingsConfigured') : t('settingsNotConfigured')}
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
                setEngineSwitching(true);
                const target = engine === 'qwen' ? 'secondme' : 'qwen';
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
              title={`当前: ${engine === 'qwen' ? '通义千问' : 'SecondMe'}，点击切换`}
            >
              <span className="engine-dot" />
              <span className="engine-name">
                {engine === 'qwen' ? '🤖 Qwen' : '🧠 SecondMe'}
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
                  <button className="action-btn butterfly" onClick={handleButterfly}>{t('butterfly')}</button>
                  <button className="action-btn" onClick={handleReceipt}>{t('receipt')}</button>
                  {receiptText && (
                    <button
                      className={`action-btn share-zhihu ${shareStatus}`}
                      onClick={handleShareToZhihu}
                      disabled={shareStatus === 'sharing' || shareStatus === 'success'}
                    >
                      {shareStatus === 'idle' && t('shareZhihu')}
                      {shareStatus === 'sharing' && t('sharePublishing')}
                      {shareStatus === 'success' && t('shareSuccess')}
                      {shareStatus === 'error' && t('shareRetry')}
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
    </div>
  );
}

export default App;
