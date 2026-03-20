import { ref } from 'vue'
import { useSessionsStore, CURRENT_USER_ID } from '@/stores/sessions'
import type { ChatMessage } from '@/stores/sessions'

const API_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000'
const API_TOKEN = (import.meta.env.VITE_API_TOKEN as string) || 'Bearer user-token'

interface ThreadItem {
  thread_id: string
  checkpoint_count: number
  latest_checkpoint_id: string
  title: string
}

interface MessageItem {
  role: string
  content: string
}

export function useThreads() {
  const store = useSessionsStore()
  const loadingThreads = ref(false)
  const loadingMessages = ref(false)

  /** 从后端加载当前用户的历史会话并合并到 store */
  async function loadThreads() {
    loadingThreads.value = true
    try {
      const res = await fetch(`${API_URL}/threads?user_id=${encodeURIComponent(CURRENT_USER_ID)}`, {
        headers: { Authorization: API_TOKEN },
      })
      if (!res.ok) return
      const data: { total: number; threads: ThreadItem[] } = await res.json()

      const prefix = `${CURRENT_USER_ID}-`
      const mapped = data.threads
        .filter((t) => t.thread_id.startsWith(prefix))
        .map((t) => ({
          id: t.thread_id.slice(prefix.length),
          backendThreadId: t.thread_id,
          title: t.title || '新对话',
          createdAt: Date.now(),
        }))

      store.mergeBackendSessions(mapped)
    } catch {
      // 服务未启动时静默忽略
    } finally {
      loadingThreads.value = false
    }
  }

  /** 懒加载指定会话的历史消息 */
  async function loadMessages(sessionId: string) {
    const session = store.sessions.find((s) => s.id === sessionId)
    if (!session || session.messagesLoaded) return

    loadingMessages.value = true
    try {
      const threadId = session.backendThreadId
      const url = `${API_URL}/threads/${threadId}/messages?limit=500`
      const res = await fetch(url, {
        headers: { Authorization: API_TOKEN },
      })
      if (!res.ok) {
        session.messagesLoaded = true // 404 等错误，标记已处理
        return
      }
      const data: { messages: MessageItem[] } = await res.json()

      const msgs: ChatMessage[] = data.messages.map((m) => ({
        id: crypto.randomUUID(),
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      store.setMessages(sessionId, msgs)
    } catch {
      // 加载失败时将消息标记为已尝试，避免重复请求
      const s = store.sessions.find((s) => s.id === sessionId)
      if (s) s.messagesLoaded = true
    } finally {
      loadingMessages.value = false
    }
  }

  /** 删除后端指定会话的所有 checkpoint */
  async function deleteThread(backendThreadId: string) {
    try {
      await fetch(`${API_URL}/threads/${encodeURIComponent(backendThreadId)}`, {
        method: 'DELETE',
        headers: { Authorization: API_TOKEN },
      })
    } catch {
      // 删除失败时静默忽略，前端侧已移除
    }
  }

  return { loadingThreads, loadingMessages, loadThreads, loadMessages, deleteThread }
}
