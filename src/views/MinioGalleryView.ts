import { ItemView, WorkspaceLeaf, Notice, setIcon } from "obsidian";
import { Client } from 'minio-es';
import { t } from '../i18n';
import { MinioPluginSettings } from '../main';
import { ImagePreviewModal } from '../modals/ImagePreviewModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { ImageCache } from '../utils/ImageCache';

export const GALLERY_VIEW_TYPE = "minio-gallery-view";

interface FileInputEvent extends Event {
    target: HTMLInputElement & {
        files: FileList;
    };
}

interface MinioObject {
    name: string;
    lastModified?: Date;
}

export class MinioGalleryView extends ItemView {
    private client: Client;
    private settings: MinioPluginSettings;
    private container: HTMLElement;
    private searchInput: HTMLInputElement;
    private lastLoadTime: number = 0;  // 添加最后加载时间记录
    private isLoading: boolean = false;
    private refreshBtn: HTMLButtonElement;

    constructor(leaf: WorkspaceLeaf, client: Client, settings: MinioPluginSettings) {
        super(leaf);
        this.client = client;
        this.settings = settings;
    }

    getViewType(): string {
        return GALLERY_VIEW_TYPE;
    }

    getDisplayText(): string {
        return t('Minio Gallery');
    }

    getIcon(): string {
        return "image-file";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        if (!(container instanceof HTMLElement)) {
            throw new Error("Failed to get container element");
        }
        this.container = container;
        this.container.empty();
        
        // 添加顶部工具栏
        const toolbar = this.container.createEl("div", { cls: "minio-gallery-toolbar" });

        // 添加搜索容器
        const searchContainer = toolbar.createEl("div", { cls: "search-container" });

        // 添加搜索输入框
        this.searchInput = searchContainer.createEl("input", {
            cls: "minio-gallery-search",
            attr: {
                type: "text",
                placeholder: t('Search by URL...')
            }
        });

        // 添加搜索按钮
        const searchBtn = searchContainer.createEl("button", { cls: "minio-gallery-icon-btn search-btn" });
        setIcon(searchBtn, "search");
        
        // 添加刷新按钮
        this.refreshBtn = toolbar.createEl("button", { cls: "minio-gallery-icon-btn refresh-btn" });
        setIcon(this.refreshBtn, "refresh-cw");

        // 绑定事件
        this.searchInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                this.handleSearch();
            }
        };
        
        searchBtn.onclick = () => {
            this.handleSearch();
        };
        
        this.refreshBtn.onclick = () => {
            if(!this.isLoading) {
                this.loadGallery(true);
            }
        };

        // 开始初始加载
        this.loadGallery();
    }

    private async loadGallery(forceRefresh = false) {
        if(this.isLoading) {
            return;
        }
        
        const currentTime = Date.now();
        if (!forceRefresh && (currentTime - this.lastLoadTime < 300000)) {
            return;
        }

        this.isLoading = true;
        // 添加加载状态的样式
        this.refreshBtn?.addClass("loading");
        
        this.lastLoadTime = currentTime;

        const existingContainer = this.container.querySelector(".minio-gallery-container");
        if (existingContainer) {
            existingContainer.remove();
        }

        const loading = this.container.createEl("div", { 
            cls: "minio-loading-spinner"
        });
        
        try {
            const bucket = this.settings.bucket;
            if (!bucket) {
                throw new Error("Bucket is not configured");
            }

            const stream = this.client.listObjects(bucket, '', true);
            const imageContainer = this.container.createEl("div", {
                cls: "minio-gallery-container"
            });

            // 存储所有对象以便排序
            const objects: { name: string, lastModified?: Date }[] = [];

            stream.on('data', (obj: MinioObject) => {
                if (obj.name) {
                    objects.push({
                        name: obj.name,
                        lastModified: obj.lastModified
                    });
                }
            });

            stream.on('end', async () => {
                // 按最后修改时间排序
                objects.sort((a, b) => {
                    const timeA = a.lastModified?.getTime() || 0;
                    const timeB = b.lastModified?.getTime() || 0;
                    return timeB - timeA;
                });

                // 渲染图片
                for (const obj of objects) {
                    if (this.isImageFile(obj.name)) {
                        await this.renderImageItem(imageContainer, obj.name);
                    }
                }
                loading.remove();
                this.isLoading = false;
                this.refreshBtn?.removeClass("loading");
            });

        } catch (err) {
            loading.removeClass("minio-loading-spinner");
            loading.setText(t('Load failed'));
            console.error(err);
            this.isLoading = false;
            this.refreshBtn?.removeClass("loading");
        }
    }

    private async renderImageItem(container: HTMLElement, objectName: string) {
        const objectUrl = await this.getObjectUrl(objectName);
        
        if (this.searchInput.value && !objectUrl.toLowerCase().includes(this.searchInput.value.toLowerCase())) {
            return;
        }

        const imgDiv = container.createEl("div", {
            cls: "minio-gallery-item"
        });

        const img = imgDiv.createEl("img", {
            attr: {
                src: objectUrl,
                loading: "lazy"
            }
        });

        // 添加加载完成事件
        img.onload = () => {
            img.addClass('loaded');
        };

        // 添加点击事件打开预览
        img.onclick = () => {
            const modal = new ImagePreviewModal(this.app, objectUrl);
            modal.open();
        };

        const buttonContainer = imgDiv.createEl("div", {
            cls: "minio-gallery-buttons"
        });

        // 添加复制URL按钮
        const copyBtn = buttonContainer.createEl("button", {
            cls: "minio-gallery-icon-btn copy-btn"
        });
        setIcon(copyBtn, "copy");
        
        copyBtn.onclick = async () => {
            await navigator.clipboard.writeText(objectUrl);
            new Notice(t('URL copied'));
        };

        // 添加删除按钮
        const deleteBtn = buttonContainer.createEl("button", {
            cls: "minio-gallery-icon-btn delete-btn"
        });
        setIcon(deleteBtn, "trash");
        
        deleteBtn.onclick = async () => {
            const modal = new ConfirmModal(this.app, async () => {
                try {
                    await this.client.removeObject(this.settings.bucket, objectName);
                    imgDiv.remove();
                    new Notice(t('Delete success'));
                } catch (err) {
                    new Notice(t('Delete failed'));
                    console.error(err);
                }
            });
            modal.open();
        };
    }

    private isImageFile(filename: string): boolean {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
    }

    private generateUrl(objectName: string): string {
        const { endpoint, bucket } = this.settings;
        
        // 检查自定义域名
        if (this.settings.customDomain) {
            return `${this.settings.customDomain}/${bucket}/${objectName}`;
        }
        
        // 检查端口号
        const portStr = this.settings.port === 443 || this.settings.port === 80 
            ? '' 
            : `:${this.settings.port}`;
        
        // 生成标准 URL
        const protocol = this.settings.useSSL ? 'https' : 'http';
        return `${protocol}://${endpoint}${portStr}/${bucket}/${objectName}`;
    }

    private async getObjectUrl(objectName: string): Promise<string> {
        // 先检查缓存
        const cachedUrl = ImageCache.get(objectName);
        if (cachedUrl) {
            return cachedUrl;
        }

        const url = this.generateUrl(objectName);
        // 存入缓存
        ImageCache.set(objectName, url);
        return url;
    }

    private async handleSearch() {
        const searchText = this.searchInput.value.toLowerCase();
        const items = this.container.querySelectorAll('.minio-gallery-item');
        
        items.forEach((item: HTMLElement) => {
            const img = item.querySelector('img');
            if (img) {
                const imgUrl = img.getAttribute('src') || '';
                if (searchText === '' || imgUrl.toLowerCase().includes(searchText)) {
                    item.classList.remove('hidden');
                    item.classList.add('visible');
                } else {
                    item.classList.remove('visible');
                    item.classList.add('hidden');
                }
            }
        });
    }
    
    async onload() {
        await ImageCache.init();
        // ... 其他初始化代码
    }
}