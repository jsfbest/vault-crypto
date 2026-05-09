import { App, Modal, Notice, Setting } from "obsidian";

export class PasswordModal extends Modal {
	private resolve: ((password: string) => void) | null = null;
	private reject: ((error: Error) => void) | null = null;
	private password = "";
	private confirmPassword = "";
	private readonly mode: "encrypt" | "decrypt";

	constructor(app: App, mode: "encrypt" | "decrypt") {
		super(app);
		this.mode = mode;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		this.setTitle(
			this.mode === "encrypt" ? "🔒 加密文件" : "🔓 解密文件",
		);

		if (this.mode === "encrypt") {
			new Setting(contentEl)
				.setName("密码")
				.addText((text) => {
					text.inputEl.type = "password";
					text.inputEl.placeholder = "输入加密密码";
					text.onChange((value) => {
						this.password = value;
					});
					text.inputEl.addEventListener("keydown", (e) => {
						if (e.key === "Enter") {
							const confirmInput = contentEl.querySelector(
								".confirmation-input",
							) as HTMLInputElement | null;
							confirmInput?.focus();
						}
					});
				});

			new Setting(contentEl)
				.setName("确认密码")
				.addText((text) => {
					text.inputEl.type = "password";
					text.inputEl.placeholder = "再次输入密码";
					text.inputEl.addClass("confirmation-input");
					text.onChange((value) => {
						this.confirmPassword = value;
					});
					text.inputEl.addEventListener("keydown", (e) => {
						if (e.key === "Enter") {
							this.submitEncrypt();
						}
					});
				});
		} else {
			new Setting(contentEl)
				.setName("密码")
				.addText((text) => {
					text.inputEl.type = "password";
					text.inputEl.placeholder = "输入解密密码";
					text.onChange((value) => {
						this.password = value;
					});
					text.inputEl.addEventListener("keydown", (e) => {
						if (e.key === "Enter") {
							this.submitDecrypt();
						}
					});
				});
		}

		new Setting(contentEl).addButton((btn) => {
			btn.setButtonText(this.mode === "encrypt" ? "加密" : "解密")
				.setCta()
				.onClick(() => {
					if (this.mode === "encrypt") {
						this.submitEncrypt();
					} else {
						this.submitDecrypt();
					}
				});
		});
	}

	private submitted = false;

	private submitEncrypt(): void {
		if (this.password.length < 4) {
			new Notice("密码至少需要 4 个字符");
			return;
		}
		if (this.password !== this.confirmPassword) {
			new Notice("两次输入的密码不一致");
			return;
		}
		this.submitted = true;
		const resolveFn = this.resolve;
		this.resolve = null;
		resolveFn?.(this.password);
		this.close();
	}

	private submitDecrypt(): void {
		if (this.password.length === 0) {
			new Notice("请输入密码");
			return;
		}
		this.submitted = true;
		const resolveFn = this.resolve;
		this.resolve = null;
		resolveFn?.(this.password);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.submitted) {
			this.resolve?.("");
		}
		this.resolve = null;
	}

	waitForPassword(): Promise<string> {
		return new Promise((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
			this.open();
		});
	}
}
