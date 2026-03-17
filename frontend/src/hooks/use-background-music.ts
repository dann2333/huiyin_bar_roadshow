import { useState, useRef, useEffect, useCallback } from 'react';

const STORAGE_KEY_VOLUME = 'tavern_music_volume';
const STORAGE_KEY_PLAYING = 'tavern_music_playing';

/**
 * 背景音乐管理 Hook
 * 封装 Audio 实例、播放控制、音量调节，并持久化用户偏好
 * NOTE: 浏览器自动播放策略要求用户至少有一次交互后才能播放音频
 */
export function useBackgroundMusic(src: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_VOLUME);
    return saved ? parseFloat(saved) : 0.25;
  });
  // NOTE: 标记用户是否已经有过交互，用于处理浏览器自动播放限制
  const hasInteractedRef = useRef(false);

  // 初始化 Audio 实例
  useEffect(() => {
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = volume;
    audioRef.current = audio;

    // NOTE: 默认播放音乐，除非用户之前明确关闭过
    const savedPlaying = localStorage.getItem(STORAGE_KEY_PLAYING);
    if (savedPlaying !== 'false') {
      const tryAutoPlay = () => {
        audio.play()
          .then(() => {
            setIsPlaying(true);
            hasInteractedRef.current = true;
          })
          .catch(() => {
            // 浏览器阻止了自动播放，等待用户首次交互后重试
            const resumeOnInteraction = () => {
              if (localStorage.getItem(STORAGE_KEY_PLAYING) === 'true') {
                audio.play()
                  .then(() => {
                    setIsPlaying(true);
                    hasInteractedRef.current = true;
                  })
                  .catch(() => { /* 静默失败 */ });
              }
              document.removeEventListener('click', resumeOnInteraction);
              document.removeEventListener('keydown', resumeOnInteraction);
            };
            document.addEventListener('click', resumeOnInteraction, { once: true });
            document.addEventListener('keydown', resumeOnInteraction, { once: true });
          });
      };
      tryAutoPlay();
    }

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  /** 切换播放 / 暂停 */
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play()
        .then(() => {
          setIsPlaying(true);
          hasInteractedRef.current = true;
          localStorage.setItem(STORAGE_KEY_PLAYING, 'true');
        })
        .catch((err) => {
          console.error('播放失败:', err);
        });
    } else {
      audio.pause();
      setIsPlaying(false);
      localStorage.setItem(STORAGE_KEY_PLAYING, 'false');
    }
  }, []);

  /** 设置音量（0 ~ 1） */
  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
    localStorage.setItem(STORAGE_KEY_VOLUME, String(clamped));
  }, []);

  /** 主动播放（如果当前未播放） */
  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.paused) return;
    audio.play()
      .then(() => {
        setIsPlaying(true);
        localStorage.setItem(STORAGE_KEY_PLAYING, 'true');
      })
      .catch(() => { /* 静默失败 */ });
  }, []);

  return { isPlaying, volume, togglePlay, setVolume, play };
}
