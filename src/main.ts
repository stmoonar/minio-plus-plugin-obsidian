import { App, Editor, EditorPosition, Notice, Plugin, PluginSettingTab, Setting, TextComponent, setIcon } from 'obsidian';
import { Client } from 'minio-es';
import { moment } from 'obsidian';
import mime from 'mime';
import { t } from './i18n';
import { MinioGalleryView, GALLERY_VIEW_TYPE } from './views/MinioGalleryView';

export interface MinioPluginSettings {
	accessKey: string;
	secretKey: string;
	region: string;
	bucket: string;
	basepath: string;
	endpoint: string;
	port: number;
	customDomain: string;
	useSSL: boolean;
	imgPreview: boolean;
	videoPreview: boolean;
	audioPreview: boolean;
	docsPreview: string;
	nameRule: string;
	pathRule: string;
}

const DEFAULT_SETTINGS: MinioPluginSettings = {
	accessKey: '',
	secretKey: '',
	region: '',
	endpoint: '',
	port: 9001,
	customDomain: '',
	bucket: '',
	basepath: '',
	useSSL: true,
	imgPreview: true,
	videoPreview: true,
	audioPreview: true,
	docsPreview: '',
	nameRule: 'local',
	pathRule: 'root',
}

export default class MinioPlusPlugin extends Plugin {
	settings: MinioPluginSettings;
	minioClient: Client;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new MinioSettingTab(this.app, this));

		this.addCommand({
			id: 'minio-uploader',
			name: t('File upload'),
			icon: 'upload-cloud',
			editorCallback: (editor: Editor) => {
				if (!this.validateSettings()) {
					new Notice(t('Please configure Minio settings first'));
					return;
				}
				const input = document.createElement('input');
				input.setAttribute('type', 'file');
				input.setAttribute('accept', 'image/*,video/*,.doc,.docx,.pdf,.pptx,.xlsx,.xls');
				input.onchange = async (event: Event) => {
					const file = (event.target as HTMLInputElement)?.files?.[0];
					if (file) {
						await this.handleUploader(
							new ClipboardEvent('paste', {
								clipboardData: new DataTransfer()
							}), 
							editor
						);
					}
				};
				input.click();
			}
		});

		if (this.validateSettings()) {
			this.minioClient = new Client({
				endPoint: this.settings.endpoint,
				port: this.settings.port,
				useSSL: this.settings.useSSL,
				region: this.settings.region,
				accessKey: this.settings.accessKey,
				secretKey: this.settings.secretKey
			});

			this.registerEvent(
				this.app.workspace.on("editor-paste", this.handleUploader.bind(this))
			);
			this.registerEvent(
				this.app.workspace.on("editor-drop", this.handleUploader.bind(this))
			);

			this.registerView(
				GALLERY_VIEW_TYPE,
				(leaf) => new MinioGalleryView(leaf, this.minioClient, this.settings)
			);

			this.addRibbonIcon('image-file', 'Minio gallery', () => {
				this.activateView();
			});
		}
	}

	private validateSettings(): boolean {
		const requiredSettings = [
			'accessKey',
			'secretKey',
			'endpoint',
			'bucket'
		] as const;

		type RequiredSetting = typeof requiredSettings[number];

		const missingSettings = requiredSettings.filter(
			(setting: RequiredSetting) => !this.settings[setting]
		);

		if (missingSettings.length > 0) {
			console.log('Missing required Minio settings:', missingSettings);
			return false;
		}

		return true;
	}

	async activateView() {
		const { workspace } = this.app;
		
		let leaf = workspace.getLeavesOfType(GALLERY_VIEW_TYPE)[0];
		
		if (!leaf) {
			// 如果视图不存在，创建一个新的
			const newLeaf = workspace.getLeftLeaf(false);
			if (!newLeaf) return;
			
			leaf = newLeaf;
			await leaf.setViewState({
				type: GALLERY_VIEW_TYPE,
				active: true,
			});
		}
		
		// 确保 leaf 存在后再调用
		workspace.revealLeaf(leaf);
	}

	getFileType(file: File) {
		const imageType = /image.*/;
		const videoType = /video.*/;
		const audioType = /audio.*/;
		const docType = /application\/(vnd.*|pdf)/;

		if (file?.type.match(videoType)) {
			return "video";
		} else if (file?.type.match(audioType)) {
			return "audio";
		} else if (file?.type.match(docType)) {
			return "doc";
		} else if (file?.type.match(imageType)) {
			return "image";
		} else {
			return ''
		}
	}

	async handleUploader(evt: ClipboardEvent | DragEvent, editor: Editor): Promise<void> {
		if (evt.defaultPrevented) {
			return;
		}
		let file: any = null;

		// figure out what kind of event we're handling
		switch (evt.type) {
			case "paste":
				file = (evt as ClipboardEvent).clipboardData?.files[0];
				break;
			case "drop":
				file = (evt as DragEvent).dataTransfer?.files[0];
		}

		if (!file || file && !this.getFileType(file)) return;

		evt.preventDefault();
		const { endpoint, port, useSSL, bucket } = this.settings;
		const host = `http${useSSL ? 's' : ''}://${endpoint}${port === 443 || port === 80 ? '' : ':' + port}`;

		// 保存当前光标位置
		const cursor = editor.getCursor();
		const startPos = { line: cursor.line, ch: cursor.ch };
		
		// 创建初始预览文本
		let replaceText = `<div class="upload-preview-container uploading"><div class="upload-progress"><div class="upload-progress-bar" style="width: 0%"></div></div></div>\n`;
		
		// 如果是图片，读取并显示预览
		if (this.getFileType(file) === 'image') {
			const reader = new FileReader();
			
			reader.onload = (e) => {
				const imgSrc = e.target?.result as string;
				const newText = `<div class="upload-preview-container uploading"><img src="${imgSrc}"><div class="upload-progress"><div class="upload-progress-bar" style="width: 0%"></div></div></div>\n`;
				editor.replaceRange(newText, startPos, {
					line: startPos.line,
					ch: startPos.ch + replaceText.length
				});
				replaceText = newText;
			};
			reader.readAsDataURL(file);
		}
		
		editor.replaceRange(replaceText, startPos);
		editor.setCursor({line: startPos.line + 1, ch: 0});

		try {
			const objectName = await this.minioUploader(file, (process) => {
				// 更新进度条
				const newText = replaceText.replace(/width: \d+%/, `width: ${process}%`);
				
				editor.replaceRange(newText, 
					startPos,
					{
						line: startPos.line,
						ch: startPos.ch + replaceText.length
					}
				);
				replaceText = newText;

				// 当上传完成时
				if (process === 100) {
					const completedText = replaceText.replace('uploading', 'completed');
					editor.replaceRange(completedText, 
						startPos,
						{
							line: startPos.line,
							ch: startPos.ch + replaceText.length
						}
					);
					replaceText = completedText;
				}
			});

			const baseUrl = `${host}/${bucket}/${objectName}`;
			const url = this.settings.customDomain 
				? `${this.settings.customDomain}/${bucket}/${objectName}`
				: baseUrl;
			
			// 延迟一下替换，让用户能看到100%的状态
			setTimeout(() => {
				editor.replaceRange(
					this.wrapFileDependingOnType(this.getFileType(file), url, file.name),
					startPos,
					{
						line: startPos.line,
						ch: startPos.ch + replaceText.length
					}
				);
			}, 200);
		} catch (error) {
			console.error('Upload failed:', error);
			editor.replaceRange('', 
				startPos,
				{
					line: startPos.line,
					ch: startPos.ch + replaceText.length
				}
			);
			new Notice(t('Upload failed'));
		}
	}

	genObjectName (file: File) {
		let objectName = ''
		switch (this.settings.pathRule) {
			case 'root':
				objectName = ''
				break;
			case 'type':
				objectName = `${this.getFileType(file)}/`
				break;
			case 'date':
				objectName = `${moment().format('YYYY/MM/DD')}/`
				break;
			case 'typeAndData':
				objectName = `${this.getFileType(file)}/${moment().format('YYYY/MM/DD')}/`
				break;
			default:
		}
		switch (this.settings.nameRule) {
			case 'local':
				objectName += file.name
				break;
			case 'time':
				objectName += moment().format('YYYYMMDDHHmmSS') + file.name.substring(file.name.lastIndexOf('.'))
				break;
			case 'timeAndLocal':
				objectName += moment().format('YYYYMMDDHHmmSS') + '_' + file.name
				break;
			default:
		}
		if (this.settings.basepath) {
			// remove the first '/' and the last '/' if it exists
			this.settings.basepath = this.settings.basepath.replace(/^\/|\/$/g, '')
			objectName = this.settings.basepath + '/' + objectName
		}
		return objectName
	}

	minioUploader(file: File, progress?: (count: number) => void): Promise<string> {
		return new Promise((resolve, reject) => {
			try {
				const objectName = this.genObjectName(file)
				this.minioClient.presignedPutObject(this.settings.bucket, objectName, 1 * 60 * 60).then(presignedUrl => {
					const xhr = new XMLHttpRequest();
					xhr.upload.addEventListener("progress", (progressEvent) => {
						if (progress) progress(Math.round((progressEvent.loaded / progressEvent.total) * 100))
					}, false)
					xhr.onreadystatechange = function () {
						if (xhr.readyState === 4) {
							if (xhr.status === 200) {
								resolve(objectName)
							} else {
								console.error('xhr', xhr)
								reject(xhr.status)
								new Notice('Error: upload failed.' + xhr.status);
							}
						}
					};
					xhr.open("PUT", presignedUrl, true);
					const contentType = file.type || mime.getType(objectName.substring(objectName.lastIndexOf('.'))) || 'application/octet-stream';
					xhr.setRequestHeader('Content-Type', contentType);
					xhr.send(file);
				}).catch(err => {
					reject(err)
					new Notice('Error: upload failed.' + err.message);
				})
			} catch (err) {
				new Notice('Error: ' + err.message);
			}
		})
	}

	// private replaceText(
	// 	editor: Editor,
	// 	target: string,
	// 	replacement: string
	// ): void {
	// 	target = target.trim();
	// 	const lines = editor.getValue().split("\n");
	// 	for (let i = 0; i < lines.length; i++) {
	// 		const ch = lines[i].indexOf(target);
	// 		if (ch !== -1) {
	// 			const from = { line: i, ch: ch } as EditorPosition;
	// 			const to = {
	// 				line: i,
	// 				ch: ch + target.length,
	// 			} as EditorPosition;
	// 			editor.setCursor(from);
	// 			editor.replaceRange(replacement, from, to);
	// 			to.ch = ch + replacement.length;
	// 			editor.setCursor(to);
	// 			break;
	// 		}
	// 	}
	// }

	wrapFileDependingOnType(type: string, url: string, name: string) {
		if (type === 'image') {
			return `${this.settings.imgPreview ? '!' : ''}[](${url})\n`
		} else if (type === 'video') {
			return `${this.settings.videoPreview ? `<video src="${url}" controls></video>` : `[${name}](${url})`}\n`;
		} else if (type === 'audio') {
			return `${this.settings.audioPreview ? `<audio src="${url}" controls></audio>` : `[${name}](${url})`}\n`;
		} else if (type === 'doc') {
			return `\n${this.settings.docsPreview ? `<iframe frameborder=0 border=0 width=100% height=800
			src="${this.settings.docsPreview}${url}">
		</iframe>` : `[${name}](${url})`}\n`
		} else {
			throw new Error('Unknown file type');
		}
	}

	onunload() {

	}

	async loadSettings() {
		// 尝试读取 data.json 文件
		const existingData = await this.loadData();
		
		if (!existingData) {
			// 如果 data.json 不存在或为空，创建包含默认配置的文件
			await this.saveData(DEFAULT_SETTINGS);
			this.settings = {...DEFAULT_SETTINGS};
		} else {
			// 如果文件存在合并现有配置和默认配置
			this.settings = Object.assign({}, DEFAULT_SETTINGS, existingData);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// class SampleModal extends Modal {
// 	constructor(app: App) {
// 		super(app);
// 	}

// 	onOpen() {
// 		const { contentEl } = this;
// 		contentEl.setText('Woah!');
// 	}

// 	onClose() {
// 		const { contentEl } = this;
// 		contentEl.empty();
// 	}
// }

const wrapTextWithPasswordHide = (text: TextComponent) => {
	const hider = text.inputEl.insertAdjacentElement("beforebegin", createSpan());
	if (!hider) {
		return
	}
	setIcon(hider as HTMLElement, 'eye-off');

	hider.addEventListener("click", () => {
		const isText = text.inputEl.getAttribute("type") === "text";
		if (isText) {
			setIcon(hider as HTMLElement, 'eye-off');
			text.inputEl.setAttribute("type", "password");
		} else {
			setIcon(hider as HTMLElement, 'eye')
			text.inputEl.setAttribute("type", "text");
		}
		text.inputEl.focus();
	});
	text.inputEl.setAttribute("type", "password");
	return text;
};

class MinioSettingTab extends PluginSettingTab {
	plugin: MinioPlusPlugin;

	constructor(app: App, plugin: MinioPlusPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName(t("Minio OSS"))
			.setHeading();

		new Setting(containerEl)
			.setName('Access key')
			.setDesc(t('Required'))
			.addText(text => {
				wrapTextWithPasswordHide(text);
				text.setPlaceholder(t('Enter your access key'))
					.setValue(this.plugin.settings.accessKey)
					.onChange(async (value) => {
						this.plugin.settings.accessKey = value;
						await this.plugin.saveSettings();
					})
			});
		new Setting(containerEl)
			.setName('Secret key')
			.setDesc(t('Required'))
			.addText(text => {
				wrapTextWithPasswordHide(text);
				text.setPlaceholder(t('Enter your secret key'))
					.setValue(this.plugin.settings.secretKey)
					.onChange(async (value) => {
						this.plugin.settings.secretKey = value;
						await this.plugin.saveSettings();
					})
			});
		new Setting(containerEl)
			.setName('Region')
			.setDesc(t('Optional'))
			.addText(text => text
				.setPlaceholder(t('Enter your region'))
				.setValue(this.plugin.settings.region)
				.onChange(async (value) => {
					this.plugin.settings.region = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Bucket')
			.setDesc(t('Required'))
			.addText(text => text
				.setPlaceholder(t('Enter your bucket'))
				.setValue(this.plugin.settings.bucket)
				.onChange(async (value) => {
					this.plugin.settings.bucket = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Base path')
			.setDesc(t('Optional'))
			.addText(text => text
				.setPlaceholder(t('Enter your base path(e.g. /path)'))
				.setValue(this.plugin.settings.basepath)
				.onChange(async (value) => {
					this.plugin.settings.basepath = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Endpoint')
			.setDesc(t('Required'))
			.addText(text => text
				.setPlaceholder('minio.xxxx.cn')
				.setValue(this.plugin.settings.endpoint)
				.onChange(async (value) => {
					this.plugin.settings.endpoint = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Port')
			.setDesc(t('Required'))
			.addText(text => text
				.setPlaceholder(t('Enter your port'))
				.setValue(this.plugin.settings.port + '')
				.onChange(async (value) => {
					this.plugin.settings.port = parseInt(value);
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Custom domain')
			.setDesc(t('Optional'))
			.addText(text => text
				.setPlaceholder(t('Enter your custom domain(e.g. https://minio.example.com)'))
				.setValue(this.plugin.settings.customDomain)
				.onChange(async (value) => {
					this.plugin.settings.customDomain = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('SSL')
			.addToggle(text => text
				.setValue(this.plugin.settings.useSSL)
				.onChange(async (value) => {
					this.plugin.settings.useSSL = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t("Object rules"))
			.setHeading();

		new Setting(containerEl)
			.setName(t('Object naming rules'))
			.setDesc(t('Naming rules description'))
			.addDropdown((select) => select
				.addOption('local', t('Local file name'))
				.addOption('time', t('Time file name'))
				.addOption('timeAndLocal', t('Time and local file name'))
				.setValue(this.plugin.settings.nameRule)
				.onChange(async value => {
					this.plugin.settings.nameRule = value;
					await this.plugin.saveSettings();
				}))
		new Setting(containerEl)
			.setName(t('Object path rules'))
			.setDesc(t('Object path rules description'))
			.addDropdown((select) => select
				.addOption('root', t('Root directory'))
				.addOption('type', t('File type directory'))
				.addOption('date', t('Date directory'))
				.addOption('typeAndData', t('File type and date directory'))
				.setValue(this.plugin.settings.pathRule)
				.onChange(async value => {
					this.plugin.settings.pathRule = value;
					await this.plugin.saveSettings();
				}))

		new Setting(containerEl)
			.setName(t("Preview"))
			.setHeading();

		new Setting(containerEl)
			.setName(t('Image preview'))
			.setDesc(t('Image preview description'))
			.addToggle(text => text
				.setValue(this.plugin.settings.imgPreview)
				.onChange(async (value) => {
					this.plugin.settings.imgPreview = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName(t('Video preview'))
			.setDesc(t('Video preview description'))
			.addToggle(text => text
				.setValue(this.plugin.settings.videoPreview)
				.onChange(async (value) => {
					this.plugin.settings.videoPreview = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName(t('Audio preview'))
			.setDesc(t('Audio preview description'))
			.addToggle(text => text
				.setValue(this.plugin.settings.audioPreview)
				.onChange(async (value) => {
					this.plugin.settings.audioPreview = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName(t('Docs preview'))
			.setDesc(t('Docs preview description'))
			.addDropdown((select) => select
				.addOption('', t('Disabled'))
				.addOption('https://docs.google.com/viewer?url=', t('Google docs'))
				.addOption('https://view.officeapps.live.com/op/view.aspx?src=', t('Office online'))
				.setValue(this.plugin.settings.docsPreview)
				.onChange(async value => {
					this.plugin.settings.docsPreview = value;
					await this.plugin.saveSettings();
				}))
	}
}
