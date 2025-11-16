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
    private lastLoadTime: number = 0;
    private isLoading: boolean = false;
    private refreshBtn: HTMLButtonElement;
    private backToTopBtn: HTMLButtonElement | null = null;
    private intersectionObserver: IntersectionObserver | null = null;
    private imageElements: Set<HTMLImageElement> = new Set();
    private remoteObjects: MinioObject[] = [];
    private syncInterval: number | null = null;
    private scrollTimeout: number | null = null;

    constructor(leaf: WorkspaceLeaf, client: Client, settings: MinioPluginSettings) {
        super(leaf);
        this.client = client;
        this.settings = settings;
    }

    getViewType(): string {
        return GALLERY_VIEW_TYPE;
    }

    getDisplayText(): string {
        return t('Minio gallery');
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

        // 设置 Intersection Observer
        this.setupIntersectionObserver();

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

        // 绑定事件 - 使用防抖优化搜索性能
        const debouncedSearch = this.debounce(() => this.handleSearch(), 300);
        this.searchInput.oninput = debouncedSearch;

        this.searchInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                // 回车键立即搜索，无需等待防抖
                if (this.searchInput.oninput) {
                    this.searchInput.oninput(null as any);
                }
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
        await this.loadGallery();

        // 启动自动同步（每2分钟）
        this.startAutoSync();

        // 添加滚动监听器用于回到顶部按钮
        this.setupScrollListener();
    }

    // 防抖函数
    private debounce<T extends (...args: any[]) => any>(fn: T, wait: number): (...args: Parameters<T>) => void {
        let timeout: number | null = null;
        return (...args: Parameters<T>) => {
            if (timeout) {
                clearTimeout(timeout);
            }
            timeout = window.setTimeout(() => {
                fn(...args);
                timeout = null;
            }, wait);
        };
    }

    private async loadGallery(forceRefresh = false) {
        if(this.isLoading) {
            return;
        }

        const currentTime = Date.now();
        if (!forceRefresh && (currentTime - this.lastLoadTime < 60000)) { // 减少到1分钟
            return;
        }

        this.isLoading = true;
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

            // 智能远程同步
            await this.syncWithRemote();

            const imageContainer = this.container.createEl("div", {
                cls: "minio-gallery-container"
            });

            // 过滤图片文件并按修改时间排序
            const imageObjects = this.remoteObjects
                .filter(obj => this.isImageFile(obj.name))
                .sort((a, b) => {
                    const timeA = a.lastModified?.getTime() || 0;
                    const timeB = b.lastModified?.getTime() || 0;
                    return timeB - timeA;
                });

            // 批量渲染图片（提升性能）
            await this.renderImagesBatch(imageContainer, imageObjects);

            loading.remove();
            this.isLoading = false;
            this.refreshBtn?.removeClass("loading");

        } catch (err) {
            loading.removeClass("minio-loading-spinner");
            loading.setText(t('Load failed'));
            console.error(err);
            this.isLoading = false;
            this.refreshBtn?.removeClass("loading");
        }
    }

    private async syncWithRemote(): Promise<void> {
        try {
            const remoteObjects = await this.fetchRemoteObjects();

            // 检测变更
            const changes = this.detectChanges(this.remoteObjects, remoteObjects);

            if (changes.hasChanges) {
                this.remoteObjects = remoteObjects;
                // 清理已删除文件的缓存
                changes.deleted.forEach(objectName => {
                    ImageCache.delete(objectName);
                });
            }
        } catch (error) {
            console.error('Remote sync failed:', error);
            throw error;
        }
    }

    private async fetchRemoteObjects(): Promise<MinioObject[]> {
        return new Promise((resolve, reject) => {
            const objects: MinioObject[] = [];
            const stream = this.client.listObjects(this.settings.bucket, '', true);

            stream.on('data', (obj: MinioObject) => {
                if (obj.name) {
                    objects.push({
                        name: obj.name,
                        lastModified: obj.lastModified
                    });
                }
            });

            stream.on('end', () => {
                resolve(objects.sort((a, b) =>
                    (b.lastModified?.getTime() || 0) - (a.lastModified?.getTime() || 0)
                ));
            });

            stream.on('error', reject);
        });
    }

    private detectChanges(local: MinioObject[], remote: MinioObject[]): {
        hasChanges: boolean;
        added: MinioObject[];
        deleted: string[];
        modified: MinioObject[];
    } {
        const localMap = new Map(local.map(obj => [obj.name, obj.lastModified]));
        const remoteMap = new Map(remote.map(obj => [obj.name, obj.lastModified]));

        const added: MinioObject[] = [];
        const deleted: string[] = [];
        const modified: MinioObject[] = [];
        let hasChanges = false;

        // 检测新增和修改
        for (const [name, remoteModified] of remoteMap) {
            const localModified = localMap.get(name);

            if (!localModified) {
                added.push(remote.find(obj => obj.name === name)!);
                hasChanges = true;
            } else if (remoteModified?.getTime() !== localModified?.getTime()) {
                modified.push(remote.find(obj => obj.name === name)!);
                hasChanges = true;
            }
        }

        // 检测删除
        for (const name of localMap.keys()) {
            if (!remoteMap.has(name)) {
                deleted.push(name);
                hasChanges = true;
            }
        }

        return { hasChanges, added, deleted, modified };
    }

    private async renderImagesBatch(container: HTMLElement, objects: MinioObject[], batchSize = 10): Promise<void> {
        for (let i = 0; i < objects.length; i += batchSize) {
            const batch = objects.slice(i, i + batchSize);
            await Promise.all(
                batch.map(obj => this.renderImageItem(container, obj.name))
            );

            // 让出UI线程
            await new Promise(resolve => setTimeout(resolve, 10));
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
                "data-src": objectUrl, // 使用 data-src 实现懒加载
                src: this.getPlaceholderUrl(),
                loading: "lazy",
                alt: objectName
            }
        });

        // 添加到图片元素集合以便内存管理
        this.imageElements.add(img);

        // 设置 Intersection Observer
        if (this.intersectionObserver) {
            this.intersectionObserver.observe(img);
        }

        // 添加点击事件打开预览
        img.onclick = () => {
            // 获取真实的图片URL（从 data-src 属性，这才是实际的图片URL）
            const currentUrl = img.getAttribute("data-src") || objectUrl;
            console.log('Opening preview with URL:', currentUrl);
            const modal = new ImagePreviewModal(this.app, currentUrl);
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
                    // 从图片元素集合中移除
                    this.imageElements.delete(img);
                    // 清理缓存
                    ImageCache.delete(objectName);
                    // 触发同步
                    await this.syncWithRemote();
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
        const cachedUrl = await ImageCache.get(objectName);
        if (cachedUrl) {
            return cachedUrl;
        }

        const url = this.generateUrl(objectName);
        // 存入缓存
        await ImageCache.set(objectName, url);
        return url;
    }

    private async handleSearch() {
        const searchText = this.searchInput.value.toLowerCase();
        const items = this.container.querySelectorAll('.minio-gallery-item');

        items.forEach((item: HTMLElement) => {
            const img = item.querySelector('img');
            if (img) {
                // 检查 data-src（懒加载的URL）和 src（已加载的URL）
                const dataSrc = img.getAttribute('data-src') || '';
                const currentSrc = img.getAttribute('src') || '';
                const searchInUrl = dataSrc || currentSrc;

                if (searchText === '' || searchInUrl.toLowerCase().includes(searchText)) {
                    item.classList.remove('hidden');
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            }
        });
    }
    
      private setupIntersectionObserver(): void {
        this.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target as HTMLImageElement;
                    const src = img.dataset.src;

                    if (src && img.src !== src) {
                        this.loadImageWithRetry(src, img);
                        img.removeAttribute('data-src');
                    }
                }
            });
        }, {
            rootMargin: '50px'
        });
    }

    private async loadImageWithRetry(url: string, img: HTMLImageElement, maxRetries = 3): Promise<void> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.loadImage(url, img);
                img.classList.add('loaded');
                return;
            } catch (error) {
                if (attempt === maxRetries) {
                    img.classList.add('error');
                    img.src = this.getPlaceholderUrl();
                    console.error('Image load failed after retries:', url, error);
                    return;
                }

                // 指数退避
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    private loadImage(url: string, img: HTMLImageElement): Promise<void> {
        return new Promise((resolve, reject) => {
            // 设置超时
            const timeout = setTimeout(() => {
                reject(new Error(`Image load timeout: ${url}`));
            }, 8000);

            img.onload = () => {
                clearTimeout(timeout);
                resolve();
            };

            img.onerror = () => {
                clearTimeout(timeout);
                reject(new Error(`Failed to load image: ${url}`));
            };

            img.src = url;
        });
    }

    private getPlaceholderUrl(): string {
        // 返回一个简单的SVG占位图
        return 'data:image/svg+xml;base64,' + btoa(`
            <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
                <rect width="100" height="100" fill="#ccc"/>
                <text x="50" y="50" text-anchor="middle" dy=".3em" fill="#666" font-size="12">Loading...</text>
            </svg>
        `);
    }

    private updateCacheStatus(): void {
        const cacheStats = ImageCache.getStats();
        const cacheStatus = this.container.querySelector('.minio-cache-status');
        if (cacheStatus) {
            cacheStatus.setText(`Cache: ${cacheStats.totalSizeMB}MB (${cacheStats.count} items)`);
        }
    }

    private startAutoSync(): void {
        // 每2分钟同步一次
        this.syncInterval = window.setInterval(async () => {
            try {
                await this.syncWithRemote();
            } catch (error) {
                console.error('Auto sync failed:', error);
            }
        }, 120000);
    }

    private cleanupImageElements(): void {
        // 清理不可见的图片元素
        this.imageElements.forEach(img => {
            if (!img.isConnected) {
                this.imageElements.delete(img);
                img.src = ''; // 释放内存
            }
        });
    }

    // 添加清理方法到生命周期
    async onunload() {
        // 停止自动同步
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }

        // 清理滚动超时
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = null;
        }

        // 清理回到顶部按钮
        if (this.backToTopBtn) {
            this.backToTopBtn.remove();
            this.backToTopBtn = null;
        }

        // 清理图片元素
        this.cleanupImageElements();
        this.imageElements.clear();

        // 断开 Intersection Observer
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
            this.intersectionObserver = null;
        }
    }

    private setupScrollListener(): void {
        // 节流函数，优化性能
        const throttledHandleScroll = () => {
            if (this.scrollTimeout) {
                return;
            }

            this.scrollTimeout = window.setTimeout(() => {
                const scrollTop = this.container.scrollTop;
                const containerHeight = this.container.clientHeight;
                const showThreshold = containerHeight * 0.5; // 滚动超过50%高度时显示

                if (scrollTop > showThreshold) {
                    this.showBackToTopButton();
                } else {
                    this.hideBackToTopButton();
                }

                this.scrollTimeout = null;
            }, 16); // 约60fps
        };

        this.container.addEventListener('scroll', throttledHandleScroll, { passive: true });
    }

    private showBackToTopButton(): void {
        if (!this.backToTopBtn) {
            this.backToTopBtn = this.container.createEl("button", {
                cls: "minio-back-to-top"
            });
            setIcon(this.backToTopBtn, "chevron-up");

            this.backToTopBtn.onclick = () => {
                this.container.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            };
        }

        this.backToTopBtn.classList.add("visible");
    }

    private hideBackToTopButton(): void {
        if (this.backToTopBtn) {
            this.backToTopBtn.classList.remove("visible");
        }
    }

    async onload() {
        await ImageCache.init();
    }
}