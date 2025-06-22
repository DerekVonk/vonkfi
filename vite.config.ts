import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from 'url';
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { visualizer } from "rollup-plugin-visualizer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
    // Bundle analyzer - only in build mode
    ...(process.env.ANALYZE === "true"
      ? [
          visualizer({
            filename: "dist/bundle-analysis.html",
            open: true,
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    // Optimize bundle size
    rollupOptions: {
      output: {
        // Split vendor code
        manualChunks: {
          // Core React dependencies
          react: ["react", "react-dom"],
          // UI libraries
          "radix-ui": [
            "@radix-ui/react-accordion",
            "@radix-ui/react-alert-dialog",
            "@radix-ui/react-aspect-ratio",
            "@radix-ui/react-avatar",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-collapsible",
            "@radix-ui/react-context-menu",
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-hover-card",
            "@radix-ui/react-label",
            "@radix-ui/react-menubar",
            "@radix-ui/react-navigation-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-progress",
            "@radix-ui/react-radio-group",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-select",
            "@radix-ui/react-separator",
            "@radix-ui/react-slider",
            "@radix-ui/react-slot",
            "@radix-ui/react-switch",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-toggle",
            "@radix-ui/react-toggle-group",
            "@radix-ui/react-tooltip",
          ],
          // Charts and visualization
          charts: ["recharts"],
          // Form handling
          forms: ["react-hook-form", "@hookform/resolvers"],
          // Date utilities
          dates: ["date-fns"],
          // Query and state management
          query: ["@tanstack/react-query"],
          // Routing
          routing: ["wouter"],
          // Icons
          icons: ["lucide-react", "react-icons"],
          // Animation
          motion: ["framer-motion", "embla-carousel-react"],
          // Utilities
          utils: ["clsx", "tailwind-merge", "class-variance-authority", "zod"],
        },
      },
    },
    // Enable minification
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1600,
    // Generate source maps for production debugging
    sourcemap: false,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "@tanstack/react-query",
      "wouter",
      "lodash",
      "lodash/get",
      "lodash/isFunction",
      "lodash/sortBy",
      "lodash/isNil",
      "lodash/throttle",
      "lodash/isObject",
      "lodash/last",
      "lodash/upperFirst",
      "lodash/maxBy",
      "lodash/minBy",
      "lodash/isEqual",
      "lodash/omit",
      "lodash/range",
      "lodash/first",
      "lodash/isNaN",
      "lodash/max",
      "lodash/min",
      "lodash/sumBy",
      "lodash/isNumber",
      "lodash/isString",
      "lodash/uniqBy",
      "lodash/flatMap",
      "lodash/isPlainObject",
      "lodash/isBoolean",
      "lodash/every",
      "lodash/find",
      "lodash/mapValues",
      "lodash/some",
    ],
    exclude: [
      // Large dependencies that should be lazy loaded
    ],
  },
});
