<script setup lang="ts">
import { ref, computed, nextTick, watch, h, onMounted } from "vue";
import { marked } from "marked";
import { useChat } from "@/composables/useChat";
import { useThreads } from "@/composables/useThreads";
import { useSessionsStore } from "@/stores/sessions";
import type { ThinkingStep } from "@/stores/sessions";
import { storeToRefs } from "pinia";
import { BubbleList, Sender } from "ant-design-x-vue";
import {
  RobotOutlined,
  UserOutlined,
  LoadingOutlined,
} from "@ant-design/icons-vue";
import ToolCallCard from "@/components/ToolCallCard.vue";
import ChatSidebar from "@/components/ChatSidebar.vue";
import ChatWelcome from "@/components/ChatWelcome.vue";
import { TOOL_LABELS } from "@/constants/index";

// ── Store & composables ────────────────────────────────────────────────────
const store = useSessionsStore();
const { activeId, activeSession } = storeToRefs(store);
const { isLoading, thinkingSteps, sendMessage, lastTokenLen } = useChat();
const { loadingThreads, loadingMessages, loadThreads, loadMessages } =
  useThreads();

onMounted(async () => {
  await loadThreads();
  // 仅当后端无任何历史会话时才创建新对话
  if (store.sessions.length === 0) {
    store.addSession();
  }
  await loadMessages(activeId.value);
});

watch(activeId, async (id) => {
  await loadMessages(id);
});

// ── Markdown renderer ──────────────────────────────────────────────────────
marked.setOptions({ breaks: true });

function renderMarkdown(content: string) {
  if (!content) return "";
  return marked.parse(content) as string;
}

function injectFadeIn(html: string, fadeLen: number): string {
  if (fadeLen <= 0 || !html) return html;
  const m = html.match(/^([\s\S]*?)([^<]*)((?:<\/[a-zA-Z0-9]+>\s*)*)$/);
  if (!m || !m[2]) return html;
  const [, prefix, lastText, closingTags] = m;
  const n = Math.min(fadeLen, lastText.length);
  return (
    prefix +
    lastText.slice(0, -n) +
    `<span class="token-fade-in">${lastText.slice(-n)}</span>` +
    closingTags
  );
}

function getToolLabel(name: string, params: unknown): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  if (name === "query_module" && params && typeof params === "object") {
    const mod = (params as Record<string, unknown>).module;
    if (mod && typeof mod === "string") return `查询${mod}`;
  }
  return name;
}

function renderToolCard(
  id: string,
  name: string,
  params: unknown,
  status: "running" | "done",
  result: unknown,
) {
  return h(ToolCallCard, {
    key: id,
    toolId: id,
    label: getToolLabel(name, params),
    params,
    result,
    status,
  });
}

function renderAssistantMsg(
  msgId: string,
  content: string,
  isLast: boolean,
  loading: boolean,
  steps: ThinkingStep[],
) {
  const nodes: ReturnType<typeof h>[] = [];
  const isStreaming = isLast && loading;

  if (steps.length > 0) {
    // 有工具步骤（流式场景或已保存的历史步骤）：根据 contentOffset 将文字与工具卡片交替渲染
    let lastOffset = 0;
    const toolCalls = steps.filter((s) => s.type === "tool_call");

    for (let i = 0; i < toolCalls.length; i++) {
      const step = toolCalls[i];
      const offset = step.contentOffset ?? lastOffset;

      const textSegment = content.substring(lastOffset, offset).trim();
      if (textSegment) {
        nodes.push(
          h("div", {
            class: "md-body",
            innerHTML: renderMarkdown(textSegment),
          }),
        );
      }
      lastOffset = offset;

      const stepIdx = steps.indexOf(step);
      const res = steps
        .slice(stepIdx + 1)
        .find((s) => s.type === "tool_result" && s.name === step.name);
      nodes.push(
        renderToolCard(
          step.id,
          step.name,
          step.data,
          step.status,
          res?.data ?? null,
        ),
      );
    }

    const remaining = content.substring(lastOffset).trim();

    if (loading && !remaining) {
      const statusText = steps.some((s) => s.status === "running")
        ? "正在查询数据..."
        : "数据处理中...";
      nodes.push(
        h(
          "div",
          { class: "flex items-center gap-1.5 text-[13px] text-gray-400" },
          [
            h(LoadingOutlined, { class: "text-blue-500 animate-spin" }),
            h("span", statusText),
          ],
        ),
      );
    }

    if (remaining) {
      const html = renderMarkdown(remaining);
      nodes.push(
        h("div", {
          class: "md-body",
          innerHTML: isStreaming ? injectFadeIn(html, lastTokenLen.value) : html,
        }),
      );
    }
  } else {
    // 历史消息：按 <TOOL_CALL> 位置交替渲染文字与工具卡片
    const re =
      /<TOOL_CALL>\s*工具:\s*(\w+)\s*参数:\s*(\{.*?\})\s*<\/TOOL_CALL>/gs;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let idx = 0;

    while ((match = re.exec(content)) !== null) {
      const textBefore = content.substring(lastIndex, match.index).trim();
      if (textBefore) {
        nodes.push(
          h("div", { class: "md-body", innerHTML: renderMarkdown(textBefore) }),
        );
      }
      let params: Record<string, unknown> = {};
      try {
        params = JSON.parse(match[2]);
      } catch {
        /* ignore */
      }
      nodes.push(
        renderToolCard(`${msgId}-tc-${idx++}`, match[1], params, "done", null),
      );
      lastIndex = match.index + match[0].length;
    }

    const remaining = content.substring(lastIndex).trim();

    if (isLast && loading && !remaining) {
      nodes.push(
        h(
          "div",
          { class: "flex items-center gap-1.5 text-[13px] text-gray-400" },
          [
            h(LoadingOutlined, { class: "text-blue-500 animate-spin" }),
            h("span", "思考中..."),
          ],
        ),
      );
    }

    if (remaining) {
      const html = renderMarkdown(remaining);
      nodes.push(
        h("div", {
          class: "md-body",
          innerHTML: isStreaming ? injectFadeIn(html, lastTokenLen.value) : html,
        }),
      );
    }
  }

  return h(
    "div",
    { class: `flex flex-col gap-1.5 w-full${isStreaming ? " streaming" : ""}` },
    nodes,
  );
}

// ── Bubble items ───────────────────────────────────────────────────────────
const scrollRef = ref<HTMLElement>();

const bubbleItems = computed(() => {
  const steps = thinkingSteps.value;
  const loading = isLoading.value;
  const msgs = activeSession.value.messages;

  return msgs.map((m, i) => {
    const isLast = i === msgs.length - 1;
    const msgSteps = isLast ? steps : (m.toolSteps ?? []);
    return {
      key: m.id,
      role: m.role,
      content: m.content,
      loading: false,
      messageRender:
        m.role === "assistant"
          ? () => renderAssistantMsg(m.id, m.content, isLast, loading, msgSteps)
          : undefined,
    };
  });
});

const roles = {
  user: {
    placement: "end" as const,
    avatar: { icon: h(UserOutlined) } as object,
    styles: {
      content: { background: "#1677ff", color: "#fff", borderRadius: "12px" },
    },
  },
  assistant: {
    placement: "start" as const,
    avatar: {
      icon: h(RobotOutlined),
      style: { background: "#e6f4ff", color: "#1677ff" },
    } as object,
  },
};

// ── Auto scroll ────────────────────────────────────────────────────────────
watch(
  [
    () => activeSession.value.messages.map((m) => m.content).join(""),
    () => thinkingSteps.value.length,
    () => thinkingSteps.value.map((s) => s.status).join(""),
  ],
  async () => {
    await nextTick();
    scrollRef.value?.scrollTo({
      top: scrollRef.value.scrollHeight,
      behavior: "smooth",
    });
  },
);

// ── Actions ────────────────────────────────────────────────────────────────
const inputValue = ref("");

async function handleSend(text: string) {
  inputValue.value = "";
  await sendMessage(text);
}
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-[#f5f7fa]">
    <ChatSidebar :loading-threads="loadingThreads" />

    <div class="flex-1 flex flex-col min-w-0">
      <!-- Header -->
      <div
        class="flex items-center gap-[10px] px-5 py-3 bg-white border-b border-[#e8e8e8] shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
      >
        <RobotOutlined class="text-[20px] text-[#1677ff]" />
        <span class="text-[16px] font-semibold text-[#1a1a1a]"
          >视觉设计协同助手</span
        >
      </div>

      <!-- Messages -->
      <div
        ref="scrollRef"
        class="flex-1 overflow-y-auto p-5 flex flex-col gap-3"
      >
        <div
          v-if="loadingMessages"
          class="flex-1 flex items-center justify-center"
        >
          <a-spin tip="加载历史消息..." />
        </div>

        <template v-else>
          <ChatWelcome v-if="activeSession.messages.length === 0" />
          <BubbleList v-else :items="bubbleItems" :roles="roles" />
        </template>
      </div>

      <!-- Input -->
      <div class="px-5 pt-3 pb-4 bg-white border-t border-[#e8e8e8]">
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
