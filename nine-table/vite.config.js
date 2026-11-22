import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds ONE self-contained index.html (all JS inlined) so it can be dropped
// on Netlify / Vercel / GitHub Pages or even opened from a phone.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
});
