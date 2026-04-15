import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 80,
    allowedHosts: ['localhost', 'aiedu.tplinkdns.com'],
    hmr: {
      host: 'aiedu.tplinkdns.com',
      protocol: 'ws',
      clientPort: 6050,
    },
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: 'http://backend:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      }
    }
  },
})