import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    UnoCSS(),
    vue(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('ant-design-x-vue')) return 'antd-x'
          if (id.includes('ant-design-vue') || id.includes('@ant-design')) return 'antd'
          if (id.includes('vue-router') || id.includes('node_modules/vue')) return 'vue-vendor'
        },
      },
    },
  },
})
