import { defineExtensionMessaging } from '@webext-core/messaging';

export interface ProtocolMap {
    fetch(data: RequestInit & { url: string }): any;
    resolveBilibiliUrl(data: { url: string }): string;
    webmsxyw(data: { path: string, body: any }): { 'X-s': string; 'X-t': string; };
    mnsv2(args: any): string;
    openPopup(): void;
    selectImageRegion(): void;
    openTaskDialog(data: { name: string } & Record<string, any>): void;
    download(options: TaskDownloadOption): number;
}

// ImageLens uses native runtime messages alongside this typed protocol.
// Ignore messages without this library's envelope instead of throwing.
export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>({ breakError: true });
