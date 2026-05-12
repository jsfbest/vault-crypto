import { App, FuzzyMatch, FuzzySuggestModal, TFolder } from "obsidian";

export class FuzzyFolderSuggest extends FuzzySuggestModal<string> {
	private folders: string[];
	private defaultFolder: string;
	private resolve: (folder: TFolder | null) => void;
	private allFolders: TFolder[];

	constructor(
		app: App,
		allFolders: TFolder[],
		defaultFolder: TFolder | null,
		resolve: (folder: TFolder | null) => void,
	) {
		super(app);
		this.allFolders = allFolders;
		this.resolve = resolve;
		this.defaultFolder = defaultFolder?.path ?? "/";
		this.folders = allFolders.map((f) => f.path);
		this.setPlaceholder("选择导出文件夹…");
		this.setTitle("导出加密HTML");

		this.onClose = () => {
			this.resolve(null);
		};
	}

	getItems(): string[] {
		return this.folders;
	}

	getItemText(item: string): string {
		return item === "/" ? "/ (根目录)" : item;
	}

	selectSuggestion(value: FuzzyMatch<string>, evt: MouseEvent | KeyboardEvent): void {
		const folder = this.allFolders.find((f) => f.path === value.item) ?? null;
		this.resolve(folder);
		this.close();
	}

	onChooseItem(item: string, _evt: MouseEvent | KeyboardEvent): void {
		const folder = this.allFolders.find((f) => f.path === item) ?? null;
		this.resolve(folder);
	}
}
