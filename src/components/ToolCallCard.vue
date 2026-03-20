<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import gsap from 'gsap'
import { CheckCircleOutlined, LoadingOutlined, RightOutlined } from '@ant-design/icons-vue'

interface Props {
  toolId: string
  label: string
  params?: unknown
  result?: unknown
  status: 'running' | 'done'
}

const props = defineProps<Props>()

const cardRef = ref<HTMLElement>()
const bodyRef = ref<HTMLElement>()
const iconWrap = ref<HTMLElement>()
const isOpen = ref(false)

const hasContent = computed(() =>
  (!!props.params && Object.keys(props.params as object).length > 0) || !!props.result,
)

const paramsStr = computed(() =>
  props.params ? JSON.stringify(props.params, null, 2) : '',
)

const resultStr = computed(() => {
  if (!props.result) return ''
  return typeof props.result === 'string' ? props.result : JSON.stringify(props.result, null, 2)
})

// ── 卡片入场 ──────────────────────────────────────────────────────────────
onMounted(() => {
  if (!cardRef.value) return
  gsap.from(cardRef.value, {
    opacity: 0,
    y: 12,
    duration: 0.42,
    ease: 'power3.out',
    clearProps: 'transform,opacity',
  })
})

// ── 运行中 → 完成 动画 ────────────────────────────────────────────────────
watch(
  () => props.status,
  (next) => {
    if (next !== 'done') return
    if (iconWrap.value) {
      gsap.fromTo(
        iconWrap.value,
        { scale: 0.2, opacity: 0, rotation: -20 },
        { scale: 1, opacity: 1, rotation: 0, duration: 0.45, ease: 'back.out(3)' },
      )
    }
    if (cardRef.value) {
      gsap.fromTo(cardRef.value, { scale: 1.025 }, { scale: 1, duration: 0.3, ease: 'back.out(2)' })
    }
  },
)

// ── 展开 / 收起 ────────────────────────────────────────────────────────────
function toggle() {
  if (!hasContent.value || !bodyRef.value) return

  if (!isOpen.value) {
    isOpen.value = true
    bodyRef.value.style.display = 'block'
    bodyRef.value.style.overflow = 'hidden'
    const h = bodyRef.value.scrollHeight
    gsap.fromTo(
      bodyRef.value,
      { height: 0, opacity: 0 },
      {
        height: h, opacity: 1, duration: 0.32, ease: 'power2.out',
        onComplete: () => {
          if (bodyRef.value) { bodyRef.value.style.height = 'auto'; bodyRef.value.style.overflow = '' }
        },
      },
    )
  } else {
    bodyRef.value.style.overflow = 'hidden'
    gsap.to(bodyRef.value, {
      height: 0, opacity: 0, duration: 0.22, ease: 'power2.in',
      onComplete: () => {
        isOpen.value = false
        if (bodyRef.value) { bodyRef.value.style.display = 'none'; bodyRef.value.style.overflow = '' }
      },
    })
  }
}
</script>

<template>
  <div
    ref="cardRef"
    class="relative rounded-[10px] overflow-hidden mb-1.5 last:mb-0 transition-shadow duration-200 hover:shadow-md"
    :class="status === 'running'
      ? 'border border-blue-200 border-l-[3px] border-l-blue-500 bg-gradient-to-r from-blue-50/80 to-white shadow-sm'
      : 'border border-gray-200 border-l-[3px] border-l-green-500 bg-white shadow-sm'"
  >
    <!-- Header -->
    <div
      class="flex items-center gap-2.5 px-3 py-2.5 select-none transition-colors duration-150"
      :class="hasContent ? 'cursor-pointer hover:bg-black/[0.025]' : ''"
      @click="toggle"
    >
      <!-- 状态图标 -->
      <span
        ref="iconWrap"
        class="flex items-center justify-center w-6 h-6 rounded-full text-[13px] shrink-0 transition-colors duration-300"
        :class="status === 'running' ? 'bg-blue-100 text-blue-500' : 'bg-green-100 text-green-600'"
      >
        <LoadingOutlined v-if="status === 'running'" class="animate-spin" />
        <CheckCircleOutlined v-else />
      </span>

      <!-- 工具名称 -->
      <span class="flex-1 text-[13px] font-medium text-gray-800 tracking-[0.1px]">
        {{ label }}
      </span>

      <!-- 状态胶囊 -->
      <span
        class="text-[11px] font-medium px-2 py-0.5 rounded-full leading-[1.6]"
        :class="status === 'running' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'"
      >
        {{ status === 'running' ? '查询中' : '已完成' }}
      </span>

      <!-- 展开箭头 -->
      <span
        v-if="hasContent"
        class="flex items-center text-[11px] text-gray-300 transition-transform duration-250"
        :class="{ 'rotate-90 !text-gray-500': isOpen }"
      >
        <RightOutlined />
      </span>
    </div>

    <!-- Body -->
    <div ref="bodyRef" class="border-t border-gray-100" style="display: none; overflow: hidden">
      <div v-if="paramsStr" class="px-3 pt-2.5 pb-0">
        <p class="m-0 mb-1.5 text-[10px] font-bold tracking-[0.8px] uppercase text-gray-400">
          请求参数
        </p>
        <pre class="code-block params-block">{{ paramsStr }}</pre>
      </div>
      <div v-if="resultStr" class="px-3 pb-2.5" :class="paramsStr ? 'pt-2' : 'pt-2.5'">
        <p class="m-0 mb-1.5 text-[10px] font-bold tracking-[0.8px] uppercase text-gray-400">
          返回结果
        </p>
        <pre class="code-block result-block">{{ resultStr }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* UnoCSS 无法覆盖的部分：代码块样式与滚动条 */
.code-block {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 220px;
  overflow-y: auto;
  line-height: 1.65;
}

.params-block {
  background: #1e1e2e;
  color: #cdd6f4;
}

.result-block {
  background: #f8fafc;
  color: #334155;
  border: 1px solid #e2e8f0;
}

.code-block::-webkit-scrollbar { width: 4px; }
.code-block::-webkit-scrollbar-track { background: transparent; }
.params-block::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 2px; }
.result-block::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
</style>
