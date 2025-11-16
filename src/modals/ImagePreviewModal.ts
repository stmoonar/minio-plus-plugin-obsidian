import { App, Modal, setIcon } from 'obsidian';
import { ImagePreviewOptions } from '../types/gallery';

interface PreviewTheme {
    background: string;
    textColor: string;
    textShadow: string;
}

export class ImagePreviewModal extends Modal {
    private imageUrl: string;
    private fileName: string;
    private container: HTMLElement;
    private imgElement: HTMLImageElement | null = null;
    private fileNameElement: HTMLElement | null = null;
    private onNavigate?: (direction: 'prev' | 'next') => void;
    private isUpdating: boolean = false;
    private currentTheme: 'dark' | 'light' = 'dark';

    // 主题配置
    private readonly themes: Record<string, PreviewTheme> = {
        dark: {
            background: 'var(--minio-preview-overlay-bg)',
            textColor: 'white',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.8)'
        },
        light: {
            background: 'rgba(255, 255, 255, 0.95)',
            textColor: 'black',
            textShadow: '0 1px 3px rgba(255, 255, 255, 0.8)'
        }
    };

    constructor(
        app: App,
        imageUrl: string,
        fileName: string,
        options?: ImagePreviewOptions
    ) {
        super(app);
        this.imageUrl = imageUrl;
        this.fileName = fileName;
        this.onNavigate = options?.onNavigate;

        // 初始化时移除默认样式
        this.setupModalStyle();
    }

    /**
     * 设置模态框样式
     */
    private setupModalStyle(): void {
        requestAnimationFrame(() => {
            const modalEl = this.modalEl;
            modalEl.style.border = 'none';
            modalEl.style.background = 'transparent';
            modalEl.style.boxShadow = 'none';
            modalEl.style.padding = '0';

            // 移除默认关闭按钮
            const closeBtn = modalEl.querySelector('.modal-close-button') as HTMLElement;
            closeBtn?.remove();
        });
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('minio-image-preview-modal-content');

        // 创建主容器
        this.container = contentEl.createDiv({
            cls: 'minio-image-preview-container'
        });

        // 创建控制栏
        this.createControlBar();

        // 创建图片元素
        this.createImageElement();

        // 绑定事件
        this.bindEvents();

        // 显示动画
        this.showAnimation();
    }

    /**
     * 创建控制栏
     */
    private createControlBar(): void {
        const controlBar = this.container.createEl('div', {
            cls: 'minio-preview-control-bar'
        });

        // 主题切换按钮
        const themeToggleBtn = controlBar.createEl('button', {
            cls: 'minio-preview-toggle-bg-btn'
        });
        setIcon(themeToggleBtn, this.currentTheme === 'dark' ? 'sun' : 'moon');
        themeToggleBtn.title = 'Toggle background';

        themeToggleBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleTheme();
            setIcon(themeToggleBtn, this.currentTheme === 'dark' ? 'sun' : 'moon');
        };

        // 文件名显示
        this.fileNameElement = controlBar.createEl('div', {
            cls: 'minio-preview-file-name',
            text: this.fileName
        });

        // 应用当前主题
        this.applyTheme(this.currentTheme);
    }

    /**
     * 创建图片元素
     */
    private createImageElement(): void {
        this.imgElement = this.container.createEl('img', {
            cls: 'minio-image-preview',
            attr: {
                src: this.imageUrl,
                alt: 'Preview'
            }
        });

        // 阻止图片点击事件冒泡
        this.imgElement.onclick = (e) => e.stopPropagation();

        // 错误处理
        this.imgElement.onerror = () => {
            console.error('Failed to load preview image:', this.imageUrl);
            this.handleImageError();
        };

        this.imgElement.onload = () => {
            console.log('Preview image loaded successfully:', this.imageUrl);
        };
    }

    /**
     * 绑定事件
     */
    private bindEvents(): void {
        // 点击背景关闭
        this.container.onclick = () => this.close();

        // 键盘快捷键
        this.scope.register([], 'Escape', () => this.close());

        if (this.onNavigate) {
            this.scope.register([], 'ArrowLeft', () => this.onNavigate?.('prev'));
            this.scope.register([], 'ArrowRight', () => this.onNavigate?.('next'));
        }
    }

    /**
     * 显示动画
     */
    private showAnimation(): void {
        requestAnimationFrame(() => {
            this.container.classList.add('show');
        });
    }

    /**
     * 处理图片加载错误
     */
    private handleImageError(): void {
        if (!this.imgElement || !this.container) return;

        // 创建错误提示元素
        const errorContainer = this.container.createEl('div', {
            cls: 'minio-preview-error'
        });

        errorContainer.innerHTML = `
            <div class="error-icon">⚠️</div>
            <div class="error-message">Failed to load image</div>
            <div class="error-url">${this.imageUrl}</div>
        `;

        // 隐藏失败的图片
        this.imgElement.style.display = 'none';
    }

    /**
     * 切换主题
     */
    private toggleTheme(): void {
        this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.applyTheme(this.currentTheme);
    }

    /**
     * 应用主题
     */
    private applyTheme(theme: 'dark' | 'light'): void {
        const themeConfig = this.themes[theme];

        this.container.style.background = themeConfig.background;

        if (this.fileNameElement) {
            this.fileNameElement.style.color = themeConfig.textColor;
            this.fileNameElement.style.textShadow = themeConfig.textShadow;
        }
    }

    /**
     * 更新图片
     */
    updateImage(newUrl: string, newFileName?: string): void {
        if (!this.imgElement || this.isUpdating) return;

        this.imageUrl = newUrl;
        this.isUpdating = true;

        // 更新文件名
        if (newFileName && this.fileNameElement) {
            this.fileName = newFileName;
            this.fileNameElement.textContent = newFileName;
        }

        // 显示加载动画
        this.animateImageTransition(() => {
            this.imgElement!.src = newUrl;
        });
    }

    /**
     * 图片切换动画
     */
    private animateImageTransition(updateCallback: () => void): void {
        if (!this.imgElement) return;

        // 设置过渡效果
        this.imgElement.style.transition = 'opacity 0.2s ease';
        this.imgElement.style.opacity = '0.5';

        // 执行更新
        updateCallback();

        // 恢复透明度
        this.imgElement.onload = () => {
            if (this.imgElement) {
                this.imgElement.style.opacity = '1';
                this.isUpdating = false;
            }
        };

        this.imgElement.onerror = () => {
            if (this.imgElement) {
                this.imgElement.style.opacity = '1';
                this.isUpdating = false;
                this.handleImageError();
            }
        };
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.imgElement = null;
        this.fileNameElement = null;
        // container 不能设置为 null，因为它被其他地方使用
    }
}