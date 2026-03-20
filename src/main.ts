import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'virtual:uno.css'
import './style.css'
import App from './App.vue'
import router from './router'
import AntDesignVue from 'ant-design-vue'
import AntDesignXVue from 'ant-design-x-vue'
import 'ant-design-vue/dist/reset.css'

createApp(App)
  .use(createPinia())
  .use(router)
  .use(AntDesignVue)
  .use(AntDesignXVue)
  .mount('#app')
