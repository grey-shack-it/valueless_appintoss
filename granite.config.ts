import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'valueless-kospi',
  brand: {
    displayName: '찮은형의 국장은 지금',
    primaryColor: '#3182F6',
    icon: '',
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
