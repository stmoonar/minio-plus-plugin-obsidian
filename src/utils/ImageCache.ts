export class ImageCache {
    private static cache: Map<string, string> = new Map();
    private static readonly CACHE_KEY = 'minio-gallery-cache';
    private static readonly CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24小时

    static async init() {
        try {
            const savedCache = localStorage.getItem(this.CACHE_KEY);
            if (savedCache) {
                const {data, timestamp} = JSON.parse(savedCache);
                if (Date.now() - timestamp < this.CACHE_EXPIRY) {
                    this.cache = new Map(Object.entries(data));
                }
            }
        } catch (err) {
            console.error('Failed to load image cache:', err);
        }
    }

    static get(key: string): string | undefined {
        return this.cache.get(key);
    }

    static set(key: string, url: string) {
        this.cache.set(key, url);
        this.saveCache();
    }

    private static saveCache() {
        try {
            const data = Object.fromEntries(this.cache);
            localStorage.setItem(this.CACHE_KEY, JSON.stringify({
                data,
                timestamp: Date.now()
            }));
        } catch (err) {
            console.error('Failed to save image cache:', err);
        }
    }
}