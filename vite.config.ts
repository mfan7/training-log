import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// On GitHub Pages the site lives at /<repo-name>/; the deploy workflow sets VITE_BASE.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
});
