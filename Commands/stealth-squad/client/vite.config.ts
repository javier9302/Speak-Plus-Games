import { defineConfig } from "vite";

// `host: true` exposes the dev server on the LAN so phones on the same Wi-Fi
// can open http://<laptop-ip>:5173. strictPort keeps the URL predictable.
export default defineConfig({
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
});
