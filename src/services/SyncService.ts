import { MinioObject, SyncChanges, ServiceDependencies } from '../types/gallery';
import { ImageCache } from '../utils/ImageCache';

export class SyncService {
    constructor(private deps: ServiceDependencies) {}

    /**
     * 与远程服务器同步
     */
    async sync(localObjects: MinioObject[]): Promise<{ objects: MinioObject[]; changes: SyncChanges }> {
        try {
            const remoteObjects = await this.fetchRemoteObjects();
            const changes = this.detectChanges(localObjects, remoteObjects);

            if (changes.hasChanges) {
                // 清理已删除文件的缓存
                changes.deleted.forEach(objectName => {
                    ImageCache.delete(objectName);
                });
            }

            return {
                objects: remoteObjects,
                changes
            };
        } catch (error) {
            console.error('Remote sync failed:', error);
            throw error;
        }
    }

    /**
     * 获取远程对象列表
     */
    private async fetchRemoteObjects(): Promise<MinioObject[]> {
        return new Promise((resolve, reject) => {
            const objects: MinioObject[] = [];
            const stream = this.deps.client.listObjects(this.deps.settings.bucket, '', true);

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

    /**
     * 检测本地和远程的变更
     */
    private detectChanges(local: MinioObject[], remote: MinioObject[]): SyncChanges {
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

    /**
     * 删除对象
     */
    async deleteObject(objectName: string): Promise<void> {
        await this.deps.client.removeObject(this.deps.settings.bucket, objectName);
        ImageCache.delete(objectName);
    }
}