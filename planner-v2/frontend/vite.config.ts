import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/app/",
  plugins: [
    react(),
    VitePWA({
      // prompt + ручной registerSW (lib/pwa) — без тихого авто-reload.
      // Обновление применяет pull-to-refresh-жест (потянул вниз → reload свежего шелла).
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["apple-touch-icon-180.png"],
      manifest: {
        name: "Planner",
        short_name: "Planner",
        id: "/app/",
        start_url: "/app/",
        scope: "/app/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0F0F11",
        theme_color: "#0F0F11",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/],   // API не кэшируем и не подменяем шеллом
        globPatterns: ["**/*.{js,css,html,woff2,png,svg}"],
        // Навигация = NetworkFirst: онлайн всегда тянет свежий index.html → свежие хэши
        // бандла (новый деплой грузится без ручной чистки SW-кэша). Офлайн → кэш-фолбэк.
        runtimeCaching: [
          {
            urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "app-shell",
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } },
  },
  build: { target: "es2022", sourcemap: true },
});
