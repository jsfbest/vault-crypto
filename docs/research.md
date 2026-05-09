# 竞品调研

调研日期：2026-05-09

## 调研结论

**现有插件均不满足需求，决定从零开发。**

## 调研的插件

### Tier 1：真实加密（文件在磁盘上加密）

| 插件 | Star | 最后更新 | 加密算法 | 文件夹加密 | 锁定遮罩 | 移动端 | 同步兼容 | 附件加密 |
|------|------|---------|---------|-----------|---------|-------|---------|---------|
| **Meld Encrypt** | 907 | 2025-07 | AES-256-GCM, PBKDF2-SHA512 210K | ❌ | ❌ 改扩展名 | ✅ | ❌ .mdenc不同步 | ❌ |
| **Lockdown** | 4 | 2025-11 | AES-256-GCM, PBKDF2-SHA512 1M | ⚠️ 仅.md | ⚠️ 脆弱DOM hack | ⚠️ 未验证 | ✅ 不改扩展名 | ❌ |
| **Eccirian Encrypt** | 37 | 2026-03 | AES-256-GCM + ECC-P-256, Argon2id | ⚠️ 仅.md | ⚠️ 只读视图 | ❌ 仅桌面 | ⚠️ 自定义扩展 | ✅ |

### Tier 2：UI 保护（无真实加密，文件在文件系统上明文可读）

| 插件 | 机制 | 问题 |
|------|------|------|
| **Note Lock** | frontmatter 标记 + UI 提示 | 不加密，文件系统直接可读 |
| **Simple Password** | 路径锁定 + 模糊效果 | 自己承认"不是真正的安全" |
| **Peekaboo** | 从文件列表隐藏 | 不加密，只是藏起来 |

## 深度分析

### Meld Encrypt（最知名，907⭐）

- **已有代码**: 30 个源文件，~4139 LOC，100% TypeScript
- **加密格式**: `.mdenc` JSON 文件 `{version, hint, encodedData}`
- **核心问题**: `.mdenc` 扩展名 → Obsidian Sync 默认不同步 → 数据丢失风险
- **架构问题**: `EncryptedMarkdownView` 通过 hack `getViewData()`/`save()` 拦截 Obsidian 内部保存流程，极度脆弱，已知导致数据丢失（Issue #187, #218）
- **遗留加密**: 仍有 v0（SHA-256 直接当 key + 静态 IV）和 v1（硬编码 salt）的旧代码
- **零测试**: 无任何测试文件
- **停更 10 个月**: 35 个未关闭 issue

**Fork 可行性 6/10**：TypeScript 代码可读，但核心架构（save 拦截）是定时炸弹，加文件夹加密需大改

### Lockdown（最接近需求）

- **加密层质量高**: `src/core/crypto/` 用了 DDD 分层，接口清晰，AAD 绑定文件路径
- **核心问题**: `main.ts` 1940 行 god class，满屏 `setTimeout` 解决竞态（100ms, 200ms, 300ms, 500ms, 1000ms）
- **已知 Bug**: 移动/重命名文件后锁状态丢失（Issue #7）
- **DOM hack**: 锁定遮罩依赖 Obsidian 内部 CSS 类名，移动端可能炸
- **零测试**

**Fork 可行性 5.5/10**：crypto 层 200 行好代码值得借鉴，但 3700 行其余代码是负资产

### Eccirian Encrypt（功能最全）

- **唯一支持附件加密**
- **桌面端 only** → 直接排除
- MPL-2.0 协议

**Fork 可行性 5/10**：无移动端支持是硬伤

## 为何从零开发

| 从零做 | Fork Lockdown |
|--------|---------------|
| crypto 层 200 行代码重写 | crypto 层确实好，但 |
| 架构从头设计（状态机、正规 API） | 1940 行 god class + duplicate state 无法重构 |
| 用 Obsidian registerEditorExtension 做 overlay | DOM hack 注定移动端炸 |
| .md 原地加密 → 同步天然兼容 | 同 |
| ~1500 行代码，干净可控 | 清理技术债要改 60%+ 的代码 |

Lockdown 的 crypto 层 `src/core/crypto/` 值 200 行代码，但整个 plugin 其余 3700 行是负资产。

## 未调研但存在的插件

- Markdown Password (`hoyin258/markdown-password`) — inline `[|vault:id|]` 格式
- Folder Guard (`robfelice/folder-guard`) — 很新，0 star
- Encrypted Folders (`eng618/obsidian-encrypted-folders`) — PR 待审核
- Cryptsidian — 已废弃，弱加密（AES-256-CTR + 静态 salt）

## 后续竞品分析（2026-05-09）

### globaloe（shlemiel/globaloe）— Global Markdown Encryption

- AES-256-GCM + PBKDF2-SHA512 **1,000,000 iterations**
- 加密后扩展名改为 `.aes256` → Syncthing/Obsidian 不当 markdown 处理 → 同步断裂
- 单密码全局加解密，无临时查看概念
- 仅 editing-view 模式，无 auto-lock

### obsidian-inline-encrypter（solargate/obsidian-inline-encrypter）

- AES-256-GCM，选区加密（inline code block），不是整文件加密
- 提供独立 `tools/decrypt.html`（粘贴密文 + 输密码模式）
- 不改文件扩展名（因为只是内联代码块）

### 分析结论

globaloe 和 inline-encrypter **同源**（作者 shlemiel / Alexander Cheryomukhin.solargate 大概率同一人）：
- globaloe = 整文件加密 → 发现 `.aes256` 扩展名导致同步断裂
- inline-encrypter = 转为选区加密以绕过扩展名问题 → 但不能保护整个文件

vault-crypto 差异化：整文件加密 + 不改扩展名 + 三态自动重加密 + 文件夹加密 + auto-lock + 独立解密 HTML 工具。

PBKDF2 迭代已对齐 globaloe（1M iter），并在 payload 中新增 `iter` 字段保证向后兼容。
