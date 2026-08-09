<script setup>
import { nextTick, ref, watch } from "vue";
import PdfThumb from "./PdfThumb.vue";
import { useMuseumContext } from "../composables/useMuseumContext";
import { fileUrl, formatBytes, previewPath } from "../lib/catalog";

const dialog = ref(null);
const { exhibitionSlides, exhibitionTextOpen, closeExhibitionText, openDetail } = useMuseumContext();
const slides = exhibitionSlides.slides;

function handleNativeClose() {
  if (exhibitionTextOpen.value) closeExhibitionText();
}

function openItem(slide) {
  if (slide.item?.kind === "image") openDetail(slide.itemId);
}

watch(exhibitionTextOpen, async (isOpen) => {
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
  <dialog ref="dialog" class="exhibition-text-dialog" @close="handleNativeClose">
    <button class="close-button" type="button" aria-label="关闭" @click="closeExhibitionText">×</button>
    <div class="exhibition-text-body">
      <template v-for="slide in slides" :key="slide.id">
        <header v-if="slide.type === 'cover'" class="exhibition-text-cover">
          <p class="eyebrow">{{ exhibitionSlides.eyebrow }}</p>
          <h2>{{ slide.title }}</h2>
          <p class="exhibition-text-subtitle">{{ slide.subtitle }}</p>
          <p v-for="(paragraph, index) in slide.paragraphs" :key="index">{{ paragraph }}</p>
        </header>

        <section v-else-if="slide.type === 'hall'" class="exhibition-text-hall">
          <p class="exhibition-text-kicker">{{ slide.indexLabel }} · {{ slide.kind }}</p>
          <h3>{{ slide.title }} <span>{{ slide.subtitle }}</span></h3>
          <p v-for="(paragraph, index) in slide.paragraphs" :key="index">{{ paragraph }}</p>
          <small>本厅展品 {{ slide.itemCount }} 件</small>
        </section>

        <section v-else-if="slide.type === 'unit'" class="exhibition-text-unit">
          <p class="exhibition-text-kicker">{{ slide.indexLabel }}</p>
          <h4>{{ slide.title }} <span>{{ slide.subtitle }}</span></h4>
          <p v-for="(paragraph, index) in slide.paragraphs" :key="index">{{ paragraph }}</p>
        </section>

        <article
          v-else-if="slide.type === 'item'"
          class="exhibition-text-item"
          :class="{ 'is-pdf': slide.item.kind !== 'image' }"
        >
          <button
            v-if="slide.item.kind === 'image'"
            class="exhibition-text-thumb"
            type="button"
            :aria-label="`查看 ${slide.title} 详情`"
            @click="openItem(slide)"
          >
            <img :src="fileUrl(previewPath(slide.item))" :alt="slide.title" loading="lazy" decoding="async" />
          </button>
          <div v-else class="exhibition-text-thumb">
            <PdfThumb :item="slide.item" />
          </div>
          <div class="exhibition-text-copy">
            <strong>{{ slide.title }}</strong>
            <em>{{ slide.unitLabel }} · {{ slide.unitTitle }} · 档号 {{ slide.codeRange }}</em>
            <p>{{ slide.text }}</p>
            <a
              v-if="slide.item.kind !== 'image'"
              class="ghost-action"
              :href="fileUrl(slide.item.path)"
              target="_blank"
              rel="noreferrer"
            >打开原始档案（{{ formatBytes(slide.item.size) }}）</a>
          </div>
        </article>

        <footer v-else-if="slide.type === 'finale'" class="exhibition-text-finale">
          <h3>{{ slide.title }}</h3>
          <p v-for="(paragraph, index) in slide.paragraphs" :key="index">{{ paragraph }}</p>
        </footer>
      </template>
    </div>
  </dialog>
</template>
