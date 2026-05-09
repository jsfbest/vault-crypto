# Vault Crypto

An Obsidian plugin that provides real AES-256-GCM encryption for your Markdown notes. Not a UI mask — your file content is genuinely encrypted.

> ⚠️ **Forget your password = lose your data.** There is no backdoor or recovery mechanism.

## Features

- **File encryption**: Right-click any `.md` file → encrypt with a password
- **Folder encryption**: Right-click a folder → encrypt all `.md` files inside
- **Three-state model**: Encrypted (locked) → Temp View (auto re-encrypt on navigate away) → Full Decrypt (permanent plaintext)
- **Lock overlay**: Encrypted files show a lock screen instead of gibberish
- **Auto-lock**: Re-encrypts after N minutes of inactivity (default: 1 min)
- **Confirm before encrypt**: Prevents accidental encryption (enabled by default)
- **Sync-friendly**: In-place encryption (file stays `.md`) — works with Syncthing, iCloud, Dropbox
- **Zero dependencies**: Pure Web Crypto API (`crypto.subtle`), works on macOS and iOS

## Encryption

| Parameter | Value |
|-----------|-------|
| Algorithm | AES-256-GCM |
| Key derivation | PBKDF2-SHA512, 600,000 iterations |
| Salt | 128-bit random (unique per encryption) |
| IV | 96-bit random (unique per encryption) |
| File marker | `-----VAULT-CRYPTO-----` header |

Encrypted file format:
```
-----VAULT-CRYPTO-----
<base64(JSON{salt, iv, ciphertext})>
```

File extension stays `.md` — only the content is replaced with ciphertext. Any sync tool will see a normal `.md` file with unreadable content.

## Installation

### Manual (current)

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](../../releases)
2. Create folder `<vault>/.obsidian/plugins/vault-crypto/`
3. Copy the 3 files into it
4. Restart Obsidian → Settings → Community plugins → enable "Vault Crypto"

### From source

```bash
git clone https://github.com/<your-username>/obsidian-vault-crypto.git
cd obsidian-vault-crypto
npm install
npm run build
# Copy main.js, manifest.json, styles.css to your vault plugin directory
```

## Usage

### Encrypt a file

1. Right-click a `.md` file in the file explorer
2. Click **加密文件**
3. Confirm the operation (if enabled)
4. Enter password twice (minimum 4 characters)

### View an encrypted file (temporary)

1. Open an encrypted file → see lock overlay
2. Right-click the editor area → **查看加密文件**
3. Enter password once → plaintext shown temporarily
4. Navigate away or wait → **auto re-encrypts**

### Fully decrypt a file

1. Right-click an encrypted file → **完全解密文件**
2. Enter password once → file permanently reverted to plaintext

### Commands

Open command palette (`Cmd/Ctrl + P`) and search:

| Command | Description |
|---------|-------------|
| 加密当前文件 | Encrypt current file |
| 查看加密当前文件 | Temporarily view encrypted file |
| 完全解密当前文件 | Permanently decrypt current file |
| 加密当前文件所在文件夹 | Encrypt all .md in current folder |
| 完全解密当前文件所在文件夹 | Permanently decrypt all .md in current folder |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Auto-lock time | 1 minute | Minutes of inactivity before re-encrypting a temporary view. 0 = disabled |
| Confirm before encrypt | On | Show confirmation dialog before encrypting |

## Important

- **Forgotten passwords cannot be recovered.** Always remember your passwords and back up your vault regularly.
- Attachments (images, PDFs) are **not encrypted** — only `.md` content.
- Avoid editing the same encrypted file on multiple devices simultaneously to prevent sync conflicts.
- "查看加密文件" is temporary (auto re-encrypts on navigate away). "完全解密文件" is permanent.

## Development

```bash
npm install
npm run dev    # Watch mode
npm run build  # Production build
```

## License

[MIT](LICENSE)
