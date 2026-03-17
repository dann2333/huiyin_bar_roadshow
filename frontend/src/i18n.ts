/**
 * 轻量 i18n 多语言翻译
 * 支持中文（zh）和英文（en）两种语言
 */

const translations = {
  zh: {
    // 加载页面
    loadingText: '正在翻阅客人名册...',
    loadingHint: '刘看山正在为你准备今晚的酒局',

    // 顶部按钮
    docTrigger: '📖 项目文档',
    settingsTrigger: '⚙️ 设置',

    // 标题
    tavernTitle: '回音酒馆',
    tavernSubtitle: 'Echo Tavern · 跨越时空的人生沙盘',
    connectedSecondMe: '✓ 已连接 SecondMe',

    // 设置弹窗
    settingsTitle: '⚙️ 设置',
    settingsLanguage: '🌐 语言 / Language',
    settingsLlm: '🤖 大模型 API',
    settingsZhihu: '📘 知乎 API',
    settingsBaseUrl: 'Base URL',
    settingsApiKey: 'API Key',
    settingsModel: 'Model',
    settingsAppKey: 'App Key',
    settingsAppSecret: 'App Secret',
    settingsConfigured: '已配置（留空则保持不变）',
    settingsNotConfigured: '未配置，请输入',
    settingsResetBtn: '恢复默认',
    settingsSaveBtn: '保存配置',
    settingsSaving: '保存中...',
    settingsSaveOk: '✅ 保存成功',
    settingsResetOk: '✅ 已恢复默认',
    settingsLoadFail: '加载配置失败',
    settingsResetFail: '❌ 重置失败',
    settingsSaveFail: '❌ 保存失败',
    settingsNetErr: '❌ 网络错误',

    // 认证
    authPrompt: '需要连接 SecondMe 来召唤时空客人',
    authLogin: '🔑 连接 SecondMe',

    // 音乐
    musicPause: '暂停音乐',
    musicPlay: '播放音乐',
    musicVolume: '音量',

    // 酒馆核心
    bartenderName: '🦊 刘看山',
    bartenderWelcome: '*(一只北极狐正在擦拭吧台上的玻璃杯，抬头看了你一眼)*\n\n深夜了，来一杯？...先说说今晚什么事让你推开了这扇门。',
    guestPast: '刘看山请来的客人（当初）',
    guestNow: '刘看山请来的客人（如今）',
    guestAlt: '刘看山请来的客人（平行宇宙）',
    waitingText: '刘看山正在张罗中...',

    // 操作按钮
    autoPause: '⏸ 暂停讨论',
    autoStart: '▶ 自动讨论',
    butterfly: '🦋 蝴蝶效应',
    receipt: '📜 生成箴言',
    shareZhihu: '📤 分享到知乎',
    sharePublishing: '⏳ 发布中...',
    shareSuccess: '✅ 已分享',
    shareRetry: '❌ 重试分享',
    shareLink: '🔗 查看知乎圈子',

    // 输入区
    inputAuto: '自动讨论进行中，点击暂停后可插话...',
    inputSpeaking: '在辩论中插话...',
    inputStart: '说说今晚什么事让你推开了这扇门...',
    btnSpeak: '发言',
    btnEnter: '推门进入',

    // 文档
    docLoadFail: '# 加载失败\n\n无法加载项目文档。',
  },
  en: {
    loadingText: 'Checking the guest registry...',
    loadingHint: 'Liu Kanshan is preparing tonight\'s gathering',

    docTrigger: '📖 Docs',
    settingsTrigger: '⚙️ Settings',

    tavernTitle: 'Echo Tavern',
    tavernSubtitle: 'A Time-Crossing Life Sandbox',
    connectedSecondMe: '✓ Connected to SecondMe',

    settingsTitle: '⚙️ Settings',
    settingsLanguage: '🌐 Language',
    settingsLlm: '🤖 LLM API',
    settingsZhihu: '📘 Zhihu API',
    settingsBaseUrl: 'Base URL',
    settingsApiKey: 'API Key',
    settingsModel: 'Model',
    settingsAppKey: 'App Key',
    settingsAppSecret: 'App Secret',
    settingsConfigured: 'Configured (leave empty to keep)',
    settingsNotConfigured: 'Not configured, please enter',
    settingsResetBtn: 'Reset Default',
    settingsSaveBtn: 'Save',
    settingsSaving: 'Saving...',
    settingsSaveOk: '✅ Saved',
    settingsResetOk: '✅ Reset to default',
    settingsLoadFail: 'Failed to load settings',
    settingsResetFail: '❌ Reset failed',
    settingsSaveFail: '❌ Save failed',
    settingsNetErr: '❌ Network error',

    authPrompt: 'Connect SecondMe to summon time-crossing guests',
    authLogin: '🔑 Connect SecondMe',

    musicPause: 'Pause music',
    musicPlay: 'Play music',
    musicVolume: 'Vol',

    bartenderName: '🦊 Liu Kanshan',
    bartenderWelcome: '*(An arctic fox is polishing a glass, looking up at you)*\n\nLate night... care for a drink? Tell me what brought you through this door tonight.',
    guestPast: 'Guest from the Past',
    guestNow: 'Guest of Today',
    guestAlt: 'Guest from a Parallel Universe',
    waitingText: 'Liu Kanshan is setting things up...',

    autoPause: '⏸ Pause',
    autoStart: '▶ Auto Discuss',
    butterfly: '🦋 Butterfly Effect',
    receipt: '📜 Generate Proverb',
    shareZhihu: '📤 Share to Zhihu',
    sharePublishing: '⏳ Publishing...',
    shareSuccess: '✅ Shared',
    shareRetry: '❌ Retry',
    shareLink: '🔗 View on Zhihu',

    inputAuto: 'Auto discussion in progress, pause to chime in...',
    inputSpeaking: 'Join the conversation...',
    inputStart: 'Tell me what\'s on your mind tonight...',
    btnSpeak: 'Speak',
    btnEnter: 'Push the door',

    docLoadFail: '# Load Failed\n\nUnable to load documentation.',
  },
} as const;

export type Lang = 'zh' | 'en';
export type I18nKey = keyof typeof translations.zh;

/**
 * 根据语言代码获取翻译函数
 * @param lang 语言代码
 * @returns 翻译查找函数
 */
export function getT(lang: Lang): (key: I18nKey) => string {
  const dict = translations[lang] || translations.zh;
  return (key: I18nKey) => dict[key] || key;
}
