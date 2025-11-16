import { App, Modal, setIcon } from "obsidian";

export class ImagePreviewModal extends Modal {
    private imageUrl: string;
    private fileName: string;
    private container: HTMLElement;
    private imgElement: HTMLImageElement | null = null;
    private onNavigate?: (direction: 'prev' | 'next') => void;
    private isUpdating: boolean = false;
    private isDarkMode: boolean = true;

    constructor(app: App, imageUrl: string, fileName: string, options?: {
        onNavigate?: (direction: 'prev' | 'next') => void
    }) {
        super(app);
        this.imageUrl = imageUrl;
        this.fileName = fileName;
        this.onNavigate = options?.onNavigate;

        // 移除Obsidian默认关闭按钮
        requestAnimationFrame(() => {
            // 尝试获取关闭按钮
            const closeBtn = this.modalEl.querySelector('.modal-close-button') as HTMLElement;
            if (closeBtn) {
                closeBtn.remove();
            }
            // 隐藏整个modalEl的边框和背景
            this.modalEl.style.border = 'none';
            this.modalEl.style.background = 'transparent';
            this.modalEl.style.boxShadow = 'none';
            this.modalEl.style.padding = '0';
        });
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        contentEl.addClass('minio-image-preview-modal-content');

        this.container = contentEl.createDiv({
            cls: "minio-image-preview-container"
        });

        // 添加控制栏（右上角）
        const controlBar = this.container.createEl("div", {
            cls: "minio-preview-control-bar"
        });

        // 添加背景切换按钮
        const toggleBgBtn = controlBar.createEl("button", {
            cls: "minio-preview-toggle-bg-btn"
        });
        setIcon(toggleBgBtn, "sun");
        toggleBgBtn.title = "切换背景颜色";

        toggleBgBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleBackground();
            const icon = this.isDarkMode ? "sun" : "moon";
            setIcon(toggleBgBtn, icon);
        };

        // 添加文件名（居中显示）
        const fileNameEl = controlBar.createEl("div", {
            cls: "minio-preview-file-name",
            text: this.fileName
        });

        this.imgElement = this.container.createEl("img", {
            cls: "minio-image-preview",
            attr: {
                src: this.imageUrl,
                alt: "Preview"
            }
        });

        // 阻止图片点击事件冒泡到容器
        this.imgElement.onclick = (e) => {
            e.stopPropagation();
        };

        // 添加错误处理
        this.imgElement.onerror = () => {
            console.error('Failed to load preview image:', this.imageUrl);
        };

        // 添加加载成功处理
        this.imgElement.onload = () => {
            console.log('Preview image loaded successfully:', this.imageUrl);
        };

        // 点击背景关闭预览
        this.container.onclick = () => {
            this.close();
        };

        // ESC键关闭预览
        this.scope.register([], 'Escape', () => {
            this.close();
        });

        // 左右方向键切换图片
        if (this.onNavigate) {
            // 左箭头 - 上一张
            this.scope.register([], 'ArrowLeft', () => {
                this.onNavigate?.('prev');
            });

            // 右箭头 - 下一张
            this.scope.register([], 'ArrowRight', () => {
                this.onNavigate?.('next');
            });
        }

        // 触发动画
        requestAnimationFrame(() => {
            this.container.classList.add('show');
        });
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
        this.imgElement = null;
    }

    updateImage(newUrl: string, newFileName?: string): void {
        if (!this.imgElement) {
            return;
        }

        this.imageUrl = newUrl;
        if (newFileName) {
            this.fileName = newFileName;
            // 更新文件名显示
            const fileNameEl = this.container.querySelector('.minio-preview-file-name');
            if (fileNameEl) {
                fileNameEl.textContent = newFileName;
            }
        }
        this.isUpdating = true;

        // 添加加载动画效果
        this.imgElement.style.opacity = '0.5';
        this.imgElement.style.transition = 'opacity 0.2s ease, transform 0.2s ease';

        // 更新图片
        this.imgElement.src = newUrl;

        // 图片加载完成后恢复透明度
        this.imgElement.onload = () => {
            this.imgElement!.style.opacity = '1';
            this.isUpdating = false;
            console.log('Preview image updated successfully:', newUrl);
        };

        this.imgElement.onerror = () => {
            this.imgElement!.style.opacity = '1';
            this.isUpdating = false;
            console.error('Failed to update preview image:', newUrl);
        };
    }

    toggleBackground(): void {
        this.isDarkMode = !this.isDarkMode;

        if (this.isDarkMode) {
            this.container.style.background = 'var(--minio-preview-overlay-bg)';
        } else {
            this.container.style.background = 'rgba(255, 255, 255, 0.95)';
        }

        // 同时更新文件名字体颜色
        const fileNameEl = this.container.querySelector('.minio-preview-file-name') as HTMLElement;
        if (fileNameEl) {
            fileNameEl.style.color = this.isDarkMode ? 'white' : 'black';
            // 同时更新文字阴影，确保在白色背景下也能看清
            fileNameEl.style.textShadow = this.isDarkMode
                ? '0 1px 3px rgba(0, 0, 0, 0.8)'
                : '0 1px 3px rgba(255, 255, 255, 0.8)';
        }
    }
}