<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import MediaPreview from "./MediaPreview.vue";
import { useMuseumContext } from "../composables/useMuseumContext";
import { displayTitle } from "../lib/catalog";

const root = ref(null);
const {
  query,
  view,
  searchSuggestions,
  suggestionsOpen,
  setView,
  resetFilters,
  openDetail,
  openSuggestions,
  closeSuggestions,
  openFirstSuggestion,
} = useMuseumContext();

const views = [
  { id: "hall", label: "展线" },
  { id: "grid", label: "网格" },
  { id: "table", label: "清单" },
];

function handleDocumentClick(event) {
  if (root.value?.contains(event.target)) return;
  closeSuggestions();
}

function chooseSuggestion(id) {
  closeSuggestions();
  openDetail(id);
}

onMounted(() => {
  document.addEventListener("click", handleDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleDocumentClick);
});
</script>

<template>
  <section class="control-band" aria-label="全馆检索">
    <div ref="root" class="search-wrap">
      <span aria-hidden="true">⌕</span>
      <input
        v-model="query"
        type="search"
        placeholder="搜索编号、藏家、类别、文件名"
        autocomplete="off"
        @focus="openSuggestions"
        @keydown.escape="closeSuggestions"
        @keydown.enter.prevent="openFirstSuggestion"
      />
      <div
        class="search-suggestions"
        :class="{ 'is-open': suggestionsOpen && searchSuggestions.length }"
        role="listbox"
        aria-label="搜索建议"
      >
        <button
          v-for="item in searchSuggestions"
          :key="item.id"
          class="suggestion-item"
          type="button"
          role="option"
          @click="chooseSuggestion(item.id)"
        >
          <span class="suggestion-thumb">
            <MediaPreview v-if="item.kind === 'image'" :item="item" />
            <template v-else>PDF</template>
          </span>
          <span class="suggestion-copy">
            <strong>{{ displayTitle(item) }}</strong>
            <span>{{ item.collector }} · {{ item.category }}</span>
          </span>
          <span class="suggestion-type">{{ item.kindLabel }}</span>
        </button>
      </div>
    </div>
    <div class="segmented" role="group" aria-label="视图模式">
      <button
        v-for="item in views"
        :key="item.id"
        :class="{ 'is-active': view === item.id }"
        type="button"
        @click="setView(item.id)"
      >
        {{ item.label }}
      </button>
    </div>
    <button class="ghost-action reset-action" type="button" @click="resetFilters(true)">返回全馆</button>
  </section>
</template>
