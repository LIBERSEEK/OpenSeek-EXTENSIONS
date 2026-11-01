import '@/integrations/image-lens/i18n.js';
import '@/integrations/image-lens/content.css';
import { initializeImageLens } from '@/integrations/image-lens/content.js';

export default defineContentScript({
    matches: ['http://*/*', 'https://*/*'],
    runAt: 'document_idle',
    main() {
        initializeImageLens();
    },
});
