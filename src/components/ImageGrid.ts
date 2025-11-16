import { MinioObject, RenderImageOptions } from '../types/gallery';
import { LazyImageService } from '../services/LazyImageService';
import { Notice, setIcon } from 'obsidian';
import { t } from '../i18n';

export class ImageGrid {
    private lazyImageService: LazyImageService;
    private imageElements: Set<HTMLImageElement> = new Set();

    constructor(
        private container: HTMLElement,
        private options: {
            getObjectUrl: (objectName: string) => Promise<string>;
            onPreview?: (index: number) => void;
            onCopy?: (url: string) => void;
            onDelete?: (objectName: string, element: HTMLElement) => void;
        }
    ) {
        this.lazyImageService = new LazyImageService();
    }

    /**
     * 批量渲染图片
     */
    async renderImages(objects: MinioObject[], batchSize = 10): Promise<void> {
        // 清理旧的图片元素
        this.cleanup();

        for (let i = 0; i < objects.length; i += batchSize) {
            const batch = objects.slice(i, i + batchSize);
            await Promise.all(
                batch.map((obj, idx) => this.renderImageItem(obj.name, i + idx))
            );

            // 让出 UI 线程
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }

    /**
     * 渲染单个图片项
     */
    private async renderImageItem(objectName: string, imageIndex: number): Promise<void> {
        const objectUrl = await this.options.getObjectUrl(objectName);

        const imgDiv = this.container.createEl('div', {
            cls: 'minio-gallery-item'
        });

        const img = imgDiv.createEl('img', {
            attr: {
                'data-src': objectUrl,
                src: this.getPlaceholderUrl(),
                loading: 'lazy',
                alt: objectName
            }
        });

        // 添加到图片元素集合
        this.imageElements.add(img);

        // 设置懒加载
        this.lazyImageService.observe(img);

        // 点击事件
        img.onclick = () => {
            this.options.onPreview?.(imageIndex);
        };

        // 创建按钮容器
        const buttonContainer = imgDiv.createEl('div', {
            cls: 'minio-gallery-buttons'
        });

        // 复制按钮
        this.createCopyButton(buttonContainer, objectUrl);

        // 删除按钮
        this.createDeleteButton(buttonContainer, objectName, imgDiv);
    }

    /**
     * 创建复制按钮
     */
    private createCopyButton(container: HTMLElement, url: string): void {
        const copyBtn = container.createEl('button', {
            cls: 'minio-gallery-icon-btn copy-btn'
        });
        setIcon(copyBtn, 'copy');

        copyBtn.onclick = async () => {
            await navigator.clipboard.writeText(url);
            new Notice(t('URL copied'));
            this.options.onCopy?.(url);
        };
    }

    /**
     * 创建删除按钮
     */
    private createDeleteButton(container: HTMLElement, objectName: string, imgDiv: HTMLElement): void {
        const deleteBtn = container.createEl('button', {
            cls: 'minio-gallery-icon-btn delete-btn'
        });
        setIcon(deleteBtn, 'trash');

        deleteBtn.onclick = async () => {
            this.options.onDelete?.(objectName, imgDiv);
        };
    }

    /**
     * 获取占位图 URL
     */
    private getPlaceholderUrl(): string {
        return 'data:image/svg+xml;base64,' + btoa(`
            <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
                <rect width="100" height="100" fill="#ccc"/>
                <text x="50" y="50" text-anchor="middle" dy=".3em" fill="#666" font-size="12">Loading...</text>
            </svg>
        `);
    }

    /**
     * 清理图片元素
     */
    private cleanup(): void {
        // 清理容器
        this.container.empty();

        // 停止观察所有图片
        this.imageElements.forEach(img => {
            this.lazyImageService.unobserve(img);
        });

        // 清理图片元素
        this.lazyImageService.cleanup();
        this.imageElements.clear();
    }

    /**
     * 销毁组件
     */
    destroy(): void {
        this.cleanup();
        this.lazyImageService.destroy();
    }

    /**
     * 获取当前图片元素数量
     */
    getImageCount(): number {
        return this.imageElements.size;
    }
}