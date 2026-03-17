import { useState, useRef, useEffect, useCallback } from 'react';
import { useSSEStream } from './hooks/useSSEStream';
import type { TavernEvent, DialogEntry, TavernState } from './types';
import './index.css';

const API_BASE = 'http://localhost:8000';

/**
 * 轻量 Markdown → HTML 渲染
 * 处理粗体、斜体、标题、列表、换行
 * NOTE: 顺序很重要——先处理 ** 粗体，再处理 * 斜体，避免冲突
 */
function renderMarkdown(text: string): string {
  return text
    // ## 标题 → h3 标签
    .replace(/^###\s+(.+)$/gm, '<h4 style="color:var(--amber-400);margin:0.5rem 0">$1</h4>')
    .replace(/^##\s+(.+)$/gm, '<h3 style="color:var(--amber-400);margin:0.8rem 0 0.3rem">$1</h3>')
    .replace(/^#\s+(.+)$/gm, '<h2 style="color:var(--amber-400);margin:1rem 0 0.5rem">$1</h2>')
    // **粗体** → strong（必须在 *斜体* 之前）
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--amber-200)">$1</strong>')
    // *斜体/动作描述* → em
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // - 列表项 → 带缩进
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
  // NOTE: AI 引擎状态
  const [engine, setEngine] = useState<'qwen' | 'secondme'>('qwen');
  const [engineSwitching, setEngineSwitching] = useState(false);
  const dialogEndRef = useRef<HTMLDivElement>(null);
  const { startStream } = useSSEStream();
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
      setState(prev => ({
        ...prev,
        isLoading: false,
        dialogs: [...prev.dialogs, {
          id: `receipt-${Date.now()}`,
          type: 'stage',
          speaker: '',
          content: `📜 今夜酒馆箴言\n\n${data.receipt || ''}`,
          timestamp: Date.now(),
        }],
      }));
    } catch (err) {
      console.error('生成箴言失败:', err);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [state.sessionId]);

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
        <p className="loading-text">正在翻阅客人名册...</p>
        <p className="loading-hint">刘看山正在为你准备今晚的酒局</p>
      </div>
    );
  }

  return (
    <div className="tavern">
      <header className="tavern-header">
        <img
          src="/images/liukanshan-bartender.png"
          alt="刘看山酒保"
          className="bartender-avatar"
        />
        <h1>回音酒馆</h1>
        <p className="subtitle">Echo Tavern · 跨越时空的人生沙盘</p>
        {authStatus === 'success' && (
          <div className="engine-bar">
            <span className="engine-label">✓ 已连接 SecondMe</span>
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
            需要连接 SecondMe 来召唤时空客人
          </p>
          <button className="send-btn" onClick={handleLogin}>🔑 连接 SecondMe</button>
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
            <div className="dialog-speaker">🦊 刘看山</div>
            <div className="dialog-content">
              <em>*(一只北极狐正在擦拭吧台上的玻璃杯，抬头看了你一眼)*</em>
              <br /><br />
              深夜了，来一杯？...先说说今晚什么事让你推开了这扇门。
            </div>
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
                    {entry.speaker}
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
            <p className="waiting-text">刘看山正在张罗中...</p>
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
                  ⏸ 暂停讨论
                </button>
              ) : (
                <button
                  className="action-btn auto-start"
                  onClick={handleAutoStart}
                  disabled={state.isLoading}
                >
                  ▶ 自动讨论
                </button>
              )}
              {!state.isLoading && !state.autoMode && (
                <>
                  <button className="action-btn butterfly" onClick={handleButterfly}>🦋 蝴蝶效应</button>
                  <button className="action-btn" onClick={handleReceipt}>📜 生成箴言</button>
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
                  ? '自动讨论进行中，点击暂停后可插话...'
                  : started
                    ? '在辩论中插话...'
                    : '说说今晚什么事让你推开了这扇门...'
              }
              disabled={state.isLoading || state.autoMode}
            />
            <button
              className="send-btn"
              onClick={handleSubmit}
              disabled={state.isLoading || !input.trim()}
            >
              {started ? '发言' : '推门进入'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
