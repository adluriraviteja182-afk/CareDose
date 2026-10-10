import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, forward API calls and uploaded tablet photos to the FastAPI server.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true, proxy: { "/api": "http://localhost:8000", "/uploads": "http://localhost:8000" } },
});