import { resolve } from "node:path";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  outDir: "output",
  hooks: {
    // One translation file serves the content script, the background worker
    // and the static settings/viewer pages, so copy it next to those pages.
    'build:publicAssets': (wxt, files) => {
      files.push({
        absoluteSrc: resolve(wxt.config.srcDir, 'integrations/image-lens/i18n.js'),
        relativeDest: 'image-lens/i18n.js',
      });
    },
  },
  vite: () => ({
    optimizeDeps: {
      entries: ["src/entrypoints/popup/index.html"],
    },
  }),
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'zh_CN',
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      96: '/icon/96.png',
      128: '/icon/128.png',
    },
    host_permissions: ["<all_urls>"],
    permissions: ["activeTab", "downloads", "scripting", "storage", "contextMenus", "identity"],
    options_page: "image-lens/options.html",
    commands: {
      'select-region': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: '图透镜：区域框选',
      },
    },
    web_accessible_resources: [{ resources: ["/icon/*"], matches: ["<all_urls>"] }],
  }
});
