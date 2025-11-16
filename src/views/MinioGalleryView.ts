import { ItemView, WorkspaceLeaf, Notice, setIcon } from 'obsidian';
import { Client } from 'minio-es';
import { t } from '../i18n';
import { MinioPluginSettings } from '../types/settings';
import { ImagePreviewModal } from '../modals/ImagePreviewModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { ImageCache } from '../utils/ImageCache';
import { UrlGenerator } from '../utils/UrlGenerator';
import { SearchService } from '../services/SearchService';
import { SyncService } from '../services/SyncService';
import { ImageGrid } from '../components/ImageGrid';
import { SearchComponent } from '../components/SearchComponent';
import { MinioObject, GalleryState } from '../types/gallery';

export const GALLERY_VIEW_TYPE = 'minio-gallery-view';

export class MinioGalleryView extends ItemView {
    private client: Client;
    private settings: MinioPluginSettings;
    private container: HTMLElement;
    private refreshBtn: HTMLButtonElement;
    private backToTopBtn: HTMLButtonElement | null = null;
    private syncInterval: number | null = null;
    private scrollTimeout: number | null = null;
    private lastLoadTime: number = 0;

    // 服务和组件
    private urlGenerator: UrlGenerator;
    private searchService: SearchService;
    private syncService: SyncService;
    private imageGrid: ImageGrid | null = null;
    private searchComponent: SearchComponent | null = null;

    // 状态管理
    private state: GalleryState = {
        remoteObjects: [],
        visibleImages: [],
        isSearching: false,
        savedSearchTerm: '',
        useRegexSearch: false,
        currentPreviewIndex: null,
        isLoading: false
    };

    constructor(leaf: WorkspaceLeaf, client: Client, settings: MinioPluginSettings) {
        super(leaf);
        this.client = client;
        this.settings = settings;
        this.initializeServices();
    }

    private initializeServices(): void {
        this.urlGenerator = new UrlGenerator(this.settings);
        this.searchService = new SearchService((objectName) => this.urlGenerator.generateUrl(objectName));
        this.syncService = new SyncService({ client: this.client, settings: this.settings });
    }

    getViewType(): string {
        return GALLERY_VIEW_TYPE;
    }

    getDisplayText(): string {
        return t('Minio gallery');
    }

    getIcon(): string {
        return 'image-file';
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        if (!container) throw new Error("Failed to get container element");

        this.container = container;
        this.container.empty();

        this.createToolbar();
        await this.loadGallery();
        this.startAutoSync();
        this.setupScrollListener();
    }

    private createToolbar(): void {
        const toolbar = this.container.createEl('div', { cls: 'minio-gallery-toolbar' });

        this.searchComponent = new SearchComponent(toolbar, {
            placeholder: t('Search by URL...'),
            onSearch: (searchText) => this.handleSearch(searchText),
            onToggleRegex: (enabled) => {
                this.state.useRegexSearch = enabled;
            }
        });

        this.refreshBtn = toolbar.createEl('button', { cls: 'minio-gallery-icon-btn refresh-btn' });
        setIcon(this.refreshBtn, 'refresh-cw');
        this.refreshBtn.onclick = () => {
            if (!this.state.isLoading) {
                this.loadGallery(true);
            }
        };
    }

    private async loadGallery(forceRefresh = false): Promise<void> {
        if (this.state.isLoading) return;

        const currentTime = Date.now();
        if (!forceRefresh && (currentTime - this.lastLoadTime < 60000)) return;

        this.state.isLoading = true;
        this.refreshBtn?.addClass('loading');
        this.lastLoadTime = currentTime;

        this.cleanupImageGrid();
        const loading = this.container.createEl('div', { cls: 'minio-loading-spinner' });

        try {
            if (!this.settings.bucket) {
                throw new Error('Bucket is not configured');
            }

            const { objects } = await this.syncService.sync(this.state.remoteObjects);
            this.state.remoteObjects = objects;

            const imageObjects = objects
                .filter(obj => this.isImageFile(obj.name))
                .sort((a, b) => (b.lastModified?.getTime() || 0) - (a.lastModified?.getTime() || 0));

            this.createImageGrid();
            await this.imageGrid!.renderImages(imageObjects);

            this.state.visibleImages = imageObjects;
            this.state.isSearching = false;

            loading.remove();
        } catch (err) {
            loading.removeClass('minio-loading-spinner');
            loading.setText(t('Load failed'));
            console.error(err);
        } finally {
            this.state.isLoading = false;
            this.refreshBtn?.removeClass('loading');
        }
    }

    private createImageGrid(): void {
        const gridContainer = this.container.createEl('div', {
            cls: 'minio-gallery-container'
        });

        this.imageGrid = new ImageGrid(gridContainer, {
            getObjectUrl: (objectName) => this.getObjectUrl(objectName),
            onPreview: (index) => this.openImagePreview(index),
            onDelete: async (objectName, element) => {
                await this.handleDelete(objectName, element);
            }
        });
    }

    private cleanupImageGrid(): void {
        const existingContainer = this.container.querySelector('.minio-gallery-container');
        existingContainer?.remove();

        if (this.imageGrid) {
            this.imageGrid.destroy();
            this.imageGrid = null;
        }
    }

    private async handleSearch(searchText: string): Promise<void> {
        if (this.state.isLoading) return;

        this.state.isSearching = true;
        this.state.savedSearchTerm = searchText;

        try {
            let objectsToRender: MinioObject[];

            if (searchText.trim() === '') {
                objectsToRender = this.state.remoteObjects.filter(obj => this.isImageFile(obj.name));
                this.state.isSearching = false;
                this.state.savedSearchTerm = '';
            } else {
                const result = await this.searchService.search(
                    this.state.remoteObjects,
                    searchText,
                    this.state.useRegexSearch
                );
                objectsToRender = result.matchedObjects;
            }

            this.state.visibleImages = objectsToRender;

            this.cleanupImageGrid();
            this.createImageGrid();
            await this.imageGrid!.renderImages(objectsToRender);
        } catch (error) {
            new Notice(error instanceof Error ? error.message : t('Search failed'));
            console.error('Search error:', error);
        }
    }

    private async openImagePreview(imageIndex: number, modal?: ImagePreviewModal): Promise<void> {
        if (imageIndex < 0 || imageIndex >= this.state.visibleImages.length || this.state.isLoading) {
            return;
        }

        const object = this.state.visibleImages[imageIndex];
        const objectUrl = await this.getObjectUrl(object.name);

        if (modal) {
            modal.updateImage(objectUrl, object.name);
            this.state.currentPreviewIndex = imageIndex;
            return;
        }

        const modalInstance = new ImagePreviewModal(this.app, objectUrl, object.name, {
            onNavigate: (direction: 'prev' | 'next') => {
                const currentIndex = this.state.currentPreviewIndex ?? imageIndex;
                const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
                if (newIndex >= 0 && newIndex < this.state.visibleImages.length) {
                    this.openImagePreview(newIndex, modalInstance);
                }
            }
        });
        modalInstance.open();

        this.state.currentPreviewIndex = imageIndex;
    }

    private async handleDelete(objectName: string, element: HTMLElement): Promise<void> {
        const modal = new ConfirmModal(this.app, async () => {
            try {
                await this.syncService.deleteObject(objectName);
                element.remove();

                this.state.remoteObjects = this.state.remoteObjects.filter(obj => obj.name !== objectName);
                this.state.visibleImages = this.state.visibleImages.filter(obj => obj.name !== objectName);

                ImageCache.delete(objectName);

                const { objects } = await this.syncService.sync(this.state.remoteObjects);
                this.state.remoteObjects = objects;

                new Notice(t('Delete success'));
            } catch (err) {
                new Notice(t('Delete failed'));
                console.error(err);
            }
        });
        modal.open();
    }

    private isImageFile(filename: string): boolean {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
    }

    private async getObjectUrl(objectName: string): Promise<string> {
        const cachedUrl = await ImageCache.get(objectName);
        if (cachedUrl) return cachedUrl;

        const url = this.urlGenerator.generateUrl(objectName);
        await ImageCache.set(objectName, url);
        return url;
    }

    private startAutoSync(): void {
        this.syncInterval = window.setInterval(async () => {
            try {
                const { objects } = await this.syncService.sync(this.state.remoteObjects);
                this.state.remoteObjects = objects;

                if (!this.state.isSearching) {
                    this.state.visibleImages = objects.filter(obj => this.isImageFile(obj.name));
                }
            } catch (error) {
                console.error('Auto sync failed:', error);
            }
        }, 120000);
    }

    private setupScrollListener(): void {
        const throttledHandleScroll = () => {
            if (this.scrollTimeout) return;

            this.scrollTimeout = window.setTimeout(() => {
                const scrollTop = this.container.scrollTop;
                const containerHeight = this.container.clientHeight;
                const showThreshold = containerHeight * 0.5;

                if (scrollTop > showThreshold) {
                    this.showBackToTopButton();
                } else {
                    this.hideBackToTopButton();
                }

                this.scrollTimeout = null;
            }, 16);
        };

        this.container.addEventListener('scroll', throttledHandleScroll, { passive: true });
    }

    private showBackToTopButton(): void {
        if (!this.backToTopBtn) {
            this.backToTopBtn = this.container.createEl('button', {
                cls: 'minio-back-to-top'
            });
            setIcon(this.backToTopBtn, 'chevron-up');

            this.backToTopBtn.onclick = () => {
                this.container.scrollTo({ top: 0, behavior: 'smooth' });
            };
        }

        this.backToTopBtn.classList.add('visible');
    }

    private hideBackToTopButton(): void {
        this.backToTopBtn?.classList.remove('visible');
    }

    async onunload(): Promise<void> {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }

        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = null;
        }

        this.backToTopBtn?.remove();
        this.backToTopBtn = null;

        this.searchComponent?.destroy();
        this.searchComponent = null;

        this.imageGrid?.destroy();
        this.imageGrid = null;

        this.searchService.clearCache();
    }

    async onload(): Promise<void> {
        await ImageCache.init();
    }
}