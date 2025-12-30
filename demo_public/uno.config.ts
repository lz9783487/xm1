import { defineConfig } from 'unocss'

export default defineConfig({
  // 配置UnoCSS
  shortcuts: {
    'btn': 'px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors',
  },
  theme: {
    colors: {
      primary: '#3b82f6',
      secondary: '#10b981',
    },
  },
})