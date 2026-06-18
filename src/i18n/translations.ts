export type Locale = 'zh-CN' | 'en';

export interface Translations {
  // Title bar
  appTitle: string;
  shortcutHint: string;

  // Search
  searchPlaceholder: string;
  clearSearch: string;

  // Category tabs
  tabAll: string;
  tabText: string;
  tabLink: string;
  tabImage: string;
  tabCode: string;
  tabEmail: string;
  tabPath: string;

  // Clipboard items
  justNow: string;
  minutesAgo: (n: number) => string;
  hoursAgo: (n: number) => string;
  daysAgo: (n: number) => string;
  clickToCopy: string;
  pin: string;
  unpin: string;
  delete: string;

  // List states
  loading: string;
  noEntries: string;
  noEntriesHint: string;

  // Footer
  itemsCount: (n: number) => string;
  clearHistory: string;
  clearConfirm: string;

  // Toast
  copied: string;

  // Settings
  settings: string;
  language: string;
  langZhCN: string;
  langEn: string;
  autostart: string;
  autostartDesc: string;
  shortcut: string;
  shortcutDesc: string;
  shortcutRecording: string;
  shortcutInvalid: string;
  checkUpdate: string;
  checking: string;
  upToDate: string;
  hasUpdate: (version: string) => string;
  updateFailed: string;
  downloadUpdate: string;
}

export const zhCN: Translations = {
  appTitle: 'SuperClipboard3',
  shortcutHint: 'Ctrl+Shift+V',

  searchPlaceholder: '搜索剪贴板...',
  clearSearch: '清除搜索',

  tabAll: '全部',
  tabText: '文本',
  tabLink: '链接',
  tabImage: '图片',
  tabCode: '代码',
  tabEmail: '邮箱',
  tabPath: '路径',

  justNow: '刚刚',
  minutesAgo: (n) => `${n} 分钟前`,
  hoursAgo: (n) => `${n} 小时前`,
  daysAgo: (n) => `${n} 天前`,
  clickToCopy: '点击复制',
  pin: '置顶',
  unpin: '取消置顶',
  delete: '删除',

  loading: '加载中...',
  noEntries: '暂无剪贴板记录',
  noEntriesHint: '复制一些内容开始使用',

  itemsCount: (n) => `${n} 条记录`,
  clearHistory: '清除历史',
  clearConfirm: '确定清除所有未置顶的记录吗？',

  copied: '已复制！',

  settings: '设置',
  language: '语言',
  langZhCN: '中文',
  langEn: 'English',
  autostart: '开机自启',
  autostartDesc: '系统启动时自动运行',
  shortcut: '快捷键',
  shortcutDesc: '唤起/隐藏窗口',
  shortcutRecording: '按下新的组合键...',
  shortcutInvalid: '需要至少一个修饰键',
  checkUpdate: '检查更新',
  checking: '检查中...',
  upToDate: '已是最新版本',
  hasUpdate: (v) => `发现新版本 ${v}`,
  updateFailed: '检查失败，请稍后重试',
  downloadUpdate: '前往下载',
};

export const en: Translations = {
  appTitle: 'SuperClipboard3',
  shortcutHint: 'Ctrl+Shift+V',

  searchPlaceholder: 'Search clipboard...',
  clearSearch: 'Clear search',

  tabAll: 'All',
  tabText: 'Text',
  tabLink: 'Link',
  tabImage: 'Image',
  tabCode: 'Code',
  tabEmail: 'Email',
  tabPath: 'Path',

  justNow: 'just now',
  minutesAgo: (n) => `${n}m ago`,
  hoursAgo: (n) => `${n}h ago`,
  daysAgo: (n) => `${n}d ago`,
  clickToCopy: 'Click to copy',
  pin: 'Pin',
  unpin: 'Unpin',
  delete: 'Delete',

  loading: 'Loading...',
  noEntries: 'No clipboard entries yet',
  noEntriesHint: 'Copy something to get started',

  itemsCount: (n) => `${n} item${n !== 1 ? 's' : ''}`,
  clearHistory: 'Clear History',
  clearConfirm: 'Clear all non-pinned entries?',

  copied: 'Copied!',

  settings: 'Settings',
  language: 'Language',
  langZhCN: '中文',
  langEn: 'English',
  autostart: 'Auto-start',
  autostartDesc: 'Launch on system startup',
  shortcut: 'Shortcut',
  shortcutDesc: 'Show/hide window',
  shortcutRecording: 'Press new shortcut...',
  shortcutInvalid: 'Requires at least one modifier',
  checkUpdate: 'Check for Updates',
  checking: 'Checking...',
  upToDate: 'You are up to date',
  hasUpdate: (v) => `New version ${v} available`,
  updateFailed: 'Check failed, try again later',
  downloadUpdate: 'Download',
};

export const translationsMap: Record<Locale, Translations> = {
  'zh-CN': zhCN,
  en,
};
