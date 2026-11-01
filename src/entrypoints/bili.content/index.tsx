import { loadCommon } from '@/components/common';
import type { SocialMediaCopilotUiOptions } from '@/utils/ui';

export default defineContentScript({
    matches: ['*://www.bilibili.com/*', '*://space.bilibili.com/*', '*://m.bilibili.com/*'],
    cssInjectionMode: 'ui',
    async main(ctx) {
        const tasks: TaskDialogOptions[] = Object.values(import.meta.glob('./tasks/*/index.tsx', { eager: true, import: 'default' }));
        const ui: SocialMediaCopilotUiOptions[] = Object.values(import.meta.glob('./ui/*.tsx', { eager: true, import: 'default' }));
        await loadCommon(ctx, tasks, ui);
    }
});
