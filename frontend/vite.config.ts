import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // 资源路径与 PWA scope 使用 AKSP-Toolkit 的项目子路径。
  base: "/AKSP-Toolkit/",
  build: {
    rolldownOptions: {
      input: {
        toolkit: path.resolve(__dirname, "index.html"),
        backup: path.resolve(__dirname, "backup.html"),
      },
    },
  },
  plugins: [
    vue(),
    VitePWA({
      // 由 src/composables/usePwaUpdate.js 手动注册，便于提示“新版本可用”
      injectRegister: false,
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icons.svg"],
      manifest: {
        name: "AKSP-Toolkit",
        short_name: "AKSP-Toolkit",
        description: "明日方舟卫戍协议盟约、干员与编队工具",
        lang: "zh-CN",
        theme_color: "#121212",
        background_color: "#121212",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        // 预缓存应用外壳：index.html + 构建产物，二次访问与离线都能直接用
        globPatterns: ["**/*.{js,css,html,svg,ico,woff,woff2}"],
        // 干员头像共 14MB / 345 张，不进预缓存，改走运行时缓存
        globIgnores: ["**/resource/**"],
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/\/backup\.html$/],
        runtimeCaching: [
          {
            // 头像与盟约图标：命中缓存直接返回（文件名稳定，适合 CacheFirst）
            urlPattern: /\/resource\/image\/.*\.(?:png|jpe?g|webp|svg)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "arknights-images",
              expiration: {
                maxEntries: 400,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
  },
});
