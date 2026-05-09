import { MarkdownView, WorkspaceLeaf } from "obsidian";

const OVERLAY_CLASS = "vault-crypto-lock-overlay";

export class LockOverlay {
	private overlayEl: HTMLElement | null = null;
	private currentLeaf: WorkspaceLeaf | null = null;

	attach(leaf: WorkspaceLeaf): void {
		this.detach();

		this.currentLeaf = leaf;

		const view = leaf.view;
		if (!(view instanceof MarkdownView)) {
			return;
		}

		const container = view.containerEl.querySelector(".cm-scroller");
		if (!container) {
			return;
		}

		const parent = container.parentElement;
		if (!parent) {
			return;
		}

		this.overlayEl = parent.createDiv({ cls: OVERLAY_CLASS });

		const inner = this.overlayEl.createDiv({ cls: "vault-crypto-lock-inner" });

		inner.createEl("div", {
			cls: "vault-crypto-lock-icon",
			text: "🔒",
		});

		inner.createEl("h2", {
			cls: "vault-crypto-lock-title",
			text: "此文件已加密",
		});

		inner.createEl("p", {
			cls: "vault-crypto-lock-desc",
			text: "右键点击编辑区或文件标签页，选择「查看加密文件」",
		});

		inner.createEl("p", {
			cls: "vault-crypto-lock-hint",
			text: "或使用命令面板搜索「查看加密当前文件」",
		});
	}

	detach(): void {
		if (this.overlayEl) {
			this.overlayEl.remove();
			this.overlayEl = null;
		}
		this.currentLeaf = null;
	}

	isAttached(): boolean {
		return this.overlayEl !== null && this.overlayEl.isConnected;
	}
}
