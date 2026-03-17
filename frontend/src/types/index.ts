/**
 * 酒馆事件类型
 * 后端 SSE 推送的统一事件格式
 */
export interface TavernEvent {
  type: 'bartender' | 'guest_past' | 'guest_now' | 'guest_alt' | 'system' | 'stage' | 'auto_status';
  speaker: string;
  content: string;
  action: string;
  stage: number;
  done: boolean;
  session_id: string;
}

/**
 * 对话条目（前端渲染用）
 */
export interface DialogEntry {
  id: string;
  type: TavernEvent['type'];
  speaker: string;
  content: string;
  timestamp: number;
}

/**
 * 酒局状态
 */
export interface TavernState {
  sessionId: string;
  stage: number;
  isLoading: boolean;
  dialogs: DialogEntry[];
  sessionKey: string;
  /** 是否处于自动对话模式 */
  autoMode: boolean;
}

