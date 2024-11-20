import { App, Modal } from "obsidian";

export class ImagePreviewModal extends Modal {
    private imageUrl: string;

    constructor(app: App, imageUrl: string) {
        super(app);
        this.imageUrl = imageUrl;
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        contentEl.addClass('minio-image-preview-modal-content');

        const container = contentEl.createDiv({
            cls: "minio-image-preview-container"
        });

        container.createEl("img", {
            cls: "minio-image-preview",
            attr: {
                src: this.imageUrl
            }
        });

        // 点击关闭预览
        container.onclick = () => {
            this.close();
        };
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}