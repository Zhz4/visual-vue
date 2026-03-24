import { ref, nextTick } from "vue";
import { useSessionsStore, CURRENT_USER_ID } from "@/stores/sessions";
import type { ThinkingStep } from "@/stores/sessions";

const API_URL =
  (import.meta.env.VITE_API_URL as string) || "http://localhost:8000";
const API_TOKEN =
  (import.meta.env.VITE_API_TOKEN as string) || "Bearer user-token";

export function useChat() {
  const store = useSessionsStore();
  const isLoading = ref(false);
  const thinkingSteps = ref<ThinkingStep[]>([]);

  async function sendMessage(text: string) {
    if (!text.trim() || isLoading.value) return;

    const sessionId = store.activeId;
    store.pushMessage(sessionId, {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    });
    store.setSessionTitle(sessionId, text);

    const assistantId = crypto.randomUUID();
    store.pushMessage(sessionId, {
      id: assistantId,
      role: "assistant",
      content: "",
    });
    thinkingSteps.value = [];
    isLoading.value = true;

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: API_TOKEN,
        },
        body: JSON.stringify({
          message: text,
          user_id: CURRENT_USER_ID,
          thread_id: sessionId,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break outer;
          try {
            const parsed = JSON.parse(raw);
            handlePayload(parsed, sessionId, assistantId);
            if (parsed.object === "tool_call.chunk") {
              await nextTick();
              await new Promise((r) => setTimeout(r, 50));
            }
          } catch {
            // ignore malformed frames
          }
        }
      }

      if (buffer.trim()) {
        const tail = buffer.trim();
        if (tail.startsWith("data: ")) {
          const raw = tail.slice(6).trim();
          if (raw && raw !== "[DONE]") {
            try {
              const parsed = JSON.parse(raw);
              handlePayload(parsed, sessionId, assistantId);
              if (parsed.object === "tool_call.chunk") {
                await nextTick();
                await new Promise((r) => setTimeout(r, 50));
              }
            } catch {
              /* ignore */
            }
          }
        }
      }
      // 流式结束后，将工具调用记录持久化到助手消息上，
      // 避免发送新消息清空 thinkingSteps 后旧消息的工具卡片消失
      if (thinkingSteps.value.length > 0) {
        store.setMessageToolSteps(
          sessionId,
          assistantId,
          [...thinkingSteps.value],
        );
      }
    } catch (e) {
      const errMsg = (e as Error).message;
      const hint =
        errMsg === "Failed to fetch"
          ? `无法连接到 API（${API_URL}），请确认服务已启动。`
          : errMsg;
      store.setMessageContent(sessionId, assistantId, `[错误：${hint}]`);
    } finally {
      isLoading.value = false;
    }
  }

  function handlePayload(
    payload: Record<string, unknown>,
    sessionId: string,
    assistantId: string,
  ) {
    const obj = payload.object as string;

    if (obj === "chat.completion.chunk") {
      const choices = payload.choices as Array<{
        delta: { content?: string };
        finish_reason: string | null;
      }>;
      const token = choices?.[0]?.delta?.content;
      if (token) store.appendToken(sessionId, assistantId, token);
    } else if (obj === "tool_call.chunk") {
      const tc = payload.tool_call as { name: string; arguments: unknown };
      const sess = store.sessions.find((s) => s.id === sessionId);
      const msg = sess?.messages.find((m) => m.id === assistantId);
      thinkingSteps.value.push({
        id: `${payload.id}-call-${tc.name}-${Date.now()}`,
        type: "tool_call",
        name: tc.name,
        data: tc.arguments,
        status: "running",
        contentOffset: msg?.content?.length ?? 0,
      });
    } else if (obj === "tool_result.chunk") {
      const tr = payload.tool_result as { name: string; content: string };
      const callStep = [...thinkingSteps.value]
        .reverse()
        .find((s) => s.name === tr.name && s.type === "tool_call");
      if (callStep) callStep.status = "done";
      thinkingSteps.value.push({
        id: `${payload.id}-result-${tr.name}-${Date.now()}`,
        type: "tool_result",
        name: tr.name,
        data: tr.content,
        status: "done",
      });
    }
  }

  return { isLoading, thinkingSteps, sendMessage };
}
