import {
	App,
	FileSystemAdapter,
	MarkdownView,
	Menu,
	Modal,
	Notice,
	Plugin,
	TFile,
	TFolder,
	Vault,
	WorkspaceLeaf,
} from "obsidian";
import { isEncrypted, encrypt, decrypt } from "./crypto";
import { generateDecryptHtml } from "./decryptHtml";
import { LockManager } from "./LockManager";
import { Logger } from "./Logger";
import {
	DEFAULT_SETTINGS,
	VaultCryptoSettingTab,
	type VaultCryptoSettings,
} from "./SettingsTab";
import { LockOverlay } from "./ui/LockOverlay";
import { PasswordModal } from "./ui/PasswordModal";
import { FuzzyFolderSuggest } from "./ui/FuzzyFolderSuggest";

export default class VaultCryptoPlugin extends Plugin {
	settings: VaultCryptoSettings = DEFAULT_SETTINGS;
	lockManager: LockManager = new LockManager(this.app);
	logger: Logger = new Logger(this.app);
	private overlays: Map<string, LockOverlay> = new Map();
	private isProcessing: Set<string> = new Set();
	private knownEncryptedPaths: Set<string> = new Set();
	private tempUnlockedPaths: Map<string, string> = new Map();
	private pendingReEncrypt: Set<string> = new Set();
	private reEncryptTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
	private autoLockTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
	private lastActivityTime: Map<string, number> = new Map();
	private activityDomListeners: Map<string, Set<HTMLElement>> = new Map();

	async onload(): Promise<void> {
		await this.logger.init();
		this.logger.info("Plugin loading");

		await this.loadSettings();

		this.addSettingTab(new VaultCryptoSettingTab(this.app, this));

		this.registerCommands();
		this.registerContextMenus();
		this.registerEventHandlers();

		this.logger.info("Plugin loaded", { lockedFiles: this.lockManager.getLockedFileCount(), lockedFolders: this.lockManager.getLockedFolderCount() });
	}

	async onunload(): Promise<void> {
		this.logger.info("Plugin unloading");

		for (const timer of this.reEncryptTimers.values()) {
			clearTimeout(timer);
		}
		this.reEncryptTimers.clear();

		for (const timer of this.autoLockTimers.values()) {
			clearTimeout(timer);
		}
		this.autoLockTimers.clear();
		this.cleanupActivityListeners();

		for (const [filePath] of this.tempUnlockedPaths) {
			await this.reEncryptTempUnlocked(filePath);
		}

		for (const overlay of this.overlays.values()) {
			overlay.detach();
		}
		this.overlays.clear();
		await this.logger.shutdown();
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);

		if (data?.lockState) {
			this.lockManager.loadState(data.lockState);
		}

		if (data?.encryptedPaths && Array.isArray(data.encryptedPaths)) {
			this.knownEncryptedPaths = new Set(data.encryptedPaths as string[]);
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData({
			settings: this.settings,
			lockState: this.lockManager.saveState(),
			encryptedPaths: Array.from(this.knownEncryptedPaths),
		});
	}

	private registerCommands(): void {
		this.addCommand({
			id: "encrypt-file",
			name: "加密当前文件",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (this.knownEncryptedPaths.has(file.path)) return false;
				if (checking) return true;

				this.encryptFile(file).catch((err) => {
					this.logger.error("encrypt-file command failed", { error: String(err) });
					new Notice("加密失败：" + String(err));
				});
				return true;
			},
		});

		this.addCommand({
			id: "view-encrypted-file",
			name: "查看加密当前文件",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!this.knownEncryptedPaths.has(file.path)) return false;
				if (this.tempUnlockedPaths.has(file.path)) return false;
				if (checking) return true;

				this.viewEncryptedFile(file).catch((err) => {
					this.logger.error("view-encrypted-file command failed", { error: String(err) });
					new Notice("查看失败：" + String(err));
				});
				return true;
			},
		});

		this.addCommand({
			id: "decrypt-file",
			name: "完全解密当前文件",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!this.knownEncryptedPaths.has(file.path)) return false;
				if (checking) return true;

				this.decryptFile(file).catch((err) => {
					this.logger.error("decrypt-file command failed", { error: String(err) });
					new Notice("解密失败：" + String(err));
				});
				return true;
			},
		});

		this.addCommand({
			id: "encrypt-folder",
			name: "加密当前文件所在文件夹",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				const parent = file.parent;
				if (!parent || parent.isRoot()) return false;
				if (checking) return true;

				this.encryptFolder(parent).catch((err) => {
					this.logger.error("encrypt-folder command failed", { error: String(err) });
					new Notice("加密失败：" + String(err));
				});
				return true;
			},
		});

		this.addCommand({
			id: "decrypt-folder",
			name: "完全解密当前文件所在文件夹",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				const parent = file.parent;
				if (!parent || parent.isRoot()) return false;
				if (checking) return true;

				this.decryptFolder(parent).catch((err) => {
					this.logger.error("decrypt-folder command failed", { error: String(err) });
					new Notice("解密失败：" + String(err));
				});
				return true;
			},
		});

		this.addCommand({
			id: "export-decrypt-tool",
			name: "导出加密HTML",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!this.knownEncryptedPaths.has(file.path)) return false;
				if (checking) return true;

				this.exportDecryptTool(file).catch((err) => {
					this.logger.error("export-decrypt-tool command failed", { error: String(err) });
					new Notice("导出失败：" + String(err));
				});
				return true;
			},
		});
	}

	private registerContextMenus(): void {
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TFile | TFolder) => {
				if (file instanceof TFile && file.extension === "md") {
					if (this.knownEncryptedPaths.has(file.path)) {
						menu.addItem((item) => {
							item
								.setTitle("查看加密文件")
								.onClick(() => {
									this.viewEncryptedFile(file).catch((err) => {
										this.logger.error("View menu click failed", { error: String(err) });
									});
								});
						});

						menu.addItem((item) => {
							item
								.setTitle("完全解密文件")
								.onClick(() => {
									this.decryptFile(file).catch((err) => {
										this.logger.error("Decrypt menu click failed", { error: String(err) });
									});
								});
						});

						menu.addItem((item) => {
							item
								.setTitle("导出加密HTML")
								.onClick(() => {
									this.exportDecryptTool(file).catch((err) => {
										this.logger.error("Export decrypt tool menu click failed", { error: String(err) });
									});
								});
						});
					} else {
						menu.addItem((item) => {
							item
								.setTitle("加密文件")
								.onClick(() => {
									this.encryptFile(file).catch((err) => {
										this.logger.error("Encrypt menu click failed", { error: String(err) });
									});
								});
						});
					}
				}

				if (file instanceof TFolder) {
					menu.addItem((item) => {
						item
							.setTitle("加密文件夹")
							.onClick(() => {
								this.encryptFolder(file).catch((err) => {
									this.logger.error("Encrypt folder menu click failed", { error: String(err) });
								});
							});
					});

					menu.addItem((item) => {
						item
							.setTitle("完全解密文件夹")
							.onClick(() => {
								this.decryptFolder(file).catch((err) => {
									this.logger.error("Decrypt folder menu click failed", { error: String(err) });
								});
							});
					});
				}
			}),
		);

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu: Menu) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view || !view.file) return;

				if (this.knownEncryptedPaths.has(view.file.path) && !this.tempUnlockedPaths.has(view.file.path)) {
					menu.addItem((item) => {
						item
							.setTitle("查看加密文件")
							.onClick(() => {
								this.viewEncryptedFile(view.file!).catch((err) => {
									this.logger.error("Editor view menu click failed", { error: String(err) });
								});
							});
					});
				}
			}),
		);
	}

	private registerEventHandlers(): void {
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf: WorkspaceLeaf | null) => {
				if (!leaf) return;
				this.handleActiveLeafChange(leaf);
			}),
		);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.handleFileModify(file);
				}
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (file instanceof TFile) {
					this.knownEncryptedPaths.delete(file.path);
					this.tempUnlockedPaths.delete(file.path);
				}
			}),
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (file instanceof TFile) {
					if (this.knownEncryptedPaths.has(oldPath)) {
						this.knownEncryptedPaths.delete(oldPath);
						this.knownEncryptedPaths.add(file.path);
					}
					const tempPw = this.tempUnlockedPaths.get(oldPath);
					if (tempPw) {
						this.tempUnlockedPaths.delete(oldPath);
						this.tempUnlockedPaths.set(file.path, tempPw);
					}
				}
			}),
		);
	}

	private handleActiveLeafChange(leaf: WorkspaceLeaf): void {
		this.cleanupStaleOverlays();

		const currentPath = (leaf.view instanceof MarkdownView) ? leaf.view.file?.path : null;

		for (const [filePath] of [...this.tempUnlockedPaths]) {
			if (filePath !== currentPath && !this.pendingReEncrypt.has(filePath)) {
				this.clearAutoLockTimer(filePath);
				this.unregisterActivityListeners(filePath);

				this.pendingReEncrypt.add(filePath);

				const existingTimer = this.reEncryptTimers.get(filePath);
				if (existingTimer) clearTimeout(existingTimer);

				this.reEncryptTimers.set(filePath, setTimeout(() => {
					this.reEncryptTimers.delete(filePath);
					this.reEncryptTempUnlocked(filePath).finally(() => {
						this.pendingReEncrypt.delete(filePath);
					});
				}, 200));
			}
		}



		if (!(leaf.view instanceof MarkdownView)) return;

		const file = leaf.view.file;
		if (!file) {
			this.removeAllOverlaysFromLeaf(leaf);
			return;
		}

		if (this.knownEncryptedPaths.has(file.path) && !this.tempUnlockedPaths.has(file.path) && !this.pendingReEncrypt.has(file.path)) {
			this.removeAllOverlaysFromLeaf(leaf);
			this.showLockOverlay(leaf, file);
			return;
		}

		if (this.tempUnlockedPaths.has(file.path) || this.pendingReEncrypt.has(file.path)) {
			this.removeAllOverlaysFromLeaf(leaf);

			const pendingTimer = this.reEncryptTimers.get(file.path);
			if (pendingTimer) {
				clearTimeout(pendingTimer);
				this.reEncryptTimers.delete(file.path);
				this.pendingReEncrypt.delete(file.path);
			}
			return;
		}

		this.removeAllOverlaysFromLeaf(leaf);

		const filePath = file.path;
		this.app.vault.cachedRead(file).then((content) => {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile?.path !== filePath) return;

			if (isEncrypted(content)) {
				this.knownEncryptedPaths.add(filePath);
				const activeLeaf = this.app.workspace.activeLeaf;
				if (activeLeaf) {
					this.showLockOverlay(activeLeaf, { path: filePath } as TFile);
				}
			}
		});
	}

	private removeAllOverlaysFromLeaf(leaf: WorkspaceLeaf): void {
		const container = leaf.view.containerEl.querySelector(".cm-scroller")?.parentElement;
		if (!container) return;

		const staleOverlays = container.querySelectorAll(".vault-crypto-lock-overlay");
		staleOverlays.forEach((el) => el.remove());

		const pathsToRemove: string[] = [];
		for (const [filePath, overlay] of this.overlays) {
			if (!overlay.isAttached()) {
				pathsToRemove.push(filePath);
			}
		}
		for (const p of pathsToRemove) {
			this.overlays.delete(p);
		}
	}

	private cleanupStaleOverlays(): void {
		for (const [filePath, overlay] of this.overlays) {
			if (!overlay.isAttached()) {
				this.overlays.delete(filePath);
			}
		}
	}

	private async handleFileModify(file: TFile): Promise<void> {
		if (this.isProcessing.has(file.path)) return;
		if (this.tempUnlockedPaths.has(file.path)) return;

		const content = await this.app.vault.cachedRead(file);
		if (isEncrypted(content)) {
			this.knownEncryptedPaths.add(file.path);
			const leaf = this.app.workspace.activeLeaf;
			if (leaf && leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) {
				this.showLockOverlay(leaf, file);
			}
		} else {
			this.knownEncryptedPaths.delete(file.path);
		}
	}

	private async viewEncryptedFile(file: TFile): Promise<void> {
		try {
			const content = await this.app.vault.read(file);
			if (!isEncrypted(content)) {
				new Notice("此文件未加密");
				return;
			}
		} catch (err) {
			this.logger.error("Failed to read file", { path: file.path, error: String(err) });
			new Notice("读取文件失败：" + (err instanceof Error ? err.message : String(err)));
			return;
		}

		const modal = new PasswordModal(this.app, "decrypt");
		const password = await modal.waitForPassword();
		if (!password) return;

		this.isProcessing.add(file.path);
		try {
			this.logger.info("Temp viewing file", { path: file.path });
			const content = await this.app.vault.read(file);
			const decrypted = await decrypt(content, password);
			await this.app.vault.modify(file, decrypted);
			this.tempUnlockedPaths.set(file.path, password);
			this.removeLockOverlay(file.path);

			this.registerActivityListeners(file.path);
			this.startAutoLockTimer(file.path);

			const minutes = this.settings.autoLockMinutes;
			const hint = minutes > 0
				? `文件已临时解锁，${minutes}分钟无操作后自动重新加密`
				: "文件已临时解锁，切换文件时将自动重新加密";
			new Notice(hint);
			this.logger.info("File temp unlocked", { path: file.path });
		} catch (err) {
			this.logger.error("Temp view failed", { path: file.path, error: err instanceof Error ? err.message : String(err) });
			new Notice("密码错误或解密失败");
		} finally {
			this.isProcessing.delete(file.path);
		}
	}

	private async reEncryptTempUnlocked(filePath: string): Promise<void> {
		const password = this.tempUnlockedPaths.get(filePath);
		if (!password) return;

		this.clearAutoLockTimer(filePath);
		this.unregisterActivityListeners(filePath);

		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			this.tempUnlockedPaths.delete(filePath);
			return;
		}

		try {
			const content = await this.app.vault.read(file);
			if (isEncrypted(content)) {
				this.tempUnlockedPaths.delete(filePath);
				this.knownEncryptedPaths.add(filePath);
				return;
			}

			this.isProcessing.add(filePath);
			const encryptedContent = await encrypt(content, password);
			await this.app.vault.modify(file, encryptedContent);
			this.tempUnlockedPaths.delete(filePath);
			this.knownEncryptedPaths.add(filePath);
			await this.saveSettings();
			this.logger.info("File re-encrypted", { path: filePath });
		} catch (err) {
			this.logger.error("Re-encrypt failed", { path: filePath, error: String(err) });
		} finally {
			this.isProcessing.delete(filePath);
		}
	}

	private async encryptFile(file: TFile): Promise<void> {
		try {
			const content = await this.app.vault.read(file);
			if (isEncrypted(content)) {
				new Notice("此文件已经是加密状态");
				return;
			}
		} catch (err) {
			this.logger.error("Failed to read file", { path: file.path, error: String(err) });
			new Notice("读取文件失败：" + (err instanceof Error ? err.message : String(err)));
			return;
		}

		const confirmed = await this.confirmEncrypt();
		if (!confirmed) return;

		const modal = new PasswordModal(this.app, "encrypt");
		const password = await modal.waitForPassword();
		if (!password) return;

		this.isProcessing.add(file.path);
		try {
			this.logger.info("Encrypting file", { path: file.path });
			const result = await this.lockManager.lockFile(file, password);
			if (result === "skipped") {
				new Notice("此文件已经是加密状态");
				return;
			}
			this.knownEncryptedPaths.add(file.path);
			await this.saveSettings();
			new Notice("文件已加密");
			this.logger.info("File encrypted", { path: file.path });

			const leaf = this.app.workspace.activeLeaf;
			if (leaf && leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) {
				this.showLockOverlay(leaf, file);
			}
		} catch (err) {
			this.logger.error("Encrypt failed", { path: file.path, error: err instanceof Error ? err.message : String(err) });
			new Notice("加密失败：" + (err instanceof Error ? err.message : String(err)));
		} finally {
			this.isProcessing.delete(file.path);
		}
	}

	private async decryptFile(file: TFile): Promise<void> {
		try {
			const content = await this.app.vault.read(file);
			if (!isEncrypted(content)) {
				new Notice("此文件未加密");
				return;
			}
		} catch (err) {
			this.logger.error("Failed to read file", { path: file.path, error: String(err) });
			new Notice("读取文件失败：" + (err instanceof Error ? err.message : String(err)));
			return;
		}

		const modal = new PasswordModal(this.app, "decrypt");
		const password = await modal.waitForPassword();
		if (!password) return;

		this.isProcessing.add(file.path);
		try {
			this.logger.info("Decrypting file", { path: file.path });
			const success = await this.lockManager.unlockFile(file, password);
			if (success) {
				this.knownEncryptedPaths.delete(file.path);
				await this.saveSettings();
				this.removeLockOverlay(file.path);
				new Notice("文件已解密");
				this.logger.info("File decrypted", { path: file.path });
			} else {
				this.logger.warn("Wrong password", { path: file.path });
				new Notice("密码错误，解密失败");
			}
		} catch (err) {
			this.logger.error("Decrypt failed", { path: file.path, error: err instanceof Error ? err.message : String(err) });
			new Notice("解密失败：" + (err instanceof Error ? err.message : String(err)));
		} finally {
			this.isProcessing.delete(file.path);
		}
	}

	private async exportDecryptTool(file: TFile): Promise<void> {
		try {
			const content = await this.app.vault.read(file);
			if (!isEncrypted(content)) {
				new Notice("此文件未加密");
				return;
			}

			const basename = file.basename;
			const html = generateDecryptHtml(content, basename);

			if (this.app.vault.adapter instanceof FileSystemAdapter) {
				const vaultBase = this.app.vault.adapter.getBasePath();
				const savePath = await this.showSystemSaveDialog(vaultBase, basename + "-decrypt.html");
				if (!savePath) return;

				const fs = require("fs/promises") as typeof import("fs/promises");
				await fs.writeFile(savePath, html, "utf-8");
				new Notice("已导出：" + savePath);
				this.logger.info("Exported decrypt tool (desktop)", { path: savePath });
			} else {
				const outputPath = file.parent
					? file.parent.path + "/" + basename + "-decrypt.html"
					: basename + "-decrypt.html";

				const existing = this.app.vault.getFileByPath(outputPath);
				if (existing) {
					await this.app.vault.modify(existing, html);
				} else {
					await this.app.vault.create(outputPath, html);
				}
				new Notice("已导出：" + outputPath);
				this.logger.info("Exported decrypt tool (mobile)", { path: outputPath });
			}
		} catch (err) {
			if (String(err).includes("User aborted") || String(err).includes("cancelled")) return;
			this.logger.error("Failed to export decrypt tool", { error: String(err) });
			new Notice("导出失败：" + (err instanceof Error ? err.message : String(err)));
		}
	}

	private async showSystemSaveDialog(defaultDir: string, defaultFilename: string): Promise<string | null> {
		const electron = (window as unknown as { require: (m: string) => unknown }).require("electron") as {
			remote?: { dialog: { showSaveDialog: (opts: Record<string, unknown>) => Promise<{ canceled: boolean; filePath?: string }> } };
			dialog?: { showSaveDialog: (opts: Record<string, unknown>) => Promise<{ canceled: boolean; filePath?: string }> };
		};
		const dialog = electron.remote?.dialog ?? electron.dialog;
		if (!dialog) return null;
		const result = await dialog.showSaveDialog({
			defaultPath: defaultDir + "/" + defaultFilename,
			filters: [{ name: "HTML", extensions: ["html"] }],
		});
		if (result.canceled) return null;
		return result.filePath ?? null;
	}

	private pickFolder(sourceFile: TFile): Promise<TFolder | null> {
		const folders: TFolder[] = [];
		this.app.vault.getAllLoadedFiles().forEach((f) => {
			if (f instanceof TFolder) folders.push(f);
		});

		return new Promise((resolve) => {
			const modal = new FuzzyFolderSuggest(this.app, folders, sourceFile.parent, resolve);
			modal.open();
		});
	}

	private async encryptFolder(folder: TFolder): Promise<void> {
		const confirmed = await this.confirmEncrypt();
		if (!confirmed) return;

		const modal = new PasswordModal(this.app, "encrypt");
		const password = await modal.waitForPassword();
		if (!password) return;

		try {
			this.logger.info("Encrypting folder", { path: folder.path });
			const result = await this.lockManager.lockFolder(folder, password);
			for (const file of this.getFolderMdFiles(folder)) {
				if (this.lockManager.isFileLocked(file.path)) {
					this.knownEncryptedPaths.add(file.path);
				}
			}
			await this.saveSettings();

			const parts: string[] = [`${result.success} 个已加密`];
			if (result.skipped > 0) parts.push(`${result.skipped} 个已加密跳过`);
			if (result.failed > 0) parts.push(`${result.failed} 个失败`);

			new Notice("文件夹加密完成：" + parts.join("，"));
			this.logger.info("Folder encrypted", { path: folder.path, success: result.success, skipped: result.skipped, failed: result.failed });

			this.refreshOverlays();
		} catch (err) {
			this.logger.error("Folder encrypt failed", { path: folder.path, error: err instanceof Error ? err.message : String(err) });
			new Notice("文件夹加密失败：" + (err instanceof Error ? err.message : String(err)));
		}
	}

	private async decryptFolder(folder: TFolder): Promise<void> {
		const modal = new PasswordModal(this.app, "decrypt");
		const password = await modal.waitForPassword();
		if (!password) return;

		try {
			this.logger.info("Decrypting folder", { path: folder.path });
			const result = await this.lockManager.unlockFolder(folder, password);

			for (const file of this.getFolderMdFiles(folder)) {
				if (!this.lockManager.isFileLocked(file.path)) {
					this.knownEncryptedPaths.delete(file.path);
				}
			}
			await this.saveSettings();

			if (result.failed > 0) {
				new Notice(
					`解密完成：${result.success} 个成功，${result.failed} 个失败（密码可能不正确）`,
				);
			} else {
				new Notice("已解密 " + result.success + " 个文件");
			}
			this.logger.info("Folder decrypted", { path: folder.path, success: result.success, failed: result.failed });

			this.refreshOverlays();
		} catch (err) {
			this.logger.error("Folder decrypt failed", { path: folder.path, error: err instanceof Error ? err.message : String(err) });
			new Notice("文件夹解密失败：" + (err instanceof Error ? err.message : String(err)));
		}
	}

	private showLockOverlay(leaf: WorkspaceLeaf, file: TFile): void {
		const existing = this.overlays.get(file.path);
		if (existing && existing.isAttached()) return;

		const overlay = new LockOverlay();
		this.overlays.set(file.path, overlay);
		overlay.attach(leaf);
	}

	private removeLockOverlay(filePath: string): void {
		const overlay = this.overlays.get(filePath);
		if (overlay) {
			overlay.detach();
			this.overlays.delete(filePath);
		}
	}

	private refreshOverlays(): void {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (!(leaf.view instanceof MarkdownView)) continue;
			const file = leaf.view.file;
			if (!file) continue;

			const filePath = file.path;
			const hasOverlay = this.overlays.has(filePath) && this.overlays.get(filePath)!.isAttached();

			if (this.knownEncryptedPaths.has(filePath) && !hasOverlay) {
				const overlay = new LockOverlay();
				this.overlays.set(filePath, overlay);
				overlay.attach(leaf);
			} else if (!this.knownEncryptedPaths.has(filePath) && hasOverlay) {
				this.removeLockOverlay(filePath);
			}
		}
	}

	private getFolderMdFiles(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		Vault.recurseChildren(folder, (child) => {
			if (child instanceof TFile && child.extension === "md") {
				files.push(child);
			}
		});
		return files;
	}

	private startAutoLockTimer(filePath: string): void {
		this.clearAutoLockTimer(filePath);

		const minutes = this.settings.autoLockMinutes;
		if (minutes <= 0) return;

		this.lastActivityTime.set(filePath, Date.now());

		const checkInterval = 10_000;
		const timer = setInterval(() => {
			const lastActivity = this.lastActivityTime.get(filePath);
			if (!lastActivity) {
				this.clearAutoLockTimer(filePath);
				return;
			}

			const elapsed = Date.now() - lastActivity;
			if (elapsed >= minutes * 60_000) {
				this.clearAutoLockTimer(filePath);
				this.logger.info("Auto-lock triggered", { path: filePath });
				this.reEncryptTempUnlocked(filePath).then(() => {
					new Notice("文件已自动重新加密");
				});
			}
		}, checkInterval);

		this.autoLockTimers.set(filePath, timer);
	}

	private clearAutoLockTimer(filePath: string): void {
		const timer = this.autoLockTimers.get(filePath);
		if (timer) {
			clearInterval(timer);
			this.autoLockTimers.delete(filePath);
		}
		this.lastActivityTime.delete(filePath);
	}

	private resetAutoLockTimer(filePath: string): void {
		if (!this.autoLockTimers.has(filePath)) return;
		this.lastActivityTime.set(filePath, Date.now());
	}

	private registerActivityListeners(filePath: string): void {
		this.unregisterActivityListeners(filePath);

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.file?.path !== filePath) return;

		const scroller = view.containerEl.querySelector(".cm-scroller") as HTMLElement | null;
		if (!scroller) return;

		const handlers = new Set<HTMLElement>();
		const resetFn = () => this.resetAutoLockTimer(filePath);

		const eventTypes = ["scroll", "click", "keydown", "mousemove"] as const;
		for (const eventType of eventTypes) {
			scroller.addEventListener(eventType, resetFn, { passive: true });
		}
		handlers.add(scroller);

		this.activityDomListeners.set(filePath, handlers);
	}

	private unregisterActivityListeners(filePath: string): void {
		const handlers = this.activityDomListeners.get(filePath);
		if (!handlers) return;

		const resetFn = () => this.resetAutoLockTimer(filePath);
		const eventTypes = ["scroll", "click", "keydown", "mousemove"] as const;

		for (const el of handlers) {
			for (const eventType of eventTypes) {
				el.removeEventListener(eventType, resetFn);
			}
		}

		this.activityDomListeners.delete(filePath);
	}

	private cleanupActivityListeners(): void {
		for (const filePath of this.activityDomListeners.keys()) {
			this.unregisterActivityListeners(filePath);
		}
	}

	private async confirmEncrypt(): Promise<boolean> {
		if (!this.settings.confirmOnEncrypt) return true;

		return new Promise((resolve) => {
			const app = this.app;
			let resolved = false;

			const modal = new Modal(app);
			modal.titleEl.setText("确认加密");
			modal.contentEl.createEl("p", { text: "加密后需要密码才能查看文件内容。确定要加密吗？" });
			modal.contentEl.createEl("p", { text: "⚠️ 忘记密码将无法恢复内容。", cls: "vault-crypto-warning" });

			const btnContainer = modal.contentEl.createDiv();
			btnContainer.style.display = "flex";
			btnContainer.style.gap = "8px";
			btnContainer.style.justifyContent = "flex-end";
			btnContainer.style.marginTop = "16px";

			btnContainer.createEl("button", { text: "取消" }).addEventListener("click", () => {
				resolved = true;
				resolve(false);
				modal.close();
			});

			const confirmBtn = btnContainer.createEl("button", { text: "确认加密", cls: "mod-cta" });
			confirmBtn.addEventListener("click", () => {
				resolved = true;
				resolve(true);
				modal.close();
			});

			const originalOnClose = modal.onClose.bind(modal);
			modal.onClose = () => {
				if (!resolved) resolve(false);
				originalOnClose();
			};

			modal.open();
		});
	}
}
