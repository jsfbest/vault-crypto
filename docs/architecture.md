# 架构设计

## 项目结构

```
src/
├── main.ts              # 插件入口（820+ 行）：生命周期 + 命令 + 右键菜单 + 事件 + 三态管理 + 自动锁定
├── crypto.ts            # 加密核心：AES-256-GCM + PBKDF2（Web Crypto API）
├── LockManager.ts       # 状态管理：lockFile returns "encrypted"|"skipped"，lockFolder returns {success,skipped,failed}
├── Logger.ts            # 文件日志：桌面端写 vault-crypto.log，移动端 console-only
├── SettingsTab.ts       # 设置界面：autoLockMinutes=1, confirmOnEncrypt=true
└── ui/
    ├── PasswordModal.ts # 密码输入弹窗：encrypt/decrypt 两种模式，resolve-before-close
    └── LockOverlay.ts   # 锁定遮罩：无按钮，提示右键查看
styles.css               # overlay 样式（含 lock-hint）
```

## 核心设计决策

### 1. 原地加密（不改扩展名）

加密后文件仍是 `.md`，内容替换为：
```
-----VAULT-CRYPTO-----
<base64(JSON{salt, iv, ciphertext})>
```

**为什么**：
- Obsidian Sync / iCloud / Dropbox / Syncthing 都会同步 `.md` 文件
- 改扩展名（如 Meld Encrypt 的 `.mdenc`）会导致同步工具忽略文件
- 用户在文件系统上看到的仍是 .md，只是内容不可读

### 2. 锁定遮罩（不切换视图，无按钮）

打开加密文件时，在编辑区上方覆盖 DOM overlay，显示"此文件已加密" + 右键/命令面板提示。**无解锁按钮**——用户通过右键菜单或命令面板触发"查看加密文件"（临时解密）或"完全解密文件"（永久解密）。

**为什么**：
- 不需要自定义 View 子类（Meld Encrypt 的 `EncryptedMarkdownView` 是数据丢失的根源）
- 不改 CodeMirror 渲染流程
- Obsidian file-menu 的 callback 无法做异步判断 → 无法根据文件状态动态显示/隐藏菜单项 → 改为始终显示，handler 内检查状态

### 3. Web Crypto API（零依赖）

只用 `crypto.subtle`，不用任何 npm 加密库。

**为什么**：
- 浏览器原生 API，macOS + iOS 都支持
- 没有 WASM 问题、没有 bundle size 问题
- 审计友好的标准实现

### 4. 三态模型

文件有三种状态，两种解密模式：

```
Unencrypted ──加密──→ Encrypted(locked) ──查看──→ TempView(unlocked)
                            │                          │
                            │                    切走/超时/onunload
                            │                          │
                            │                    自动重加密
                            │                          │
                            │←──────────────────────────┘
                            │
                       完全解密
                            │
                            ↓
                       Unencrypted
```

核心数据结构（在 main.ts 内）：
- `knownEncryptedPaths: Set<string>` — 同步缓存，持久化到 data.json，用于即时显示 overlay（避免 async cachedRead 延迟）
- `tempUnlockedPaths: Map<string, string>` — file path → password，切走时用此密码重加密

**为什么不直接解密到文件**：
- 用户可能只是临时查看，不想保持明文状态
- 切走时自动重加密 = 默认安全（加密是稳态，明文是临时态）

### 5. 自动锁定定时器

临时查看的文件在 N 分钟无操作后自动重加密。

实现：
- `autoLockTimers` + `lastActivityTime` — 10 秒轮询检查
- `activityDomListeners` — 监听 .cm-scroller 的 scroll/click/keydown/mousemove 事件
- 触发重加密时：`reEncryptTempUnlocked` + Notice "文件已自动重新加密"
- 默认 1 分钟（可通过设置调整，0 = 关闭）

### 6. 加密前确认

`confirmEncrypt()` 弹出确认 Modal："加密后需要密码才能查看文件内容。确定要加密吗？"

- 默认开启（`confirmOnEncrypt: true`）
- 关闭后加密操作直接进入密码输入

### 7. 单设备操作约定

不做写后验证（write-then-verify roundtrip），靠用户约定"同一时间只在一台设备操作加密文件"。

**为什么不加写后验证**：
- 用户用 Syncthing 同步，文件系统级同步，天然比 Obsidian Sync 简单
- 写后验证增加复杂度（写 → 读回 → 解密确认 → 重试逻辑）
- MVP 阶段靠约定够用，P1 再加

### 8. 密码可解密

密码 + 加密文件 = 可解密，不依赖 Obsidian 插件。

加密文件格式是公开的（`-----VAULT-CRYPTO-----` + base64 JSON），任何人拿到密码后可用任何语言实现解密（AES-256-GCM 是标准算法）。

MVP 不提供独立解密工具，P2 可考虑 standalone HTML 解密页。

## 加密流程

```
用户右键 → "加密文件" → confirmEncrypt（如开启）
  ↓
PasswordModal(encrypt) → 输入密码×2
  ↓
读取文件内容（vault.read）
  ↓
isEncrypted? → 是 → Notice "此文件已加密"，中止
  ↓
encrypt(content, password)
  ↓ PBKDF2-SHA512 1M iter → deriveKey
  ↓ AES-256-GCM encrypt
  ↓ 组装 payload: header + base64(JSON{salt, iv, ciphertext})
  ↓
vault.modify(file, encryptedContent)
  ↓
添加到 knownEncryptedPaths + tempUnlockedPaths 清理
saveSettings
```

## 查看加密文件（临时解密）

```
用户右键 → "查看加密文件" →
  ↓
PasswordModal(decrypt) → 输入密码×1
  ↓
读取文件内容 → decrypt(content, password)
  ↓ GCM 校验失败 → Notice "密码错误"
  ↓
vault.modify(file, decryptedContent)
  ↓
移除 LockOverlay
添加到 tempUnlockedPaths(file.path, password)
启动 autoLockTimer(file.path)
registerActivityListeners(file.path)
Notice "文件已临时解锁，切换文件时将自动重新加密"
```

## 完全解密文件

```
用户右键 → "完全解密文件" →
  ↓
PasswordModal(decrypt) → 输入密码×1
  ↓
读取文件内容 → decrypt(content, password)
  ↓
vault.modify(file, decryptedContent)
  ↓
从 knownEncryptedPaths 删除
清理 autoLockTimer + activityListeners
saveSettings
```

## 自动重加密

```
触发条件：切走文件 / 自动锁定超时 / 插件卸载
  ↓
reEncryptTempUnlocked(filePath):
  1. 读取当前文件内容（用户可能编辑过）
  2. 加 delay（200ms，防 CodeMirror 渲染闪烁）
  3. encrypt(当前内容, tempUnlockedPaths 中存的密码)
  4. vault.modify(file, encryptedContent)
  5. 从 tempUnlockedPaths 删除
  6. 添加回 knownEncryptedPaths
  7. saveSettings
  8. Notice "文件已自动重新加密"
```

## 文件夹加密

```typescript
lockFolder(folder, password):
  files = Vault.recurseChildren(folder) 取所有 .md 文件
  for each file:
    result = lockFile(file, password)
    // lockFile returns "encrypted" | "skipped"
    // "skipped" = 文件已加密
  lockedFolders.add(folder.path)
  return { success, skipped, failed }

Notice 显示: "加密完成：成功 N 个，跳过 N 个（已加密），失败 N 个"
```

## 功能范围

**已完成（P0 + 部分 P1）**：
- 右键菜单：加密文件 / 查看加密文件 / 完全解密文件 / 加密文件夹 / 完全解密文件夹
- 编辑区右键：查看加密文件
- 命令面板：加密当前文件 / 查看加密当前文件 / 完全解密当前文件 / 加密文件夹 / 完全解密文件夹
- 密码弹窗：加密模式（输入两次），解密模式（输入一次）
- 锁定遮罩：无按钮，提示右键操作
- 三态模型：临时查看自动重加密
- 自动锁定定时器：默认 1 分钟
- 加密前确认对话框
- 设置页：自动锁定时间 + 加密前确认开关
- 日志文件：桌面端写 vault-crypto.log

**未做（P1+）**：
- 会话级密码缓存（当前 tempUnlockedPaths 仅缓存查看中的文件密码）
- 附件加密
- 生物识别
- 移动端 UI 适配（crypto 层已就绪）
- 写后验证 roundtrip
- 独立解密工具（standalone HTML）
- iOS 适配
