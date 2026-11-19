import { createApp } from 'vue'
import './style.css'
import App from './AKSP-Toolkit/AKSP-Toolkit.vue'
import { initServiceWorker } from './composables/usePwaUpdate'

// Vite may serve this single-page entry at nested URLs via its HTML fallback.
const basePath = import.meta.env.BASE_URL
const { pathname, search, hash } = window.location
if (pathname !== basePath) {
  window.history.replaceState(window.history.state, '', basePath + search + hash)
}

createApp(App).mount('#app')

// 生产构建下注册 Service Worker（预缓存 + 图片缓存 + 新版本提示）
initServiceWorker()
