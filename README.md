# Vault Crypto for Obsidian

[中文文档](README_CN.md)

An Obsidian plugin that provides real AES-256-GCM encryption for your Markdown notes. Not a UI mask — your file content is genuinely encrypted.

> ⚠️ **Forget your password = lose your data.** There is no backdoor or recovery mechanism.

## Features

- **File encryption**: Right-click any `.md` file → encrypt with a password
- **Folder encryption**: Right-click a folder → encrypt all `.md` files inside
- **Three-state model**: Encrypted (locked) → Temp View (auto re-encrypt on navigate away) → Full Decrypt (permanent plaintext)
- **Lock overlay**: Encrypted files show a lock screen instead of gibberish
- **Auto-lock**: Re-encrypts after N minutes of inactivity (default: 1 min)
- **Confirm before encrypt**: Prevents accidental encryption (enabled by default)
- **Decrypt tool export**: Export a standalone HTML file — recipient opens in browser, enters password to decrypt
- **Sync-friendly**: In-place encryption (file stays `.md`) — works with Syncthing, iCloud, Dropbox
- **Zero dependencies**: Pure Web Crypto API (`crypto.subtle`), works on macOS and iOS

## Encryption

| Parameter | Value |
|-----------|-------|
| Algorithm | AES-256-GCM |
| Key derivation | PBKDF2-SHA512, 1,000,000 iterations |
| Salt | 128-bit random (unique per encryption) |
| IV | 96-bit random (unique per encryption) |
| File marker | `-----VAULT-CRYPTO-----` header |

Encrypted file format:
```
-----VAULT-CRYPTO-----
<base64(JSON{salt, iv, ciphertext, iter})>
```

The `iter` field stores the PBKDF2 iteration count used for encryption, ensuring backward compatibility if the default ever changes.

File extension stays `.md` — only the content is replaced with ciphertext. Any sync tool will see a normal `.md` file with unreadable content.

## Installation

1. Go to the [latest release](https://github.com/jsfbest/vault-crypto/releases/latest)
2. Download `vault-crypto.zip`
3. Unzip it → you get a `vault-crypto/` folder containing `main.js`, `manifest.json`, `styles.css`
4. Copy the `vault-crypto/` folder into your vault's `.obsidian/plugins/` directory
5. Restart Obsidian → Settings → Community plugins → enable **Vault Crypto**

## Usage

### Encrypt a file

1. Right-click a `.md` file in the file explorer
2. Click **Encrypt File**
3. Confirm the operation (if enabled)
4. Enter password twice (minimum 4 characters)

### View an encrypted file (temporary)

1. Open an encrypted file → see lock overlay
2. Right-click the editor area → **View Encrypted File**
3. Enter password once → plaintext shown temporarily
4. Navigate away or wait → **auto re-encrypts**

### Fully decrypt a file

1. Right-click an encrypted file → **Fully Decrypt File**
2. Enter password once → file permanently reverted to plaintext

### Export decrypt tool

1. Right-click an encrypted file → **Export Decrypt Tool**
2. Desktop: system save dialog opens → choose save location
3. Mobile: HTML saved to same folder as the .md file
4. Share the exported HTML file — recipient opens it in browser, enters password to decrypt

A generic decryption page (paste ciphertext mode) is also available at `tools/decrypt.html`.

### Commands

Open command palette (`Cmd/Ctrl + P`) and search:

| Command | Description |
|---------|-------------|
| Encrypt current file | Encrypt current file with password |
| View encrypted current file | Temporarily view encrypted file (auto re-encrypt on navigate away) |
| Fully decrypt current file | Permanently decrypt current file |
| Encrypt current folder | Encrypt all .md in current folder |
| Fully decrypt current folder | Permanently decrypt all .md in current folder |
| Export decrypt tool | Export standalone decrypt HTML for current encrypted file |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Auto-lock time | 1 minute | Minutes of inactivity before re-encrypting a temporary view. 0 = disabled |
| Confirm before encrypt | On | Show confirmation dialog before encrypting |

## Important

- **Forgotten passwords cannot be recovered.** Always remember your passwords and back up your vault regularly.
- Attachments (images, PDFs) are **not encrypted** — only `.md` content.
- Avoid editing the same encrypted file on multiple devices simultaneously to prevent sync conflicts.
- "View Encrypted File" is temporary (auto re-encrypts on navigate away). "Fully Decrypt File" is permanent.

## Development

```bash
git clone https://github.com/jsfbest/vault-crypto.git
cd vault-crypto
npm install
npm run dev    # Watch mode
npm run build  # Production build
```

## License

[MIT](LICENSE)
