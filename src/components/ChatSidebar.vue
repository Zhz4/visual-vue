<script setup lang="ts">
import { h } from "vue";
import { storeToRefs } from "pinia";
import { useSessionsStore } from "@/stores/sessions";
import { useThreads } from "@/composables/useThreads";
import {
  LoadingOutlined,
  PlusOutlined,
  DeleteOutlined,
  MessageOutlined,
} from "@ant-design/icons-vue";

defineProps<{ loadingThreads: boolean }>();

const store = useSessionsStore();
const { sessions, activeId } = storeToRefs(store);
const { deleteThread } = useThreads();
</script>

<template>
  <aside class="w-[220px] flex-shrink-0 flex flex-col bg-white border-r border-[#e8e8e8]">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 pt-[14px] pb-[10px] border-b border-[#f0f0f0]">
      <span class="text-[13px] font-semibold text-[#595959]">对话列表</span>
      <a-button type="primary" size="small" :icon="h(PlusOutlined)" @click="store.addSession">
        新对话
      </a-button>
    </div>

    <!-- Session list -->
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
        <span class="flex-1 text-[13px] text-[#262626] overflow-hidden text-ellipsis whitespace-nowrap">
          {{ s.title }}
        </span>
        <a-popconfirm
          title="删除此对话？"
          ok-text="删除"
          cancel-text="取消"
          placement="right"
          @confirm.stop="deleteThread(s.backendThreadId).then(() => store.deleteSession(s.id))"
        >
          <DeleteOutlined
            class="text-[12px] text-[#bfbfbf] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            @click.stop
          />
        </a-popconfirm>
      </div>
    </div>
  </aside>
</template>
