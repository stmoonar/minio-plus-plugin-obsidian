import { MinioObject, SearchResult } from '../types/gallery';
import { t } from '../i18n';
import { isImageFile } from '../utils/FileUtils';
import { handleError } from '../utils/ErrorHandler';

export class SearchService {
    private allImageUrls: Map<string, string> = new Map();

    constructor(private generateUrl: (objectName: string) => string) {}

    /**
     * 执行搜索
     */
    async search(
        objects: MinioObject[],
        searchText: string,
        useRegex: boolean = false
    ): Promise<SearchResult> {
        if (!searchText.trim()) {
            return {
                matchedObjects: objects,
                totalCount: objects.length
            };
        }

        const matchedObjects: MinioObject[] = [];

        if (useRegex) {
            const result = await this.regexSearch(objects, searchText);
            matchedObjects.push(...result);
        } else {
            const result = await this.textSearch(objects, searchText);
            matchedObjects.push(...result);
        }

        return {
            matchedObjects,
            totalCount: matchedObjects.length
        };
    }

    /**
     * 正则表达式搜索
     */
    private async regexSearch(objects: MinioObject[], searchText: string): Promise<MinioObject[]> {
        const matchedObjects: MinioObject[] = [];

        try {
            let regexPattern = searchText;

            // 智能处理通配符
            regexPattern = this.convertWildcardToRegex(regexPattern);

            const regex = new RegExp(regexPattern, 'i');

            for (const obj of objects) {
                if (!isImageFile(obj.name)) continue;

                const cachedUrl = this.allImageUrls.get(obj.name);
                const url = cachedUrl || this.generateUrl(obj.name);

                if (regex.test(url)) {
                    matchedObjects.push(obj);
                    if (!cachedUrl) {
                        this.allImageUrls.set(obj.name, url);
                    }
                }
            }
        } catch (error) {
            handleError(error, {
                operation: 'RegexSearch',
                additionalInfo: {
                    pattern: searchText
                }
            });
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`${t('Invalid regex pattern')}: ${errorMessage}`);
        }

        return matchedObjects;
    }

    /**
     * 普通文本搜索
     */
    private async textSearch(objects: MinioObject[], searchText: string): Promise<MinioObject[]> {
        const matchedObjects: MinioObject[] = [];
        const lowerSearchText = searchText.toLowerCase();

        for (const obj of objects) {
            if (!isImageFile(obj.name)) continue;

            const cachedUrl = this.allImageUrls.get(obj.name);
            const url = cachedUrl || this.generateUrl(obj.name);

            if (url.toLowerCase().includes(lowerSearchText)) {
                matchedObjects.push(obj);
                if (!cachedUrl) {
                    this.allImageUrls.set(obj.name, url);
                }
            }
        }

        return matchedObjects;
    }

    /**
     * 转换通配符为正则表达式
     */
    private convertWildcardToRegex(pattern: string): string {
        // 检查是否是简单的通配符模式
        const hasSpecialChars = /[()[?+]/.test(pattern);

        if (!hasSpecialChars) {
            if (pattern.startsWith('*') && pattern.endsWith('*')) {
                const innerPattern = pattern.slice(1, -1);
                return `.*${innerPattern}.*`;
            } else if (pattern.startsWith('*')) {
                const innerPattern = pattern.slice(1);
                return `${innerPattern}.*`;
            } else if (pattern.endsWith('*')) {
                const innerPattern = pattern.slice(0, -1);
                return `.*${innerPattern}`;
            }
        }

        return pattern;
    }

    
    /**
     * 清空URL缓存
     */
    clearCache(): void {
        this.allImageUrls.clear();
    }

    /**
     * 获取缓存大小
     */
    getCacheSize(): number {
        return this.allImageUrls.size;
    }
}