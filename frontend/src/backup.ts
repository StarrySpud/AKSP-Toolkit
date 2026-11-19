import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { initServiceWorker } from './composables/usePwaUpdate'

createApp(App).mount('#app')
initServiceWorker()
