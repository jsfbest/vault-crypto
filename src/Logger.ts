import { App, FileSystemAdapter } from "obsidian";

export type LogLevel = "debug" | "info" | "warn" | "error";

export class Logger {
	private app: App;
	private logFilePath = "";
	private buffer: string[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private enabled = false;
	private fs: { appendFile: typeof import("fs/promises")["appendFile"]; mkdir: typeof import("fs/promises")["mkdir"] } | null = null;

	constructor(app: App) {
		this.app = app;
	}

	async init(): Promise<void> {
		if (typeof window === "undefined" || typeof (window as any).require !== "function") {
			console.log("[VaultCrypto] Non-Electron environment, file logging disabled");
			this.enabled = false;
			return;
		}

		try {
			const adapter = this.app.vault.adapter;
			if (!(adapter instanceof FileSystemAdapter)) {
				this.enabled = false;
				return;
			}

			const nodePath = (window as any).require("path") as typeof import("path");
			const nodeFs = (window as any).require("fs/promises") as typeof import("fs/promises");
			this.fs = { appendFile: nodeFs.appendFile.bind(nodeFs), mkdir: nodeFs.mkdir.bind(nodeFs) };
			this.logFilePath = nodePath.join(
				adapter.getBasePath(),
				".obsidian",
				"plugins",
				"obsidian-vault-crypto",
				"vault-crypto.log",
			);

			await this.fs.mkdir(nodePath.dirname(this.logFilePath), { recursive: true });
			const header = `=== Vault Crypto Session ${new Date().toISOString()} ===\n`;
			await this.fs.appendFile(this.logFilePath, header, "utf8");
			this.enabled = true;
			console.log("[VaultCrypto] File logging enabled:", this.logFilePath);
		} catch (err) {
			console.error("[VaultCrypto] Logger init failed:", err);
			this.enabled = false;
		}
	}

	debug(msg: string, data?: unknown): void {
		this.log("debug", msg, data);
	}

	info(msg: string, data?: unknown): void {
		this.log("info", msg, data);
	}

	warn(msg: string, data?: unknown): void {
		this.log("warn", msg, data);
	}

	error(msg: string, data?: unknown): void {
		this.log("error", msg, data);
	}

	private log(level: LogLevel, msg: string, data?: unknown): void {
		const ts = new Date().toISOString().slice(11, 19);
		const prefix = `[${ts}][${level.toUpperCase()}]`;
		const entry = data !== undefined
			? `${prefix} ${msg} ${typeof data === "object" ? JSON.stringify(data) : String(data)}`
			: `${prefix} ${msg}`;

		if (level === "error") {
			console.error("[VaultCrypto]", entry);
		} else if (level === "warn") {
			console.warn("[VaultCrypto]", entry);
		} else {
			console.log("[VaultCrypto]", entry);
		}

		this.buffer.push(entry);
		this.scheduleFlush();
	}

	private scheduleFlush(): void {
		if (this.flushTimer) return;
		this.flushTimer = setTimeout(() => {
			this.flush();
			this.flushTimer = null;
		}, 500);
	}

	private async flush(): Promise<void> {
		if (!this.enabled || !this.fs || this.buffer.length === 0) return;

		const batch = this.buffer.join("\n") + "\n";
		this.buffer = [];

		try {
			await this.fs.appendFile(this.logFilePath, batch, "utf8");
		} catch (err) {
			console.error("[VaultCrypto] Log write failed:", err);
			this.enabled = false;
		}
	}

	async shutdown(): Promise<void> {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		await this.flush();
	}
}
