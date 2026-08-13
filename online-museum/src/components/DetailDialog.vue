<script setup>
import { computed, nextTick, ref, watch } from "vue";
import PdfThumb from "./PdfThumb.vue";
import { useMuseumContext } from "../composables/useMuseumContext";
import { displayTitle, fileUrl, formatBytes, previewPath } from "../lib/catalog";

const dialog = ref(null);
const zoomed = ref(false);
const previewSrc = ref("");
const originalFailed = ref(false);
const { detailItem, detailOpen, detailGuide, closeDetail, openDetail, relatedItems, showToast } = useMuseumContext();
const related = computed(() => detailItem.value ? relatedItems(detailItem.value) : []);

function toggleZoom() {
  zoomed.value = !zoomed.value;
  showToast(zoomed.value ? "已进入细节放大" : "已退出细节放大");
}

function handleNativeClose() {
  if (detailOpen.value) closeDetail();
}

watch(detailItem, () => {
  zoomed.value = false;
  originalFailed.value = false;
  previewSrc.value = detailItem.value ? fileUrl(detailItem.value.path) : "";
});

function useThumbnailFallback() {
  originalFailed.value = true;
  if (!detailItem.value?.thumbPath) return;
  const fallback = fileUrl(previewPath(detailItem.value));
  if (previewSrc.value !== fallback) previewSrc.value = fallback;
}

watch(detailOpen, async (isOpen) => {
  if (!isOpen) zoomed.value = false;
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
  <dialog ref="dialog" class="detail-dialog" @close="handleNativeClose">
    <button class="close-button" type="button" aria-label="关闭" @click="closeDetail">×</button>
    <div v-if="detailItem" class="detail-content">
      <div class="detail-preview">
        <img
          v-if="detailItem.kind === 'image'"
          :class="{ 'is-zoomed': zoomed }"
          :src="previewSrc"
          :alt="displayTitle(detailItem)"
          @error="useThumbnailFallback"
          @click="toggleZoom"
        />
        <div v-else class="pdf-face detail-pdf-face">
          <strong>PDF 档案</strong>
          <span>{{ displayTitle(detailItem) }}</span>
          <em>{{ detailItem.code }} · {{ formatBytes(detailItem.size) }}</em>
          <small>此条目以 PDF 扫描件归档，未生成影像缩略图；可通过右下方「打开原始档案」阅读完整内容</small>
        </div>
      </div>
      <aside class="detail-info">
        <p class="eyebrow">{{ detailItem.category }} / {{ detailItem.kindLabel }}</p>
        <h2>{{ displayTitle(detailItem) }}</h2>
        <dl class="detail-list">
          <div><dt>编号</dt><dd>{{ detailItem.code }}</dd></div>
          <div><dt>藏家</dt><dd>{{ detailItem.collector }}</dd></div>
          <div><dt>来源目录</dt><dd>{{ detailItem.folder }}</dd></div>
          <div><dt>文件大小</dt><dd>{{ formatBytes(detailItem.size) }}</dd></div>
          <div><dt>文件名</dt><dd>{{ detailItem.fileName }}</dd></div>
        </dl>
        <section class="docent-panel">
          <div>
            <h3>导览词</h3>
            <p>{{ detailGuide }}</p>
          </div>
        </section>
        <section class="related-panel">
          <h3>同类线索</h3>
          <div class="related-grid">
            <button
              v-for="entry in related"
              :key="entry.id"
              class="related-card"
              type="button"
              @click="openDetail(entry.id)"
            >
              <img v-if="entry.kind === 'image'" :src="fileUrl(previewPath(entry))" alt="" loading="eager" decoding="async" />
              <PdfThumb v-else :item="entry" />
              <strong>{{ displayTitle(entry) }}</strong>
              <span>{{ entry.collector }} · {{ entry.category }}</span>
            </button>
          </div>
        </section>
        <span v-if="originalFailed" class="open-file is-unavailable" aria-disabled="true">原始档案不可用，当前显示缩略图</span>
        <a v-else class="open-file" :href="fileUrl(detailItem.path)" target="_blank" rel="noreferrer">打开原始档案</a>
      </aside>
    </div>
  </dialog>
</template>
