import { MinioPluginSettings } from "./settings";

export interface MinioObject {
	name: string;
	lastModified?: Date;
}

export interface FileInputEvent extends Event {
	target: HTMLInputElement & {
		files: FileList;
	};
}

export interface ImagePreviewOptions {
	onNavigate?: (direction: "prev" | "next") => void;
}

export interface SearchResult {
	matchedObjects: MinioObject[];
	totalCount: number;
}

export interface SyncChanges {
	hasChanges: boolean;
	added: MinioObject[];
	deleted: string[];
	modified: MinioObject[];
}

export interface GalleryState {
	remoteObjects: MinioObject[];
	visibleImages: MinioObject[];
	isSearching: boolean;
	savedSearchTerm: string;
	useRegexSearch: boolean;
	currentPreviewIndex: number | null;
	isLoading: boolean;
}

export interface RenderImageOptions {
	container: HTMLElement;
	objectName: string;
	index: number;
	onPreview?: (index: number) => void;
	onCopy?: (url: string) => void;
	onDelete?: (objectName: string, element: HTMLElement) => void;
}

export interface LazyImageOptions {
	rootMargin?: string;
	threshold?: number;
	retryCount?: number;
	timeout?: number;
	onImageLoaded?: (img: HTMLImageElement, url: string) => void;
}

export interface ServiceDependencies {
	client: any;
	settings: MinioPluginSettings;
}
