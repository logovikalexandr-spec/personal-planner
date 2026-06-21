import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/app/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
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
        navigateFallback: "/app/index.html",
        navigateFallbackDenylist: [/^\/api/],   // API не кэшируем и не подменяем шеллом
        globPatterns: ["**/*.{js,css,html,woff2,png,svg}"],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } },
  },
  build: { target: "es2022", sourcemap: true },
});
