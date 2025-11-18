import { App, Plugin, PluginSettingTab, Setting, TextComponent, setIcon } from 'obsidian';
import { MinioPluginSettings } from '../types/settings';
import { t } from '../i18n';

/**
 * 包装密码输入框，添加显示/隐藏功能
 */
function wrapTextWithPasswordHide(text: TextComponent): TextComponent {
    const hider = text.inputEl.insertAdjacentElement('beforebegin', createSpan());
    if (!hider) {
        return text;
    }
    setIcon(hider as HTMLElement, 'eye-off');

    hider.addEventListener('click', () => {
        const isText = text.inputEl.getAttribute('type') === 'text';
        if (isText) {
            setIcon(hider as HTMLElement, 'eye-off');
            text.inputEl.setAttribute('type', 'password');
        } else {
            setIcon(hider as HTMLElement, 'eye');
            text.inputEl.setAttribute('type', 'text');
        }
        text.inputEl.focus();
    });
    text.inputEl.setAttribute('type', 'password');

    return text;
}

/**
 * MinIO 插件设置标签页
 */
export class SettingsManager extends PluginSettingTab {
    plugin: Plugin & {
        settings: MinioPluginSettings;
        saveSettings(): Promise<void>;
    };

    constructor(app: App, plugin: Plugin & {
        settings: MinioPluginSettings;
        saveSettings(): Promise<void>;
    }) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // MinIO OSS 设置
        this.createMinioSettings(containerEl);

        // 对象规则设置
        this.createObjectRulesSettings(containerEl);

        // 预览设置
        this.createPreviewSettings(containerEl);
    }

    /**
     * 创建 MinIO 连接设置
     */
    private createMinioSettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName(t('Minio OSS'))
            .setHeading();

        // Access Key
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
                    });
            });

        // Secret Key
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
                    });
            });

        // Region
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

        // Bucket
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

        // Base Path
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

        // Endpoint
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

        // Port
        new Setting(containerEl)
            .setName('Port')
            .setDesc(t('Required'))
            .addText(text => text
                .setPlaceholder(t('Enter your port'))
                .setValue(this.plugin.settings.port + '')
                .onChange(async (value) => {
                    const port = parseInt(value);
                    if (!isNaN(port)) {
                        this.plugin.settings.port = port;
                        await this.plugin.saveSettings();
                    }
                }));

        // Custom Domain
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

        // SSL
        new Setting(containerEl)
            .setName('SSL')
            .addToggle(text => text
                .setValue(this.plugin.settings.useSSL)
                .onChange(async (value) => {
                    this.plugin.settings.useSSL = value;
                    await this.plugin.saveSettings();
                }));
    }

    /**
     * 创建对象规则设置
     */
    private createObjectRulesSettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName(t('Object rules'))
            .setHeading();

        // 命名规则
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
                }));

        // 路径规则
        new Setting(containerEl)
            .setName(t('Object path rules'))
            .setDesc(t('Object path rules description'))
            .addDropdown((select) => select
                .addOption('root', t('Root directory'))
                .addOption('type', t('File type directory'))
                .addOption('date', t('Date directory'))
                .addOption('typeAndDate', t('File type and date directory'))
                .setValue(this.plugin.settings.pathRule)
                .onChange(async value => {
                    this.plugin.settings.pathRule = value;
                    await this.plugin.saveSettings();
                }));
    }

    /**
     * 创建预览设置
     */
    private createPreviewSettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName(t('Preview'))
            .setHeading();

        // 图片预览
        new Setting(containerEl)
            .setName(t('Image preview'))
            .setDesc(t('Image preview description'))
            .addToggle(text => text
                .setValue(this.plugin.settings.imgPreview)
                .onChange(async (value) => {
                    this.plugin.settings.imgPreview = value;
                    await this.plugin.saveSettings();
                }));

        // 视频预览
        new Setting(containerEl)
            .setName(t('Video preview'))
            .setDesc(t('Video preview description'))
            .addToggle(text => text
                .setValue(this.plugin.settings.videoPreview)
                .onChange(async (value) => {
                    this.plugin.settings.videoPreview = value;
                    await this.plugin.saveSettings();
                }));

        // 音频预览
        new Setting(containerEl)
            .setName(t('Audio preview'))
            .setDesc(t('Audio preview description'))
            .addToggle(text => text
                .setValue(this.plugin.settings.audioPreview)
                .onChange(async (value) => {
                    this.plugin.settings.audioPreview = value;
                    await this.plugin.saveSettings();
                }));

        // 文档预览
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
                }));
    }
}