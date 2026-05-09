import { App, Notice, TFile, TFolder, Vault } from "obsidian";
import { encrypt, decrypt, isEncrypted, hashPassword } from "./crypto";

export interface LockState {
	lockedFiles: Record<string, string>;
	lockedFolders: string[];
}

export class LockManager {
	private app: App;
	private lockedFiles: Map<string, string> = new Map();
	private lockedFolders: Set<string> = new Set();

	constructor(app: App) {
		this.app = app;
	}

	loadState(state: LockState): void {
		this.lockedFiles = new Map(Object.entries(state.lockedFiles));
		this.lockedFolders = new Set(state.lockedFolders);
	}

	saveState(): LockState {
		return {
			lockedFiles: Object.fromEntries(this.lockedFiles),
			lockedFolders: Array.from(this.lockedFolders),
		};
	}

	isFileLocked(filePath: string): boolean {
		if (this.lockedFiles.has(filePath)) {
			return true;
		}
		for (const folder of this.lockedFolders) {
			if (filePath.startsWith(folder + "/")) {
				return true;
			}
		}
		return false;
	}

	isFolderLocked(folderPath: string): boolean {
		return this.lockedFolders.has(folderPath);
	}

	async lockFile(
		file: TFile,
		password: string,
	): Promise<"encrypted" | "skipped"> {
		const content = await this.app.vault.read(file);

		if (isEncrypted(content)) {
			return "skipped";
		}

		const encrypted = await encrypt(content, password);
		const passwordHash = await hashPassword(password);

		await this.app.vault.modify(file, encrypted);

		this.lockedFiles.set(file.path, passwordHash);
		return "encrypted";
	}

	async unlockFile(
		file: TFile,
		password: string,
	): Promise<boolean> {
		const content = await this.app.vault.read(file);

		if (!isEncrypted(content)) {
			this.lockedFiles.delete(file.path);
			return true;
		}

		try {
			const decrypted = await decrypt(content, password);
			await this.app.vault.modify(file, decrypted);
			this.lockedFiles.delete(file.path);
			return true;
		} catch {
			return false;
		}
	}

	async lockFolder(
		folder: TFolder,
		password: string,
	): Promise<{ success: number; skipped: number; failed: number }> {
		let success = 0;
		let skipped = 0;
		let failed = 0;

		const files = this.getMarkdownFiles(folder);
		for (const file of files) {
			try {
				const result = await this.lockFile(file, password);
				if (result === "encrypted") {
					success++;
				} else {
					skipped++;
				}
			} catch {
				failed++;
			}
		}

		if (success > 0) {
			this.lockedFolders.add(folder.path);
		}

		return { success, skipped, failed };
	}

	async unlockFolder(
		folder: TFolder,
		password: string,
	): Promise<{ success: number; failed: number }> {
		let success = 0;
		let failed = 0;

		const files = this.getMarkdownFiles(folder);
		for (const file of files) {
			try {
				const result = await this.unlockFile(file, password);
				if (result) {
					success++;
				} else {
					failed++;
				}
			} catch {
				failed++;
			}
		}

		if (failed === 0) {
			this.lockedFolders.delete(folder.path);
		}

		return { success, failed };
	}

	getLockedFileCount(): number {
		return this.lockedFiles.size;
	}

	getLockedFolderCount(): number {
		return this.lockedFolders.size;
	}

	private getMarkdownFiles(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		Vault.recurseChildren(folder, (child) => {
			if (child instanceof TFile && child.extension === "md") {
				files.push(child);
			}
		});
		return files;
	}
}
