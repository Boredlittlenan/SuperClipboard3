export type Locale = 'zh-CN' | 'en';

export interface Translations {
  // Title bar
  appTitle: string;

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
  tabArchive: string;

  // Clipboard items
  justNow: string;
  minutesAgo: (n: number) => string;
  hoursAgo: (n: number) => string;
  clickToCopy: string;
  pin: string;
  unpin: string;
  delete: string;
  edit: string;
  save: string;
  cancel: string;
  openInBrowser: string;
  restore: string;
  archive: string;
  permanentDelete: string;
  permanentDeleteConfirm: string;
  archiveEmpty: string;
  archiveEmptyHint: string;
  daysRemaining: (n: number) => string;
  archiveSubTab: string;
  memoSubTab: string;
  editedAt: (time: string) => string;
  originalContent: string;
  showOriginal: string;
  hideOriginal: string;
  dragToReorder: string;

  // List states
  loading: string;
  noEntries: string;
  noEntriesHint: string;

  // Footer
  itemsCount: (n: number) => string;
  clipboardStorage: (formatted: string) => string;
  memoStorage: (formatted: string) => string;
  clearHistory: string;
  clearConfirm: string;

  // Memos
  memoTab: string;
  memoSearchPlaceholder: string;
  memoNew: string;
  memoTitlePlaceholder: string;
  memoBodyPlaceholder: string;
  memoTagsPlaceholder: string;
  memoEmpty: string;
  memoEmptyHint: string;
  memoShowMore: string;
  memoShowLess: string;
  memoSetting: string;
  memoSettingDesc: string;
  memoColor: string;
  memoColorDesc: string;
  memoColorReset: string;
  archiveSetting: string;
  archiveSettingDesc: string;
  savePosition: string;
  savePositionDesc: string;

  // Toast
  copied: string;

  // Settings
  settings: string;
  language: string;
  langZhCN: string;
  langEn: string;
  themeColor: string;
  themeColorDesc: string;
  themeDefault: string;
  themeSakura: string;
  themeMode: string;
  themeModeDesc: string;
  themeSystem: string;
  themeLight: string;
  themeDark: string;
  autostart: string;
  autostartDesc: string;
  alwaysOnTop: string;
  alwaysOnTopDesc: string;
  rawPreview: string;
  rawPreviewDesc: string;
  followMode: string;
  followModeDesc: string;
  autoUpdate: string;
  autoUpdateDesc: string;
  version: string;
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
  systemSettings: string;
  featureSettings: string;
}

export const zhCN: Translations = {
  appTitle: '小楠の剪切板',

  searchPlaceholder: '搜索剪贴板...',
  clearSearch: '清除搜索',

  tabAll: '全部',
  tabText: '文本',
  tabLink: '链接',
  tabImage: '图片',
  tabCode: '代码',
  tabEmail: '邮箱',
  tabPath: '路径',
  tabArchive: '回收站',

  justNow: '刚刚',
  minutesAgo: (n) => `${n} 分钟前`,
  hoursAgo: (n) => `${n} 小时前`,
  clickToCopy: '点击复制',
  pin: '置顶',
  unpin: '取消置顶',
  delete: '删除',
  edit: '编辑',
  save: '保存',
  cancel: '取消',
  openInBrowser: '在浏览器中打开',
  restore: '恢复',
  archive: '回收站',
  permanentDelete: '彻底删除',
  permanentDeleteConfirm: '确定要彻底删除此条目吗？此操作不可恢复。',
  archiveEmpty: '回收站为空',
  archiveEmptyHint: '删除的条目会暂存在回收站，30天后自动清除',
  daysRemaining: (n) => `${n} 天后清除`,
  archiveSubTab: '剪贴板',
  memoSubTab: '备忘录',
  editedAt: (time) => `编辑于 ${time}`,
  originalContent: '原始内容',
  showOriginal: '查看原文',
  hideOriginal: '收起原文',
  dragToReorder: '拖拽排序',

  loading: '加载中...',
  noEntries: '暂无剪贴板记录',
  noEntriesHint: '复制一些内容开始使用',

  itemsCount: (n) => `${n} 条记录`,
  clipboardStorage: (s) => `剪贴板 ${s}`,
  memoStorage: (s) => `备忘录 ${s}`,
  clearHistory: '清除历史',
  clearConfirm: '确定清除所有未置顶的记录吗？',

  memoTab: '备忘录',
  memoSearchPlaceholder: '搜索备忘录...',
  memoNew: '新建备忘录',
  memoTitlePlaceholder: '标题',
  memoBodyPlaceholder: '写点什么...',
  memoTagsPlaceholder: '添加标签，逗号分隔',
  memoEmpty: '还没有备忘录',
  memoEmptyHint: '点击新建开始记录',
  memoShowMore: '显示更多',
  memoShowLess: '收起',
  memoSetting: '备忘录',
  memoSettingDesc: '在标签栏显示备忘录入口',
  memoColor: '备忘录配色',
  memoColorDesc: '自定义备忘录模块配色，不受主题影响',
  memoColorReset: '重置',
  archiveSetting: '回收站',
  archiveSettingDesc: '删除条目时暂存回收站，30天内可恢复',
  savePosition: '保存位置',
  savePositionDesc: '记录上次窗口位置，下次启动时恢复',

  copied: '已复制！',

  settings: '设置',
  language: '语言',
  langZhCN: '中文',
  langEn: 'English',
  themeColor: '主题配色',
  themeColorDesc: '切换界面强调色，深浅色仍跟随系统',
  themeDefault: '少年蓝',
  themeSakura: '樱花粉',
  themeMode: '主题模式',
  themeModeDesc: '自动跟随系统浅色/深色，或手动指定',
  themeSystem: '跟随系统',
  themeLight: '浅色',
  themeDark: '深色',
  autostart: '开机自启',
  autostartDesc: '系统启动时自动运行',
  alwaysOnTop: '窗口置顶',
  alwaysOnTopDesc: '窗口始终显示在最前面',
  rawPreview: '原格式预览',
  rawPreviewDesc: '以原始格式显示剪贴板内容',
  followMode: '跟随模式',
  followModeDesc: '快捷键唤起时窗口跟随插入符位置',
  autoUpdate: '自动检查更新',
  autoUpdateDesc: '每次启动时自动检查更新',
  version: '版本号',
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
  systemSettings: '系统设置',
  featureSettings: '功能设置',
};

export const en: Translations = {
  appTitle: 'SuperClipboard3',

  searchPlaceholder: 'Search clipboard...',
  clearSearch: 'Clear search',

  tabAll: 'All',
  tabText: 'Text',
  tabLink: 'Link',
  tabImage: 'Image',
  tabCode: 'Code',
  tabEmail: 'Email',
  tabPath: 'Path',
  tabArchive: 'Recycle Bin',

  justNow: 'just now',
  minutesAgo: (n) => `${n}m ago`,
  hoursAgo: (n) => `${n}h ago`,
  clickToCopy: 'Click to copy',
  pin: 'Pin',
  unpin: 'Unpin',
  delete: 'Delete',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  openInBrowser: 'Open in browser',
  restore: 'Restore',
  archive: 'Recycle Bin',
  permanentDelete: 'Delete Forever',
  permanentDeleteConfirm: 'Permanently delete this item? This cannot be undone.',
  archiveEmpty: 'Recycle bin is empty',
  archiveEmptyHint: 'Deleted items stay in recycle bin, auto-cleared after 30 days',
  daysRemaining: (n) => `${n} day${n !== 1 ? 's' : ''} until cleared`,
  archiveSubTab: 'Clipboard',
  memoSubTab: 'Memos',
  editedAt: (time) => `Edited ${time}`,
  originalContent: 'Original',
  showOriginal: 'Show original',
  hideOriginal: 'Hide original',
  dragToReorder: 'Drag to reorder',

  loading: 'Loading...',
  noEntries: 'No clipboard entries yet',
  noEntriesHint: 'Copy something to get started',

  itemsCount: (n) => `${n} item${n !== 1 ? 's' : ''}`,
  clipboardStorage: (s) => `Clipboard ${s}`,
  memoStorage: (s) => `Memo ${s}`,
  clearHistory: 'Clear History',
  clearConfirm: 'Clear all non-pinned entries?',

  memoTab: 'Memos',
  memoSearchPlaceholder: 'Search memos...',
  memoNew: 'New Memo',
  memoTitlePlaceholder: 'Title',
  memoBodyPlaceholder: 'Write something...',
  memoTagsPlaceholder: 'Tags, comma separated',
  memoEmpty: 'No memos yet',
  memoEmptyHint: 'Click to create your first memo',
  memoShowMore: 'Show more',
  memoShowLess: 'Show less',
  memoSetting: 'Memos',
  memoSettingDesc: 'Show memo tab in sidebar',
  memoColor: 'Memo Color',
  memoColorDesc: 'Customize memo module color, independent of theme',
  memoColorReset: 'Reset',
  archiveSetting: 'Recycle Bin',
  archiveSettingDesc: 'Keep deleted items in recycle bin, recoverable within 30 days',
  savePosition: 'Save Position',
  savePositionDesc: 'Remember last window position across restarts',

  copied: 'Copied!',

  settings: 'Settings',
  language: 'Language',
  langZhCN: '中文',
  langEn: 'English',
  themeColor: 'Theme Color',
  themeColorDesc: 'Switch accent color while light/dark follows system',
  themeDefault: 'Blue',
  themeSakura: 'Pink',
  themeMode: 'Theme Mode',
  themeModeDesc: 'Follow system light/dark automatically or choose manually',
  themeSystem: 'System',
  themeLight: 'Light',
  themeDark: 'Dark',
  autostart: 'Auto-start',
  autostartDesc: 'Launch on system startup',
  alwaysOnTop: 'Always on Top',
  alwaysOnTopDesc: 'Keep window above others',
  rawPreview: 'Raw Preview',
  rawPreviewDesc: 'Show clipboard content in raw format',
  followMode: 'Follow Mode',
  followModeDesc: 'Window follows caret position when shown via shortcut',
  autoUpdate: 'Auto Update',
  autoUpdateDesc: 'Check for updates on startup',
  version: 'Version',
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
  systemSettings: 'System Settings',
  featureSettings: 'Feature Settings',
};

export const translationsMap: Record<Locale, Translations> = {
  'zh-CN': zhCN,
  en,
};
