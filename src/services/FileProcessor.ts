import { MinioPluginSettings, NameRule, PathRule } from '../types/settings';
import { moment } from 'obsidian';

export class FileProcessor {
    constructor(private settings: MinioPluginSettings) {}

    /**
     * 获取文件类型
     */
    getFileType(file: File): string {
        const imageType = /image.*/;
        const videoType = /video.*/;
        const audioType = /audio.*/;
        const docType = /application\/(vnd.*|pdf)/;

        if (file?.type.match(videoType)) {
            return 'video';
        } else if (file?.type.match(audioType)) {
            return 'audio';
        } else if (file?.type.match(docType)) {
            return 'doc';
        } else if (file?.type.match(imageType)) {
            return 'image';
        } else {
            return '';
        }
    }

    /**
     * 生成对象名称
     */
    generateObjectName(file: File): string {
        let objectName = this.generatePath(file);
        objectName += this.generateFileName(file);
        objectName = this.applyBasePath(objectName);
        return objectName;
    }

    /**
     * 生成路径部分
     */
    private generatePath(file: File): string {
        switch (this.settings.pathRule as PathRule) {
            case 'root':
                return '';
            case 'type':
                return `${this.getFileType(file)}/`;
            case 'date':
                return `${moment().format('YYYY/MM/DD')}/`;
            case 'typeAndDate':
                return `${this.getFileType(file)}/${moment().format('YYYY/MM/DD')}/`;
            default:
                return '';
        }
    }

    /**
     * 生成文件名部分
     */
    private generateFileName(file: File): string {
        const timestamp = moment().format('YYYYMMDDHHmmSS');
        const extension = file.name.substring(file.name.lastIndexOf('.'));

        switch (this.settings.nameRule as NameRule) {
            case 'local':
                return file.name;
            case 'time':
                return timestamp + extension;
            case 'timeAndLocal':
                return timestamp + '_' + file.name;
            default:
                return file.name;
        }
    }

    /**
     * 应用基础路径
     */
    private applyBasePath(objectName: string): string {
        if (this.settings.basepath) {
            // 移除首尾的斜杠
            const cleanBasePath = this.settings.basepath.replace(/^\/|\/$/g, '');
            return cleanBasePath + '/' + objectName;
        }
        return objectName;
    }

    /**
     * 根据文件类型包装内容
     */
    wrapFileDependingOnType(type: string, url: string, name: string): string {
        if (type === 'image') {
            return `${this.settings.imgPreview ? '!' : ''}[](${url})\n`;
        } else if (type === 'video') {
            return `${this.settings.videoPreview ? `<video src="${url}" controls></video>` : `[${name}](${url})`}\n`;
        } else if (type === 'audio') {
            return `${this.settings.audioPreview ? `<audio src="${url}" controls></audio>` : `[${name}](${url})`}\n`;
        } else if (type === 'doc') {
            return this.settings.docsPreview
                ? `<iframe frameborder="0" border="0" width="100%" height="800" src="${this.settings.docsPreview}${url}"></iframe>\n`
                : `[${name}](${url})\n`;
        } else {
            throw new Error('Unknown file type');
        }
    }

    /**
     * 更新设置
     */
    updateSettings(settings: MinioPluginSettings): void {
        this.settings = settings;
    }
}