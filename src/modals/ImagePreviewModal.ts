import { App, Modal } from "obsidian";

export class ImagePreviewModal extends Modal {
    private imageUrl: string;
    private container: HTMLElement;
    private imgElement: HTMLImageElement | null = null;
    private onNavigate?: (direction: 'prev' | 'next') => void;
    private isUpdating: boolean = false;

    constructor(app: App, imageUrl: string, options?: {
        onNavigate?: (direction: 'prev' | 'next') => void
    }) {
        super(app);
        this.imageUrl = imageUrl;
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

    updateImage(newUrl: string): void {
        if (!this.imgElement) {
            return;
        }

        this.imageUrl = newUrl;
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
}