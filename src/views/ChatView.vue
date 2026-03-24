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
  PlusOutlined,
  DeleteOutlined,
  MessageOutlined,
} from "@ant-design/icons-vue";
import ToolCallCard from "@/components/ToolCallCard.vue";

// ── Store & composables ────────────────────────────────────────────────────
const store = useSessionsStore();
const { sessions, activeId, activeSession } = storeToRefs(store);
const { isLoading, thinkingSteps, sendMessage } = useChat();
const {
  loadingThreads,
  loadingMessages,
  loadThreads,
  loadMessages,
  deleteThread,
} = useThreads();

// 挂载时加载历史会话列表
onMounted(async () => {
  await loadThreads();
  // 加载当前激活会话的消息（若未加载）
  await loadMessages(activeId.value);
});

// 切换会话时懒加载消息
watch(activeId, async (id) => {
  await loadMessages(id);
});

// ── Markdown renderer ──────────────────────────────────────────────────────
marked.setOptions({ breaks: true });

function renderMarkdown(content: string) {
  if (!content) return "";
  return marked.parse(content) as string;
}

// ── Tool card helpers ──────────────────────────────────────────────────────
const TOOL_LABELS: Record<string, string> = {
  query_aplus_plans: "A+ 策划查询",
  query_video_plans: "视频策划查询",
  query_communication_designs: "传达设计查询",
  query_video_photography: "视频摄影查询",
  query_photographer_aplus: "摄影 A+ 查询",
  recall_user_memories: "读取用户偏好",
  save_user_memory: "保存用户偏好",
  delete_user_memory: "删除用户偏好",
  lookup_api_schema: "查询 API 文档",
  lookup_common_enums: "查询枚举值",
  get_current_time: "获取当前时间",
};

// 从历史消息内容中解析 <TOOL_CALL> 标签
interface ParsedTool {
  id: string;
  name: string;
  params: Record<string, unknown>;
}
function parseToolCalls(content: string, msgId: string): ParsedTool[] {
  const re =
    /<TOOL_CALL>\s*工具:\s*(\w+)\s*参数:\s*(\{.*?\})\s*<\/TOOL_CALL>/gs;
  const result: ParsedTool[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = re.exec(content)) !== null) {
    let params: Record<string, unknown> = {};
    try {
      params = JSON.parse(match[2]);
    } catch {
      /* ignore */
    }
    result.push({ id: `${msgId}-tc-${idx++}`, name: match[1], params });
  }
  return result;
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
    label: TOOL_LABELS[name] || name,
    params,
    result,
    status,
  });
}

// 渲染助手消息（工具卡片 + 正文）
function renderAssistantMsg(
  msgId: string,
  content: string,
  isLast: boolean,
  loading: boolean,
  steps: ThinkingStep[],
) {
  const nodes: ReturnType<typeof h>[] = [];

  if (isLast && steps.length > 0) {
    // 实时对话：用 thinkingSteps 渲染卡片
    for (const step of steps.filter((s) => s.type === "tool_call")) {
      const res = steps.find(
        (s) => s.type === "tool_result" && s.name === step.name,
      );
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
  } else {
    // 历史消息：解析 <TOOL_CALL> 标签
    for (const t of parseToolCalls(content, msgId)) {
      nodes.push(renderToolCard(t.id, t.name, t.params, "done", null));
    }
  }

  // 加载占位
  if (isLast && loading && !content) {
    const statusText = steps.some((s) => s.status === "running")
      ? "正在查询数据..."
      : steps.length > 0
        ? "数据处理中..."
        : "思考中...";
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

  // 正文
  const clean = content.replace(/<TOOL_CALL>[\s\S]*?<\/TOOL_CALL>/g, "").trim();
  if (clean)
    nodes.push(
      h("div", { class: "md-body", innerHTML: renderMarkdown(clean) }),
    );

  return h("div", { class: "flex flex-col gap-1.5 w-full" }, nodes);
}

// ── Bubble items ───────────────────────────────────────────────────────────
const scrollRef = ref<HTMLElement>();

const bubbleItems = computed(() => {
  const steps = thinkingSteps.value;
  const loading = isLoading.value;
  const msgs = activeSession.value.messages;

  return msgs.map((m, i) => ({
    key: m.id,
    role: m.role,
    content: m.content,
    loading: false,
    messageRender:
      m.role === "assistant"
        ? () =>
            renderAssistantMsg(
              m.id,
              m.content,
              i === msgs.length - 1,
              loading,
              steps,
            )
        : undefined,
  }));
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
  <!-- ── App root ─────────────────────────────────────────────────── -->
  <div class="flex h-screen overflow-hidden bg-[#f5f7fa]">
    <!-- ── Sidebar ──────────────────────────────────────────────── -->
    <aside
      class="w-[220px] flex-shrink-0 flex flex-col bg-white border-r border-[#e8e8e8]"
    >
      <div
        class="flex items-center justify-between px-3 pt-[14px] pb-[10px] border-b border-[#f0f0f0]"
      >
        <span class="text-[13px] font-semibold text-[#595959]">对话列表</span>
        <a-button
          type="primary"
          size="small"
          :icon="h(PlusOutlined)"
          @click="store.addSession"
        >
          新对话
        </a-button>
      </div>

      <div class="flex-1 overflow-y-auto py-[6px] px-1">
        <div
          v-if="loadingThreads"
          class="flex items-center gap-[6px] px-3 py-[10px] text-[12px] text-[#8c8c8c]"
        >
          <LoadingOutlined />
          <span>加载中...</span>
        </div>
        <div
          v-for="s in sessions"
          :key="s.id"
          class="group flex items-center gap-2 px-[10px] py-2 rounded-[6px] cursor-pointer transition-colors duration-150 relative hover:bg-[#f5f5f5]"
          :class="{ 'bg-[#e6f4ff]': s.id === activeId }"
          @click="store.switchSession(s.id)"
        >
          <MessageOutlined class="text-[13px] text-[#8c8c8c] flex-shrink-0" />
          <span
            class="flex-1 text-[13px] text-[#262626] overflow-hidden text-ellipsis whitespace-nowrap"
          >
            {{ s.title }}
          </span>
          <a-popconfirm
            title="删除此对话？"
            ok-text="删除"
            cancel-text="取消"
            placement="right"
            @confirm.stop="
              deleteThread(s.backendThreadId).then(() =>
                store.deleteSession(s.id),
              )
            "
          >
            <DeleteOutlined
              class="text-[12px] text-[#bfbfbf] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              @click.stop
            />
          </a-popconfirm>
        </div>
      </div>
    </aside>

    <!-- ── Main chat area ──────────────────────────────────────── -->
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
          <div
            v-if="activeSession.messages.length === 0"
            class="flex-1 flex flex-col items-center justify-center text-[#8c8c8c] gap-2"
          >
            <RobotOutlined class="text-[48px] text-[#1677ff] opacity-60" />
            <h2 class="text-[20px] text-[#595959] m-0">
              你好，我是视觉设计助手
            </h2>
            <p class="m-0 text-[14px]">有什么可以帮你的吗？</p>
          </div>

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
