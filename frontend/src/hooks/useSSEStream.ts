import { useCallback, useRef } from 'react';
import type { TavernEvent } from '../types';

const API_BASE = 'http://localhost:8000';

/**
 * SSE 流式数据接收 Hook
 * 处理后端推送的酒馆事件流
 */
export function useSSEStream() {
  const abortRef = useRef<AbortController | null>(null);

  const startStream = useCallback(
    async (
      url: string,
      body: Record<string, unknown>,
      sessionKey: string,
      onEvent: (event: TavernEvent) => void,
      onDone?: () => void,
    ) => {
      // 取消上一个进行中的流
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const resp = await fetch(
          `${API_BASE}${url}?session_key=${sessionKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );

        if (!resp.ok || !resp.body) {
          console.error('SSE 连接失败:', resp.statusText);
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event: TavernEvent = JSON.parse(line.slice(6));
                onEvent(event);
              } catch {
                // NOTE: 跳过无法解析的数据行
              }
            }
          }
        }

        onDone?.();
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('SSE 流异常:', err);
        }
      }
    },
    [],
  );

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { startStream, stopStream };
}
