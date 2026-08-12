import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'valueless-bro',
  brand: {
    displayName: '국장은 지금',
    primaryColor: '#3182F6',
    icon: './src/assets/icon.png',
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite --host',
      build: 'vite build',
    },
  },
  permissions: [],
  outdir: 'dist',
});
