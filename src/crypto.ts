/**
 * crypto.ts — AES-256-GCM encryption core using Web Crypto API
 *
 * Design decisions:
 * - Web Crypto API only (no Node crypto) → works on desktop + mobile
 * - AES-256-GCM for authenticated encryption (integrity + confidentiality)
 * - PBKDF2-SHA512 with 1,000,000 iterations for key derivation
 * - Per-file random salt (128-bit) + IV (96-bit)
 * - Encrypted file format: base64(JSON{salt, iv, ciphertext}) with magic header
 */

const MAGIC_HEADER = "-----VAULT-CRYPTO-----";
const PBKDF2_ITERATIONS = 1_000_000;
const SALT_LENGTH = 16;   // 128-bit
const IV_LENGTH = 12;     // 96-bit for GCM
const KEY_LENGTH = 256;   // AES-256

interface EncryptedPayload {
	salt: string;      // base64
	iv: string;        // base64
	ciphertext: string; // base64
}

// ---------- Key derivation ----------

async function deriveKey(
	password: string,
	salt: Uint8Array,
): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		encoder.encode(password),
		"PBKDF2",
		false,
		["deriveKey"],
	);

	return crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			salt: salt as BufferSource,
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-512",
		},
		keyMaterial,
		{ name: "AES-GCM", length: KEY_LENGTH },
		false,
		["encrypt", "decrypt"],
	);
}

// ---------- Helpers ----------

function uint8ToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]!);
	}
	return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

// ---------- Public API ----------

/**
 * Encrypt plaintext string with a password.
 * Returns a string with magic header + base64(JSON{salt, iv, ciphertext}).
 */
export async function encrypt(
	plaintext: string,
	password: string,
): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const key = await deriveKey(password, salt);

	const encoder = new TextEncoder();
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		encoder.encode(plaintext),
	);

	const payload: EncryptedPayload = {
		salt: uint8ToBase64(salt),
		iv: uint8ToBase64(iv),
		ciphertext: uint8ToBase64(new Uint8Array(ciphertext)),
	};

	return MAGIC_HEADER + "\n" + btoa(JSON.stringify(payload));
}

/**
 * Decrypt an encrypted string back to plaintext.
 * Throws on wrong password or tampered data (GCM auth check).
 */
export async function decrypt(
	encryptedContent: string,
	password: string,
): Promise<string> {
	if (!encryptedContent.startsWith(MAGIC_HEADER)) {
		throw new Error("Not a Vault Crypto encrypted file");
	}

	const payloadB64 = encryptedContent.slice(MAGIC_HEADER.length).trim();
	const payload: EncryptedPayload = JSON.parse(atob(payloadB64));

	const salt = base64ToUint8(payload.salt);
	const iv = base64ToUint8(payload.iv);
	const ciphertext = base64ToUint8(payload.ciphertext);
	const key = await deriveKey(password, salt);

	const decrypted = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: iv as BufferSource },
		key,
		ciphertext as BufferSource,
	);

	const decoder = new TextDecoder();
	return decoder.decode(decrypted);
}

/**
 * Quick check whether content looks like a Vault Crypto encrypted file.
 */
export function isEncrypted(content: string): boolean {
	return content.startsWith(MAGIC_HEADER);
}

/**
 * Hash a password with SHA-256 for verification (not for encryption).
 * Used to check if the user-entered password matches the stored hint.
 */
export async function hashPassword(password: string): Promise<string> {
	const encoder = new TextEncoder();
	const hash = await crypto.subtle.digest("SHA-256", encoder.encode(password));
	return uint8ToBase64(new Uint8Array(hash));
}
