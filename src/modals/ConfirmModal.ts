import { App, Modal, Setting } from "obsidian";
import { t } from '../i18n';

export class ConfirmModal extends Modal {
    private onConfirm: () => void;

    constructor(app: App, onConfirm: () => void) {
        super(app);
        this.onConfirm = onConfirm;
        this.containerEl.addClass('minio-confirm-modal');
        this.modalEl.addClass('no-shadow-modal');
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        
        contentEl.createEl("h3", {
            text: t('Delete'),
            cls: 'minio-confirm-title'
        });
        
        contentEl.createEl("p", {
            text: t('Confirm delete?'),
            cls: 'minio-confirm-message'
        });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText(t('Cancel'))
                .onClick(() => this.close()))
            .addButton(btn => btn
                .setButtonText(t('Delete'))
                .setWarning()
                .onClick(() => {
                    this.onConfirm();
                    this.close();
                }));
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
} 