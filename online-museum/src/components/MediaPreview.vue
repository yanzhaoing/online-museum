<script setup>
import { computed } from "vue";
import { displayTitle, fileUrl, previewPath } from "../lib/catalog";

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
  className: {
    type: String,
    default: "",
  },
  original: {
    type: Boolean,
    default: false,
  },
});

const src = computed(() => fileUrl(props.original ? props.item.path : previewPath(props.item)));
</script>

<template>
  <img
    v-if="item.kind === 'image'"
    :class="className"
    :src="src"
    :alt="displayTitle(item)"
    loading="lazy"
    decoding="async"
  />
  <div v-else class="pdf-face" :class="className">
    <strong>PDF</strong>
    <span>{{ displayTitle(item) }}</span>
  </div>
</template>
