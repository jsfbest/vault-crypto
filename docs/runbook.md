# 运维手册

## 冒烟验证

安装插件后，验证基本功能：

```bash
# 1. 构建成功
cd /Users/jason/Desktop/opencode/obsidian-vault-crypto
npm run build
# 期望：exit code 0，生成 main.js

# 2. 类型检查通过
npx tsc -noEmit
# 期望：无错误输出
```

Obsidian 内验证：

1. 启用插件 → 设置页可以看到 "Vault Crypto" → ✅
2. 右键 .md 文件 → 右键菜单显示"加密文件" → ✅
3. 加密一个测试文件 → 内容变成 `-----VAULT-CRYPTO-----` 开头 → ✅
4. 打开加密文件 → 显示锁定遮罩 → ✅
5. 右键编辑区 → "查看加密文件" → 输密码 → 看到明文 → ✅
6. 切走文件 → 自动重加密 → 再切回看到遮罩 → ✅
7. 输错密码 → 提示错误，不崩溃 → ✅
8. 右键加密文件 → "完全解密文件" → 输密码 → 文件变回明文 → ✅
9. 等待 1 分钟无操作 → 自动重加密 → ✅
10. 设置中关闭"加密前确认" → 加密文件不再弹确认框 → ✅

## 常见问题

### 插件加载失败

**现象**：设置中看不到插件，或控制台报错

排查：
1. 检查 `.obsidian/plugins/vault-crypto/` 下有 `main.js`、`manifest.json` 和 `styles.css`
2. 检查 `manifest.json` 的 `id` 与目录名一致
3. Obsidian 控制台（Cmd+Option+I）看报错信息
4. `main.js` 是 CommonJS 格式（用 `require`），不是 ESM

### 加密后同步异常

**现象**：其他设备看不到加密文件的内容更新

排查：
1. 加密后文件仍是 `.md` → Syncthing 应该正常处理
2. 检查 Syncthing 是否在运行，同步状态是否正常
3. Obsidian Sync：如使用，确认没有设置"仅同步 markdown 文件"
4. Syncthing 冲突：检查是否有 `.sync-conflict-` 文件，如有说明多设备同时修改了同一文件

### 解密失败

**现象**：输入正确密码仍提示失败

排查：
1. 文件可能在外部被修改（手动编辑了密文部分）
2. 检查文件开头是否仍是 `-----VAULT-CRYPTO-----`
3. 如果文件被截断（同步冲突导致），密文不完整 → 数据丢失，无法恢复
4. 从备份恢复文件

### 锁定遮罩不显示

**现象**：打开加密文件直接看到密文内容

排查：
1. 插件是否启用
2. 刷新 Obsidian（Cmd+R）
3. 检查控制台是否有 JavaScript 错误
4. 遮罩依赖 `.cm-scroller` DOM 元素，Obsidian 版本更新可能改变内部结构
5. 检查 `data.json` 中 `encryptedPaths` 是否包含该文件路径

### 切换文件时闪现密文

**现象**：从加密文件切到未加密文件时，短暂闪现加密内容

排查：
1. 这是已知限制（Obsidian CodeMirror 复用编辑器视图，overlay 移除时机略早于新内容渲染）
2. 影响范围：仅同 tab 内切换，不影响数据安全
3. 当前无完美解决方案，用户已接受

### 自动锁定不生效

**现象**：临时查看后超时不自动重加密

排查：
1. 检查设置中"自动锁定时间"是否为 0（0 = 关闭）
2. 检查控制台是否有 autoLockTimer 相关报错
3. 确认 .cm-scroller 有活动事件监听（用户滚动/点击/输入会重置计时器）

## 密码安全

| 项目 | 值 |
|------|-----|
| 算法 | AES-256-GCM |
| 密钥派生 | PBKDF2-SHA512, 1,000,000 迭代 |
| Salt | 128-bit 随机 |
| IV | 96-bit 随机 |
| 密码 hash 存储 | SHA-256（仅用于验证，不用于加密） |
| 密码存储 | 不存储密码本身，只存 hash |
| 暴力破解难度 | 1M PBKDF2 迭代 ≈ 每次尝试 ~1.5 秒 |

## 文件格式

加密后的 .md 文件内容：
```
-----VAULT-CRYPTO-----
eyJzYWx0Ijoi...base64...IiwiY2lwaGVydGV4dCI6Ii4uLmJhc2U2NC4uLiJ9
```

解码 base64 后是 JSON：
```json
{
  "salt": "<128-bit random, base64>",
  "iv": "<96-bit random, base64>",
  "ciphertext": "<AES-256-GCM encrypted data, base64>"
}
```

如需在 Obsidian 外解密：需实现相同的 PBKDF2 + AES-GCM 解密流程（任何支持 Web Crypto API 的环境均可）。

## 日志

桌面端日志文件位置：`<vault>/.obsidian/plugins/obsidian-vault-crypto/vault-crypto.log`

移动端无文件日志，输出到 console。
