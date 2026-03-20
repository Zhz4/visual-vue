<script setup lang="ts">
import { ref, computed, nextTick, watch, h, onMounted } from 'vue'
import { marked } from 'marked'
import { useChat } from '@/composables/useChat'
import { useThreads } from '@/composables/useThreads'
import { useSessionsStore } from '@/stores/sessions'
import type { ThinkingStep } from '@/stores/sessions'
import { storeToRefs } from 'pinia'
import { BubbleList, Sender } from 'ant-design-x-vue'
import {
  RobotOutlined,
  UserOutlined,
  LoadingOutlined,
  PlusOutlined,
  DeleteOutlined,
  MessageOutlined,
} from '@ant-design/icons-vue'
import ToolCallCard from '@/components/ToolCallCard.vue'

// ── Store & composables ────────────────────────────────────────────────────
const store = useSessionsStore()
const { sessions, activeId, activeSession } = storeToRefs(store)
const { isLoading, thinkingSteps, sendMessage } = useChat()
const { loadingThreads, loadingMessages, loadThreads, loadMessages, deleteThread } = useThreads()

// 挂载时加载历史会话列表
onMounted(async () => {
  await loadThreads()
  // 加载当前激活会话的消息（若未加载）
  await loadMessages(activeId.value)
})

// 切换会话时懒加载消息
watch(activeId, async (id) => {
  await loadMessages(id)
})

// ── Markdown renderer ──────────────────────────────────────────────────────
marked.setOptions({ breaks: true })

function renderMarkdown(content: string) {
  if (!content) return ''
  return marked.parse(content) as string
}

// ── Tool card helpers ──────────────────────────────────────────────────────
const TOOL_LABELS: Record<string, string> = {
  query_aplus_plans: 'A+ 策划查询',
  query_video_plans: '视频策划查询',
  query_communication_designs: '传达设计查询',
  query_video_photography: '视频摄影查询',
  query_photographer_aplus: '摄影 A+ 查询',
  recall_user_memories: '读取用户偏好',
  save_user_memory: '保存用户偏好',
  delete_user_memory: '删除用户偏好',
  lookup_api_schema: '查询 API 文档',
  lookup_common_enums: '查询枚举值',
}

// 从历史消息内容中解析 <TOOL_CALL> 标签
interface ParsedTool { id: string; name: string; params: Record<string, unknown> }
function parseToolCalls(content: string, msgId: string): ParsedTool[] {
  const re = /<TOOL_CALL>\s*工具:\s*(\w+)\s*参数:\s*(\{.*?\})\s*<\/TOOL_CALL>/gs
  const result: ParsedTool[] = []
  let match: RegExpExecArray | null
  let idx = 0
  while ((match = re.exec(content)) !== null) {
    let params: Record<string, unknown> = {}
    try { params = JSON.parse(match[2]) } catch { /* ignore */ }
    result.push({ id: `${msgId}-tc-${idx++}`, name: match[1], params })
  }
  return result
}

function renderToolCard(
  id: string, name: string, params: unknown,
  status: 'running' | 'done', result: unknown,
) {
  return h(ToolCallCard, {
    key: id,
    toolId: id,
    label: TOOL_LABELS[name] || name,
    params,
    result,
    status,
  })
}

// 渲染助手消息（工具卡片 + 正文）
function renderAssistantMsg(
  msgId: string, content: string, isLast: boolean,
  loading: boolean, steps: ThinkingStep[],
) {
  const nodes: ReturnType<typeof h>[] = []

  if (isLast && steps.length > 0) {
    // 实时对话：用 thinkingSteps 渲染卡片
    for (const step of steps.filter((s) => s.type === 'tool_call')) {
      const res = steps.find((s) => s.type === 'tool_result' && s.name === step.name)
      nodes.push(renderToolCard(step.id, step.name, step.data, step.status, res?.data ?? null))
    }
  } else {
    // 历史消息：解析 <TOOL_CALL> 标签
    for (const t of parseToolCalls(content, msgId)) {
      nodes.push(renderToolCard(t.id, t.name, t.params, 'done', null))
    }
  }

  // 加载占位
  if (isLast && loading && !content) {
    const statusText = steps.some((s) => s.status === 'running')
      ? '正在查询数据...'
      : steps.length > 0 ? '数据处理中...' : '思考中...'
    nodes.push(
      h('div', { class: 'flex items-center gap-1.5 text-[13px] text-gray-400' }, [
        h(LoadingOutlined, { class: 'text-blue-500 animate-spin' }),
        h('span', statusText),
      ]),
    )
  }

  // 正文
  const clean = content.replace(/<TOOL_CALL>[\s\S]*?<\/TOOL_CALL>/g, '').trim()
  if (clean) nodes.push(h('div', { class: 'md-body', innerHTML: renderMarkdown(clean) }))

  return h('div', { class: 'flex flex-col gap-1.5 w-full' }, nodes)
}

// ── Bubble items ───────────────────────────────────────────────────────────
const scrollRef = ref<HTMLElement>()

const bubbleItems = computed(() => {
  const steps = thinkingSteps.value
  const loading = isLoading.value
  const msgs = activeSession.value.messages

  return msgs.map((m, i) => ({
    key: m.id,
    role: m.role,
    content: m.content,
    loading: false,
    messageRender:
      m.role === 'assistant'
        ? () => renderAssistantMsg(m.id, m.content, i === msgs.length - 1, loading, steps)
        : undefined,
  }))
})

const roles = {
  user: {
    placement: 'end' as const,
    avatar: { icon: h(UserOutlined) } as object,
    styles: { content: { background: '#1677ff', color: '#fff', borderRadius: '12px' } },
  },
  assistant: {
    placement: 'start' as const,
    avatar: {
      icon: h(RobotOutlined),
      style: { background: '#e6f4ff', color: '#1677ff' },
    } as object,
  },
}

// ── Auto scroll ────────────────────────────────────────────────────────────
watch(
  [
    () => activeSession.value.messages.map((m) => m.content).join(''),
    () => thinkingSteps.value.length,
    () => thinkingSteps.value.map((s) => s.status).join(''),
  ],
  async () => {
    await nextTick()
    scrollRef.value?.scrollTo({ top: scrollRef.value.scrollHeight, behavior: 'smooth' })
  },
)

// ── Actions ────────────────────────────────────────────────────────────────
const inputValue = ref('')

async function handleSend(text: string) {
  inputValue.value = ''
  await sendMessage(text)
}
</script>

<template>
  <div class="chat-app">
    <!-- ── Sidebar ──────────────────────────────────────────────── -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">对话列表</span>
        <a-button type="primary" size="small" :icon="h(PlusOutlined)" @click="store.addSession">
          新对话
        </a-button>
      </div>

      <div class="session-list">
        <div v-if="loadingThreads" class="session-loading">
          <LoadingOutlined />
          <span>加载中...</span>
        </div>
        <div
          v-for="s in sessions"
          :key="s.id"
          class="session-item"
          :class="{ active: s.id === activeId }"
          @click="store.switchSession(s.id)"
        >
          <MessageOutlined class="session-icon" />
          <span class="session-title">{{ s.title }}</span>
          <a-popconfirm
            title="删除此对话？"
            ok-text="删除"
            cancel-text="取消"
            placement="right"
            @confirm.stop="deleteThread(s.backendThreadId).then(() => store.deleteSession(s.id))"
          >
            <DeleteOutlined class="session-del" @click.stop />
          </a-popconfirm>
        </div>
      </div>
    </aside>

    <!-- ── Main chat area ──────────────────────────────────────── -->
    <div class="chat-main">
      <!-- Header -->
      <div class="chat-header">
        <RobotOutlined class="header-icon" />
        <span class="header-title">视觉设计协同助手</span>
      </div>

      <!-- Messages -->
      <div ref="scrollRef" class="chat-body">
        <!-- 消息加载中 -->
        <div v-if="loadingMessages" class="msg-loading">
          <a-spin tip="加载历史消息..." />
        </div>

        <template v-else>
          <div v-if="activeSession.messages.length === 0" class="chat-welcome">
            <RobotOutlined class="welcome-icon" />
            <h2>你好，我是视觉设计助手</h2>
            <p>有什么可以帮你的吗？</p>
          </div>

          <BubbleList v-else :items="bubbleItems" :roles="roles" />
        </template>

      </div>

      <!-- Input -->
      <div class="chat-footer">
        <Sender
          v-model:value="inputValue"
          :loading="isLoading"
          placeholder="输入消息，按 Enter 发送..."
          @submit="handleSend"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────────── */
.chat-app {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: #f5f7fa;
}

/* ── Sidebar ─────────────────────────────────────────────────────── */
.sidebar {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-right: 1px solid #e8e8e8;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 12px 10px;
  border-bottom: 1px solid #f0f0f0;
}

.sidebar-title {
  font-size: 13px;
  font-weight: 600;
  color: #595959;
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 4px;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}

.session-item:hover {
  background: #f5f5f5;
}

.session-item.active {
  background: #e6f4ff;
}

.session-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  font-size: 12px;
  color: #8c8c8c;
}

.session-icon {
  font-size: 13px;
  color: #8c8c8c;
  flex-shrink: 0;
}

.session-title {
  flex: 1;
  font-size: 13px;
  color: #262626;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-del {
  font-size: 12px;
  color: #bfbfbf;
  opacity: 0;
  transition: opacity 0.15s;
}

.session-item:hover .session-del {
  opacity: 1;
}

/* ── Main area ───────────────────────────────────────────────────── */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.header-icon {
  font-size: 20px;
  color: #1677ff;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}

.chat-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.msg-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-welcome {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #8c8c8c;
  gap: 8px;
}

.welcome-icon {
  font-size: 48px;
  color: #1677ff;
  opacity: 0.6;
}

.chat-welcome h2 {
  font-size: 20px;
  color: #595959;
  margin: 0;
}

.chat-welcome p {
  margin: 0;
  font-size: 14px;
}

/* assistant-msg 和 bubble-status 已改用原子类，scoped 样式仅保留无法用原子类表达的部分 */

/* ── Footer ──────────────────────────────────────────────────────── */
.chat-footer {
  padding: 12px 20px 16px;
  background: #fff;
  border-top: 1px solid #e8e8e8;
}
</style>

<!-- Global: Markdown rendered HTML styles (not scoped) -->
<style>
.md-body {
  line-height: 1.7;
  font-size: 14px;
  color: #262626;
}

.md-body p { margin: 0 0 8px; }
.md-body p:last-child { margin-bottom: 0; }

.md-body h1, .md-body h2, .md-body h3,
.md-body h4, .md-body h5, .md-body h6 {
  margin: 12px 0 6px;
  font-weight: 600;
  line-height: 1.4;
}
.md-body h1 { font-size: 18px; }
.md-body h2 { font-size: 16px; }
.md-body h3 { font-size: 14px; }

.md-body ul, .md-body ol {
  padding-left: 20px;
  margin: 6px 0;
}
.md-body li { margin: 3px 0; }

.md-body code {
  background: #f0f0f0;
  border-radius: 3px;
  padding: 1px 5px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: #c7254e;
}

.md-body pre {
  background: #1e1e1e;
  border-radius: 6px;
  padding: 12px 16px;
  overflow-x: auto;
  margin: 8px 0;
}
.md-body pre code {
  background: none;
  color: #d4d4d4;
  padding: 0;
  font-size: 13px;
}

.md-body blockquote {
  border-left: 3px solid #1677ff;
  padding-left: 12px;
  margin: 8px 0;
  color: #595959;
}

.md-body table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 13px;
}
.md-body th, .md-body td {
  border: 1px solid #d9d9d9;
  padding: 6px 10px;
  text-align: left;
}
.md-body th { background: #fafafa; font-weight: 600; }

.md-body a { color: #1677ff; text-decoration: none; }
.md-body a:hover { text-decoration: underline; }

.md-body hr {
  border: none;
  border-top: 1px solid #e8e8e8;
  margin: 12px 0;
}
</style>
