import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type VaultCryptoPlugin from "./main";

export interface VaultCryptoSettings {
	autoLockMinutes: number;
	confirmOnEncrypt: boolean;
}

export const DEFAULT_SETTINGS: VaultCryptoSettings = {
	autoLockMinutes: 1,
	confirmOnEncrypt: true,
};

export class VaultCryptoSettingTab extends PluginSettingTab {
	plugin: VaultCryptoPlugin;

	constructor(app: App, plugin: VaultCryptoPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Vault Crypto 设置" });

		new Setting(containerEl)
			.setName("自动锁定时间")
			.setDesc("无操作后自动重新加密的分钟数（0 表示不自动锁定）")
			.addSlider((slider) =>
				slider
					.setLimits(0, 60, 1)
					.setValue(this.plugin.settings.autoLockMinutes)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.autoLockMinutes = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("加密前确认")
			.setDesc("加密操作前弹出确认对话框")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.confirmOnEncrypt)
					.onChange(async (value) => {
						this.plugin.settings.confirmOnEncrypt = value;
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl("hr");
		containerEl.createEl("h3", { text: "加密信息" });

		const lockManager = this.plugin.lockManager;
		new Setting(containerEl)
			.setName("已加密文件数")
			.setDesc(`${lockManager.getLockedFileCount()} 个文件`)
			.setDisabled(true);

		new Setting(containerEl)
			.setName("已加密文件夹数")
			.setDesc(`${lockManager.getLockedFolderCount()} 个文件夹`)
			.setDisabled(true);

		containerEl.createEl("hr");
		containerEl.createEl("p", {
			cls: "vault-crypto-warning",
			text: "⚠️ 忘记密码将无法恢复加密内容，请务必牢记密码。建议定期备份 vault。",
		});
	}
}
