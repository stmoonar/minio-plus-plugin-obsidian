import { App, Editor, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { Client } from "minio-es";
import { t } from "./i18n";
import { MinioGalleryView, GALLERY_VIEW_TYPE } from "./views/MinioGalleryView";
import { MinioPluginSettings, DEFAULT_SETTINGS } from "./types/settings";
import { SettingsManager } from "./settings/SettingsManager";
import { FileProcessor } from "./services/FileProcessor";
import { UploadService, UploadProgress } from "./services/UploadService";
import { handleUploadError } from "./utils/ErrorHandler";

interface Position {
	line: number;
	ch: number;
}

export default class MinioPlusPlugin extends Plugin {
	settings: MinioPluginSettings;
	minioClient: Client;

	// 服务
	private fileProcessor: FileProcessor;
	private uploadService: UploadService;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addSettingTab(new SettingsManager(this.app, this));
		this.addCommands();

		if (this.validateSettings()) {
			this.initializeMinioClient();
			this.initializeServices();
			this.registerEvents();
			this.setupView();
		}
	}

	private initializeServices(): void {
		this.fileProcessor = new FileProcessor(this.settings);
		this.uploadService = new UploadService(this.minioClient, this.settings);
	}

	private addCommands(): void {
		this.addCommand({
			id: "minio-uploader",
			name: t("File upload"),
			icon: "upload-cloud",
			editorCallback: (editor: Editor) => {
				if (!this.validateSettings()) {
					new Notice(t("Please configure Minio settings first"));
					return;
				}
				this.triggerFileUpload(editor);
			},
		});

		this.addCommand({
			id: "open-minio-gallery",
			name: t("Open Minio gallery"),
			icon: "image-file",
			callback: () => this.openGalleryView(),
		});
	}

	private initializeMinioClient(): void {
		this.minioClient = new Client({
			endPoint: this.settings.endpoint,
			port: this.settings.port,
			useSSL: this.settings.useSSL,
			region: this.settings.region,
			accessKey: this.settings.accessKey,
			secretKey: this.settings.secretKey,
		});

		this.uploadService?.updateSettings(this.settings);
	}

	private registerEvents(): void {
		this.registerEvent(
			this.app.workspace.on(
				"editor-paste",
				this.handleUploader.bind(this)
			)
		);
		this.registerEvent(
			this.app.workspace.on("editor-drop", this.handleUploader.bind(this))
		);
	}

	private setupView(): void {
		this.registerView(
			GALLERY_VIEW_TYPE,
			(leaf) =>
				new MinioGalleryView(leaf, this.minioClient, this.settings)
		);

		this.addRibbonIcon("image-file", t("Minio gallery"), () => {
			this.openGalleryView();
		});
	}

	async openGalleryView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const currentView = workspace.getActiveViewOfType(MinioGalleryView);

		if (currentView) {
			leaf = currentView.leaf;
		}

		if (!leaf) {
			leaf = workspace.getLeftLeaf(false);
			if (!leaf) return;

			await leaf.setViewState({
				type: GALLERY_VIEW_TYPE,
				active: true,
			});
		}

		workspace.revealLeaf(leaf);
	}

	private triggerFileUpload(editor: Editor): void {
		const input = document.createElement("input");
		input.setAttribute("type", "file");
		input.setAttribute(
			"accept",
			"image/*,video/*,.doc,.docx,.pdf,.pptx,.xlsx,.xls"
		);

		input.onchange = async (event: Event) => {
			const file = (event.target as HTMLInputElement)?.files?.[0];
			if (file) {
				await this.handleUploader(
					new ClipboardEvent("paste", {
						clipboardData: new DataTransfer(),
					}),
					editor
				);
			}
		};

		input.click();
	}

	async handleUploader(
		evt: ClipboardEvent | DragEvent,
		editor: Editor
	): Promise<void> {
		if (evt.defaultPrevented) return;

		const file = this.extractFileFromEvent(evt);
		if (!file || !this.fileProcessor.getFileType(file)) return;

		evt.preventDefault();

		const cursor = editor.getCursor();
		const startPos: Position = { line: cursor.line, ch: cursor.ch };
		let previewText = await this.showUploadPreview(editor, startPos, file);

		try {
			const objectName = this.fileProcessor.generateObjectName(file);
			const fileType = this.fileProcessor.getFileType(file);

			await this.uploadService.uploadFile(
				file,
				objectName,
				(progress: UploadProgress) => {
					previewText = this.updateUploadProgress(
						editor,
						startPos,
						previewText,
						progress.percentage
					);
				}
			);

			const url = this.uploadService.generateAccessUrl(objectName);

			setTimeout(() => {
				const finalText = this.fileProcessor.wrapFileDependingOnType(
					fileType,
					url,
					file.name
				);
				// 获取当前预览文本的实际范围
				const endPos = editor.offsetToPos(
					editor.posToOffset(startPos) + previewText.length
				);
				editor.replaceRange(finalText, startPos, endPos);
				// 将光标移动到插入内容的下一行
				const newCursorPos = editor.offsetToPos(
					editor.posToOffset(startPos) + finalText.length
				);
				editor.setCursor(newCursorPos);
			}, 200);
		} catch (error) {
			handleUploadError(error, file.name);
			// 获取预览文本的实际范围并删除
			const endPos = editor.offsetToPos(
				editor.posToOffset(startPos) + previewText.length
			);
			editor.replaceRange("", startPos, endPos);
			editor.setCursor(startPos);
			new Notice(t("Upload failed"));
		}
	}

	private extractFileFromEvent(evt: ClipboardEvent | DragEvent): File | null {
		switch (evt.type) {
			case "paste":
				return (evt as ClipboardEvent).clipboardData?.files[0] || null;
			case "drop":
				return (evt as DragEvent).dataTransfer?.files[0] || null;
			default:
				return null;
		}
	}

	private async showUploadPreview(
		editor: Editor,
		startPos: Position,
		file: File
	): Promise<string> {
		const fileType = this.fileProcessor.getFileType(file);
		let previewText = `<div class="upload-preview-container uploading"><div class="upload-progress"><div class="upload-progress-bar" style="width: 0%"></div></div></div>\n`;

		if (fileType === "image") {
			const reader = new FileReader();

			const imgPreview = await new Promise<string>((resolve) => {
				reader.onload = (e) => {
					const imgSrc = e.target?.result as string;
					const newText = `<div class="upload-preview-container uploading"><img src="${imgSrc}"><div class="upload-progress"><div class="upload-progress-bar" style="width: 0%"></div></div></div>\n`;
					resolve(newText);
				};
				reader.readAsDataURL(file);
			});

			previewText = imgPreview;
		}

		editor.replaceRange(previewText, startPos);
		// 设置光标到预览文本的末尾（下一行开始）
		editor.setCursor({ line: startPos.line + 1, ch: 0 });

		return previewText;
	}

	private updateUploadProgress(
		editor: Editor,
		startPos: Position,
		currentText: string,
		percentage: number
	): string {
		const progressText = currentText.replace(
			/width: \d+%/,
			`width: ${percentage}%`
		);
		const endPos = editor.offsetToPos(
			editor.posToOffset(startPos) + currentText.length
		);
		editor.replaceRange(progressText, startPos, endPos);

		if (percentage === 100) {
			const completedText = progressText.replace(
				"uploading",
				"completed"
			);
			const completedEndPos = editor.offsetToPos(
				editor.posToOffset(startPos) + progressText.length
			);
			editor.replaceRange(completedText, startPos, completedEndPos);
			return completedText;
		}

		return progressText;
	}

	validateSettings(): boolean {
		return (
			this.uploadService?.validateUploadConfig().valid ??
			!!(
				this.settings.accessKey &&
				this.settings.secretKey &&
				this.settings.endpoint &&
				this.settings.bucket
			)
		);
	}

	onunload(): void {
		// 清理资源
	}

	async loadSettings(): Promise<void> {
		const existingData = await this.loadData();

		if (!existingData) {
			await this.saveData(DEFAULT_SETTINGS);
			this.settings = { ...DEFAULT_SETTINGS };
		} else {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, existingData);
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);

		this.fileProcessor?.updateSettings(this.settings);
		this.uploadService?.updateSettings(this.settings);

		if (this.minioClient && this.validateSettings()) {
			this.initializeMinioClient();
		}
	}
}
