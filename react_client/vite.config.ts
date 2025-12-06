// ABOUTME: Vite configuration for React client
// ABOUTME: Configures React and Tailwind CSS plugins with API proxy

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/chat": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
