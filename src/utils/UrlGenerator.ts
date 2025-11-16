import { MinioPluginSettings } from '../types/settings';

export class UrlGenerator {
    constructor(private settings: MinioPluginSettings) {}

    /**
     * 生成对象访问 URL
     */
    generateUrl(objectName: string): string {
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

    /**
     * 更新设置
     */
    updateSettings(settings: MinioPluginSettings): void {
        this.settings = settings;
    }

    /**
     * 验证 URL 配置
     */
    validateConfig(): { valid: boolean; error?: string } {
        if (!this.settings.endpoint) {
            return { valid: false, error: 'Endpoint is required' };
        }

        if (!this.settings.bucket) {
            return { valid: false, error: 'Bucket is required' };
        }

        if (this.settings.customDomain) {
            try {
                new URL(this.settings.customDomain);
            } catch {
                return { valid: false, error: 'Invalid custom domain format' };
            }
        }

        return { valid: true };
    }
}