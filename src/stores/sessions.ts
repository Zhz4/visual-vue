import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface ThinkingStep {
  id: string
  type: 'tool_call' | 'tool_result'
  name: string
  data: unknown
  status: 'running' | 'done'
  contentOffset?: number
}

export interface Session {
  id: string
  /** 后端存储的 thread key，格式为 `{user_id}-{thread_id}`，如 default-abc123 */
  backendThreadId: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  /** 消息是否已从后端加载 */
  messagesLoaded: boolean
}

const CURRENT_USER_ID = (import.meta.env.VITE_USER_ID as string) || 'default'

export { CURRENT_USER_ID }

function newSession(): Session {
  const id = crypto.randomUUID()
  return {
    id,
    backendThreadId: `${CURRENT_USER_ID}-${id}`,
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
    messagesLoaded: true, // 新建的无需从后端加载
  }
}

const EMPTY_SESSION: Session = {
  id: '',
  backendThreadId: '',
  title: '',
  messages: [],
  createdAt: 0,
  messagesLoaded: true,
}

export const useSessionsStore = defineStore('sessions', () => {
  const sessions = ref<Session[]>([])
  const activeId = ref('')

  const activeSession = computed(
    () => sessions.value.find((s) => s.id === activeId.value) ?? sessions.value[0] ?? EMPTY_SESSION
  )

  function addSession() {
    const s = newSession()
    sessions.value.unshift(s)
    activeId.value = s.id
    return s
  }

  function switchSession(id: string) {
    activeId.value = id
  }

  function deleteSession(id: string) {
    const idx = sessions.value.findIndex((s) => s.id === id)
    if (idx === -1) return
    sessions.value.splice(idx, 1)
    if (sessions.value.length === 0) {
      const s = newSession()
      sessions.value.push(s)
    }
    if (activeId.value === id) activeId.value = sessions.value[0].id
  }

  /** 合并后端历史会话（去重） */
  function mergeBackendSessions(list: Omit<Session, 'messages' | 'messagesLoaded'>[]) {
    for (const item of list) {
      const exists = sessions.value.find((s) => s.id === item.id)
      if (!exists) {
        sessions.value.push({ ...item, messages: [], messagesLoaded: false })
      }
    }
    // 按 createdAt 倒序
    sessions.value.sort((a, b) => b.createdAt - a.createdAt)
    // 若当前 activeId 无效，自动选中排序后的第一个会话
    if (sessions.value.length > 0 && !sessions.value.find((s) => s.id === activeId.value)) {
      activeId.value = sessions.value[0].id
    }
  }

  function setMessages(sessionId: string, msgs: ChatMessage[]) {
    const s = sessions.value.find((s) => s.id === sessionId)
    if (!s) return
    s.messages = msgs
    s.messagesLoaded = true
    const firstUser = msgs.find((m) => m.role === 'user')
    if (firstUser && s.title === '新对话') s.title = firstUser.content.slice(0, 20)
  }

  function pushMessage(sessionId: string, msg: ChatMessage) {
    const s = sessions.value.find((s) => s.id === sessionId)
    if (s) s.messages.push(msg)
  }

  function appendToken(sessionId: string, msgId: string, token: string) {
    const s = sessions.value.find((s) => s.id === sessionId)
    const msg = s?.messages.find((m) => m.id === msgId)
    if (msg) msg.content += token
  }

  function setMessageContent(sessionId: string, msgId: string, content: string) {
    const s = sessions.value.find((s) => s.id === sessionId)
    const msg = s?.messages.find((m) => m.id === msgId)
    if (msg) msg.content = content
  }

  function setSessionTitle(sessionId: string, title: string) {
    const s = sessions.value.find((s) => s.id === sessionId)
    if (s && s.title === '新对话') s.title = title.slice(0, 20)
  }

  return {
    sessions,
    activeId,
    activeSession,
    addSession,
    switchSession,
    deleteSession,
    mergeBackendSessions,
    setMessages,
    pushMessage,
    appendToken,
    setMessageContent,
    setSessionTitle,
  }
})
