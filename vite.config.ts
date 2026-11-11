import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: '127.0.0.1',
    // Rust/bundle HTML and QA artifacts must not reload an editing WebView.
    watch: { ignored: ['**/src-tauri/**','**/output/**','**/zips/**','**/public/video-library/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { target: 'es2022' },
});
