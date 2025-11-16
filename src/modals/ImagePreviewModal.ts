import { App, Modal } from "obsidian";

export class ImagePreviewModal extends Modal {
    private imageUrl: string;
    private container: HTMLElement;

    constructor(app: App, imageUrl: string) {
        super(app);
        this.imageUrl = imageUrl;

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

        const img = this.container.createEl("img", {
            cls: "minio-image-preview",
            attr: {
                src: this.imageUrl,
                alt: "Preview"
            }
        });

        // 阻止图片点击事件冒泡到容器
        img.onclick = (e) => {
            e.stopPropagation();
        };

        // 添加错误处理
        img.onerror = () => {
            console.error('Failed to load preview image:', this.imageUrl);
        };

        // 添加加载成功处理
        img.onload = () => {
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

        // 触发动画
        requestAnimationFrame(() => {
            this.container.classList.add('show');
        });
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}