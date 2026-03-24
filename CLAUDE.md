# Vue 3 项目开发规范

本规范适用于所有 Vue 3 项目，使用 Vite + TypeScript + Pinia + Vue Router 4 + UnoCSS 技术栈。

---

## 目录结构

```
src/
├── assets/          # 静态资源（图片、字体、全局样式）
├── components/      # 公共可复用组件
│   ├── base/        # 基础原子组件（BaseButton.vue、BaseInput.vue）
│   └── common/      # 通用业务组件
├── composables/     # 可复用的组合式逻辑（useXxx.ts）
├── layouts/         # 布局组件（DefaultLayout.vue）
├── router/          # 路由配置
│   └── index.ts
├── stores/          # Pinia 状态管理（每个域一个文件）
├── types/           # 全局 TypeScript 类型定义
├── utils/           # 纯函数工具（无响应式）
├── views/           # 页面级组件（路由目标）
├── App.vue
└── main.ts
```

**规则**：
- 公共组件放 `components/`，页面放 `views/`，路由配置放 `router/`
- 视图组件不得被其他视图直接引入，只能通过路由访问
- 每个功能模块的私有组件放在该视图目录下，不提升到公共 `components/`

---

## 组件命名

| 场景 | 规范 | 示例 |
|---|---|---|
| SFC 文件名 | PascalCase | `UserProfile.vue` |
| `<template>` 中使用 | PascalCase | `<UserProfile />` |
| 基础/原子组件 | `Base` 前缀 | `BaseButton.vue` |
| 单例组件（全局唯一） | `The` 前缀 | `TheHeader.vue` |
| 子组件 | 父名开头 | `TodoList.vue` → `TodoListItem.vue` |
| 自闭合 | SFC 中自闭合 | `<MyComp />` |

- 组件名**必须多个单词**，禁止单词命名（避免与 HTML 元素冲突）
- 禁止缩写，使用完整单词：`StudentDashboard.vue` 而非 `SdPage.vue`

---

## SFC 文件结构

块顺序固定为：

```vue
<script setup lang="ts">
// 1. imports
// 2. defineProps / defineEmits / defineModel
// 3. inject、useRoute、store hooks
// 4. ref / reactive 状态
// 5. computed
// 6. composables 调用
// 7. 生命周期钩子（onMounted 等）
// 8. 方法 / 事件处理
// 9. watch / watchEffect
</script>

<template>
  ...
</template>

<style scoped>
  ...
</style>
```

---

## Composition API

- **必须使用 `<script setup lang="ts">`**，禁止使用 Options API 或 `export default defineComponent()`
- 组合式函数（composable）命名以 `use` 开头，放在 `composables/`
- composable 返回**普通对象包裹 ref**，而非 reactive 对象，保证解构后响应性
- 在 `onUnmounted()` 中清理副作用（事件监听、定时器等）

```typescript
// composables/useFetch.ts
export function useFetch(url: MaybeRefOrGetter<string>) {
  const data = ref(null)
  const error = ref(null)

  watchEffect(() => {
    fetch(toValue(url))
      .then(r => r.json())
      .then(d => (data.value = d))
      .catch(e => (error.value = e))
  })

  return { data, error }   // ✅ 返回普通对象，解构可保留响应性
}
```

---

## Props 与 Emits

```typescript
// Props 用 interface + withDefaults
interface Props {
  title: string
  count?: number
}
const props = withDefaults(defineProps<Props>(), { count: 0 })

// Emits 用 TypeScript 泛型
const emit = defineEmits<{
  'update:value': [value: string]
  delete: [id: number]
}>()
```

- Props 在 JS/TS 中用 camelCase，在模板中传值用 kebab-case（`:greeting-text`）
- Event 名称用 kebab-case：`update-user`、`item-deleted`
- 双向绑定使用 `defineModel()`（Vue 3.4+）
- 模板中禁止写复杂表达式，移入 computed

---

## 组件通信优先级

| 方式 | 适用场景 |
|---|---|
| Props + Emits | 父子直接通信 |
| `v-model` / `defineModel` | 双向绑定 |
| `provide` / `inject` | 深层祖先→后代，避免 prop drilling |
| Pinia store | 跨组件树 / 全局状态 |
| Composables | 共享带状态的逻辑 |

---

## Pinia 状态管理

- 每个业务域一个 store 文件，放在 `stores/`
- 命名规范：`useUserStore`、`useCartStore`（遵循 composable 命名）
- **使用 Composition API 风格**（而非 Options 风格）

```typescript
// stores/user.ts
export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const isLoggedIn = computed(() => user.value !== null)

  async function fetchUser(id: number) {
    user.value = await api.getUser(id)
  }

  return { user, isLoggedIn, fetchUser }
})
```

- 解构 store 时用 `storeToRefs()` 保持响应性
- 多字段批量更新用 `$patch()`
- 为 state 定义明确的 TypeScript interface

---

## Vue Router 4

- **所有路由组件必须懒加载**：`component: () => import('@/views/HomeView.vue')`
- 路由组件用 `defineAsyncComponent` 是错误用法，路由专用 `() => import()`
- 使用命名路由进行编程式导航
- 路由级别的元信息（权限、面包屑）放在 `meta` 字段

```typescript
// router/index.ts
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/dashboard',
      name: 'Dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { requiresAuth: true },
    },
  ],
})
```

---

## TypeScript 规范

- `tsconfig.json` 必须开启 `"strict": true`
- 全局共享类型放 `src/types/`，组件内部类型留在组件文件中
- 禁止使用 `any`，用 `unknown` + 类型收窄代替

---

## 样式规范（原子 CSS UnoCSS）

本项目使用 **UnoCSS** 作为唯一样式方案。所有样式必须用原子类直接写在模板中，禁止在 `<style scoped>` 里重复描述可原子化的属性。

### 核心原则

| 原则 | 说明 |
|---|---|
| **原子类优先** | 所有布局、间距、颜色、字号等直接用 UnoCSS 原子类 |
| **禁止 scoped 重复** | 凡是能用原子类表达的，不得写进 `<style scoped>` |
| **合法例外** | 以下情况才允许保留 `<style scoped>` |
| **全局样式** | 仅 `src/style.css`，用于 CSS 变量和 `innerHTML` 动态内容 |

### 合法的 `<style scoped>` 例外

只有以下情况才允许写 scoped 样式：

```css
/* ✅ 1. 自定义字体族（UnoCSS 无内置工具类） */
.code-block { font-family: 'JetBrains Mono', 'Fira Code', monospace; }

/* ✅ 2. webkit 滚动条定制 */
.code-block::-webkit-scrollbar { width: 4px; }
.code-block::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); }

/* ✅ 3. 第三方组件深层穿透 */
:deep(.ant-btn) { border-radius: 6px; }

/* ✅ 4. 复杂 CSS 动画 @keyframes */
@keyframes slide-in { from { transform: translateY(12px); opacity: 0; } }
```

### UnoCSS 常用写法速查

**布局**
```html
<!-- Flex -->
<div class="flex items-center justify-between gap-2">
<div class="flex flex-col gap-4">
<div class="flex-1 min-w-0">   <!-- flex 子项自适应，防溢出 -->

<!-- 固定尺寸 -->
<div class="w-[220px] h-screen overflow-hidden">

<!-- Grid -->
<div class="grid grid-cols-2 gap-4">
```

**间距**
```html
<div class="p-4 px-5 py-3 pt-[14px] pb-[10px]">   <!-- 标准 / 任意值 -->
<div class="m-0 mt-2 mb-4">
```

**颜色（优先用设计系统色，特殊色用任意值）**
```html
<div class="bg-white text-gray-800 border border-gray-200">
<div class="bg-[#f5f7fa] text-[#595959] border-[#e8e8e8]">  <!-- 任意色值 -->
<div class="text-[#1677ff]">   <!-- Ant Design 主色 -->
```

**字体**
```html
<span class="text-sm font-medium">          <!-- text-sm = 14px -->
<span class="text-[13px] font-semibold">    <!-- 任意字号 -->
<span class="text-[16px] font-bold text-[#1a1a1a]">
```

**状态与交互**
```html
<!-- hover -->
<div class="hover:bg-[#f5f5f5] transition-colors duration-150">

<!-- group hover（父悬停控制子元素） -->
<div class="group">                                          <!-- 父加 group -->
  <span class="opacity-0 group-hover:opacity-100 transition-opacity duration-150">  <!-- 子响应 -->

<!-- 条件类（active 状态） -->
<div :class="{ 'bg-[#e6f4ff]': isActive }">
```

**阴影 / 圆角 / 边框**
```html
<div class="rounded-lg shadow-sm border border-gray-100">
<div class="rounded-[10px] shadow-[0_1px_4px_rgba(0,0,0,0.06)]">  <!-- 任意值 -->
<div class="border-l-[3px] border-l-blue-500">                    <!-- 单侧边框 -->
```

**文字截断**
```html
<span class="overflow-hidden text-ellipsis whitespace-nowrap flex-1">
```

**图标尺寸（Ant Design Icons）**
```html
<RobotOutlined class="text-[20px] text-[#1677ff]" />
<DeleteOutlined class="text-[12px] text-[#bfbfbf]" />
```

### 全局 style.css 只写这两类

```css
/* 1. CSS 设计 token（颜色变量、字体变量） */
:root {
  --accent: #aa3bff;
  --sans: system-ui, 'Segoe UI', Roboto, sans-serif;
}

/* 2. innerHTML 动态内容样式（UnoCSS 无法扫描到） */
.md-body p { margin: 0 0 8px; }
.md-body code { background: #f0f0f0; }
```

**禁止**在 style.css 中写组件布局类样式（如 `#app`、`.sidebar` 等）。

### 反例

```vue
<!-- ❌ 错误：在 scoped 里写本可用原子类的样式 -->
<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: 220px;
  background: #fff;
}
</style>

<!-- ✅ 正确：直接用原子类 -->
<aside class="flex flex-col w-[220px] bg-white">
```

---

## 性能规范

- 大型组件（弹窗、图表、地图）用 `defineAsyncComponent()` 异步加载
- 使用 `lodash-es` 而非 `lodash`（支持 tree-shaking）
- 大列表必须虚拟化（`vue-virtual-scroller`），禁止渲染超过 500 条 DOM
- 基本不变的大数据对象用 `shallowRef()` / `shallowReactive()`
- 静态内容用 `v-once`，条件更新的大子树用 `v-memo`

---

## AI 组件库

本项目 AI 相关组件**优先使用 [antd-design-x-vue](https://antd-design-x-vue.netlify.app)**，能用该库的就用该库，不要自己手写。

常见 AI 场景对应组件：

| 场景 | 组件 |
|---|---|
| 对话气泡 | `Bubble` / `BubbleList` |
| 输入框（带发送按钮） | `Sender` |
| 思考中状态 | `Thinking` |
| 欢迎页 | `Welcome` |
| 提示词建议 | `Prompts` |
| 模型请求管理 | `useXAgent` |
| 对话消息流 | `useXChat` |
| 流式输出 | `XStream` / `XRequest` |
| 附件上传 | `Attachments` |
| 会话管理 | `Conversations` |

安装方式：

```bash
npm install antd-design-x-vue
```

引入方式：

```typescript
import { Bubble, Sender } from 'antd-design-x-vue'
import 'antd-design-x-vue/dist/antd-design-x-vue.css'
```

---

## 禁止事项

- 禁止在 `views/` 中直接 import 另一个 `views/` 的组件
- 禁止在条件语句或异步回调中调用 composable
- 禁止在模板中写复杂逻辑表达式
- 禁止组件名单个单词
- 禁止路由组件同步 import（必须懒加载）
- 禁止在 `<style scoped>` 中修改 `html`、`body`
