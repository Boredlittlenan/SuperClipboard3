# SuperClipboard3

[English](README.md)

基于 Rust + Tauri + React + TypeScript 构建的轻量级剪贴板管理器。

## 功能特性

- 智能分类：自动识别剪贴板内容类型（文本、链接、图片、代码、邮箱、文件路径）
- 实时监控：SHA-256 哈希去重，避免重复存储
- SQLite 持久化存储，支持索引查询，搜索快速
- 置顶重要条目，一键复制回剪贴板
- 全局快捷键显示/隐藏窗口（可在设置中自定义快捷键）
- 系统托盘集成，右键菜单支持打开设置和退出应用
- 自动适配深色/浅色主题
- 设置面板，支持中英文语言切换
- 开机自启动（Windows 注册表）
- 用户偏好设置持久化存储（SQLite）
- 一键检查更新（GitHub Releases）

## 技术栈

- **后端**：Rust、Tauri v2、SQLite（rusqlite）、arboard
- **前端**：React 19、TypeScript、Vite 8
- **存储**：SQLite，内容哈希去重

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式运行
pnpm tauri:dev

# 生产构建
pnpm tauri:build
```

## 项目结构

```
src-tauri/
  src/
    clipboard.rs    # 剪贴板监控服务
    classifier.rs   # 内容类型分类
    storage.rs      # SQLite 存储层（条目 + 设置）
    autostart.rs    # 开机自启动（Windows 注册表）
    lib.rs          # Tauri 命令与应用初始化
    main.rs         # 入口文件
src/
  components/       # React UI 组件
    SettingsButton.tsx  # 设置面板（语言选择、快捷键、开机自启）
  api/              # Tauri 命令封装
  i18n/             # 国际化（翻译文件 + Context）
  types/            # TypeScript 类型定义
```

## 后续规划

- [ ] **虚拟列表（Virtual Scrolling）**：当剪贴板条目积累较多时（数千条级别），当前 `.map()` 全量渲染方式会导致 DOM 节点过多、滚动卡顿。需引入虚拟列表（如 `@tanstack/react-virtual` 或 `react-window`），仅渲染可视区域内的条目，保持恒定渲染性能，配合无限滚动加载历史。
