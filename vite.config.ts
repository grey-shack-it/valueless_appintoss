import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/kis-api': {
        target: 'https://openapi.koreainvestment.com:9443',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kis-api/, ''),
        secure: false,
      },
    },
  },
});
