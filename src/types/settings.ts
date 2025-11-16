export interface MinioPluginSettings {
    accessKey: string;
    secretKey: string;
    region: string;
    bucket: string;
    basepath: string;
    endpoint: string;
    port: number;
    customDomain: string;
    useSSL: boolean;
    imgPreview: boolean;
    videoPreview: boolean;
    audioPreview: boolean;
    docsPreview: string;
    nameRule: string;
    pathRule: string;
}

export const DEFAULT_SETTINGS: MinioPluginSettings = {
    accessKey: '',
    secretKey: '',
    region: '',
    endpoint: '',
    port: 9001,
    customDomain: '',
    bucket: '',
    basepath: '',
    useSSL: true,
    imgPreview: true,
    videoPreview: true,
    audioPreview: true,
    docsPreview: '',
    nameRule: 'local',
    pathRule: 'root',
};

export type NameRule = 'local' | 'time' | 'timeAndLocal';
export type PathRule = 'root' | 'type' | 'date' | 'typeAndDate';