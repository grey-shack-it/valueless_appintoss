import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'valueless-bro',
  brand: {
    displayName: '국장은 지금',
    primaryColor: '#3182F6',
    icon: 'https://static.toss.im/appsintoss/50851/fe51f72f-b3d9-4221-8434-d1e4d36c2cc7.png',
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
