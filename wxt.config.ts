import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  outDir: "output",
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
        description: '千寻助手：框选区域分析',
      },
    },
    web_accessible_resources: [{ resources: ["/icon/*"], matches: ["<all_urls>"] }],
  }
});
