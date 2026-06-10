<script setup>
import { nextTick, ref, watch } from "vue";
import { useMuseumContext } from "../composables/useMuseumContext";
import { displayTitle } from "../lib/catalog";

const dialog = ref(null);
const { items, summaryOpen, summaryData, closeSummary } = useMuseumContext();

function handleNativeClose() {
  if (summaryOpen.value) closeSummary();
}

function printSummary() {
  window.print();
}

watch(summaryOpen, async (isOpen) => {
  await nextTick();
  if (!dialog.value) return;
  if (isOpen && !dialog.value.open) {
    try {
      dialog.value.showModal();
    } catch (error) {
      dialog.value.setAttribute("open", "");
    }
  }
  if (!isOpen && dialog.value.open) {
    try {
      dialog.value.close();
    } catch (error) {
      dialog.value.removeAttribute("open");
    }
  }
});
</script>

<template>
  <dialog ref="dialog" class="summary-dialog" @close="handleNativeClose">
    <button class="close-button" type="button" aria-label="关闭" @click="closeSummary">×</button>
    <section class="summary-sheet">
      <p class="eyebrow">Visit Summary</p>
      <h2>民间藏品线上博物馆观展小结</h2>
      <p class="summary-date">{{ summaryData.date }}</p>
      <div class="summary-stats">
        <div><strong>{{ summaryData.recent.length.toLocaleString("zh-CN") }}</strong><span>已看藏品</span></div>
        <div><strong>{{ summaryData.categoryCount.toLocaleString("zh-CN") }}</strong><span>涉及类别</span></div>
        <div><strong>{{ items.length.toLocaleString("zh-CN") }}</strong><span>全馆档案</span></div>
      </div>
      <div class="summary-columns">
        <section>
          <h3>类别分布</h3>
          <div class="summary-bars">
            <div v-for="[name, count] in summaryData.categoryRows" :key="name">
              <span>{{ name }}</span>
              <strong>{{ count }}</strong>
            </div>
            <p v-if="!summaryData.categoryRows.length">暂无浏览记录。</p>
          </div>
        </section>
        <section>
          <h3>最近浏览</h3>
          <ol class="summary-list">
            <li v-for="item in summaryData.recent.slice(0, 12)" :key="item.id">
              <strong>{{ displayTitle(item) }}</strong>
              <span>{{ item.collector }} · {{ item.category }} · {{ item.code }}</span>
            </li>
            <li v-if="!summaryData.recent.length"><span>打开藏品后将生成记录。</span></li>
          </ol>
        </section>
      </div>
      <div class="summary-actions">
        <button class="ghost-action" type="button" @click="printSummary">打印 / 保存 PDF</button>
      </div>
    </section>
  </dialog>
</template>
