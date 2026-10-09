import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import desktopConfig from "../../electrobun.config.ts";
import postcssConfig from "../../postcss.config.ts";

const serverOrigin = process.env.OMNISTUDIO_NEXT_UI_SERVER_ORIGIN ?? process.env.TOONFLOW_UI_SERVER_ORIGIN ?? "http://127.0.0.1:3000";

export default defineConfig({
  cacheDir: process.env.OMNISTUDIO_NEXT_UI_CACHE_DIR ?? process.env.TOONFLOW_UI_CACHE_DIR,
  css: { postcss: postcssConfig },
  define: {
    "import.meta.env.appVersion": JSON.stringify(desktopConfig.app.version),
  },
  server: {
    host: "127.0.0.1",
    fs: {
      allow: [
        fileURLToPath(new URL("./", import.meta.url)),
        fileURLToPath(new URL("../../packages", import.meta.url)),
        fileURLToPath(new URL("../../node_modules", import.meta.url)),
      ],
      deny: [".env", ".env.*", "**/.git/**", "**/*.key", "**/data/**", "**/backup/**", "**/work/**"],
    },
    proxy: {
      "/mcp": { target: serverOrigin, changeOrigin: false },
      "/a2a": { target: serverOrigin, changeOrigin: false },
      "/api": {
        target: serverOrigin,
        changeOrigin: false,
        configure(proxy) {
          proxy.on("proxyReq", (request, incoming) => {
            request.setHeader("x-omnistudio-next-local-client", ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(incoming.socket.remoteAddress ?? "") ? "1" : "0");
          });
        },
      },
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      { find: /^shiki$/, replacement: fileURLToPath(new URL("./src/lib/shiki.ts", import.meta.url)) },
    ],
  },
  build: {
    outDir: "../../build/web",
    emptyOutDir: true,
  },
  plugins: [
    vue(),
    components({
      globsExclude: ["src/components/settings/panels/**/*Dialog.vue"],
      dts: "src/types/components.d.ts",
      resolvers: [
        ElementPlusResolver(),
        (name) => {
          if (name.startsWith("Icon")) return { name, from: "@tabler/icons-vue" };
        },
      ],
    }),
  ],
});
