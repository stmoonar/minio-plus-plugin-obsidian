import { Client } from 'minio-es';
import { MinioPluginSettings } from '../types/settings';
import { Notice } from 'obsidian';
import { t } from '../i18n';
import mime from 'mime';

export interface UploadProgress {
    loaded: number;
    total: number;
    percentage: number;
}

export class UploadService {
    constructor(
        private client: Client,
        private settings: MinioPluginSettings
    ) {}

    /**
     * 上传文件到 MinIO
     */
    async uploadFile(
        file: File,
        objectName: string,
        onProgress?: (progress: UploadProgress) => void
    ): Promise<void> {
        try {
            // 获取预签名上传 URL
            const presignedUrl = await this.client.presignedPutObject(
                this.settings.bucket,
                objectName,
                1 * 60 * 60 // 1小时有效期
            );

            await this.uploadWithXHR(file, presignedUrl, onProgress);
        } catch (error) {
            console.error('Upload failed:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Upload failed: ${message}`);
        }
    }

    /**
     * 使用 XMLHttpRequest 上传文件
     */
    private uploadWithXHR(
        file: File,
        url: string,
        onProgress?: (progress: UploadProgress) => void
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            // 监听上传进度
            xhr.upload.addEventListener('progress', (progressEvent) => {
                if (progressEvent.lengthComputable && onProgress) {
                    const loaded = progressEvent.loaded;
                    const total = progressEvent.total;
                    const percentage = Math.round((loaded / total) * 100);

                    onProgress({ loaded, total, percentage });
                }
            }, false);

            // 监听完成状态
            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        resolve();
                    } else {
                        const error = `${t('Upload failed')} (status ${xhr.status})`;
                        new Notice(error);
                        reject(new Error(error));
                    }
                }
            };

            // 设置请求
            xhr.open('PUT', url, true);

            // 设置内容类型
            const contentType = file.type ||
                mime.getType(file.name.substring(file.name.lastIndexOf('.'))) ||
                'application/octet-stream';
            xhr.setRequestHeader('Content-Type', contentType);

            // 发送文件
            xhr.send(file);
        });
    }

    /**
     * 生成完整的访问 URL
     */
    generateAccessUrl(objectName: string): string {
        const { endpoint, port, useSSL, bucket, customDomain } = this.settings;

        if (customDomain) {
            return `${customDomain}/${bucket}/${objectName}`;
        }

        const protocol = useSSL ? 'https' : 'http';
        const portStr = port === 443 || port === 80 ? '' : `:${port}`;
        const host = `${protocol}://${endpoint}${portStr}`;

        return `${host}/${bucket}/${objectName}`;
    }

    /**
     * 验证上传配置
     */
    validateUploadConfig(): { valid: boolean; error?: string } {
        if (!this.settings.accessKey) {
            return { valid: false, error: 'Access key is required' };
        }

        if (!this.settings.secretKey) {
            return { valid: false, error: 'Secret key is required' };
        }

        if (!this.settings.endpoint) {
            return { valid: false, error: 'Endpoint is required' };
        }

        if (!this.settings.bucket) {
            return { valid: false, error: 'Bucket is required' };
        }

        return { valid: true };
    }

    /**
     * 更新设置
     */
    updateSettings(settings: MinioPluginSettings): void {
        this.settings = settings;
    }
}