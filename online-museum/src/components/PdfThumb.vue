<script setup>
import { displayTitle } from "../lib/catalog";

defineProps({
  item: {
    type: Object,
    required: true,
  },
  className: {
    type: String,
    default: "",
  },
});
</script>

<template>
  <span class="pdf-thumb" :class="className">
    <strong>PDF</strong>
    <em>{{ displayTitle(item) }}</em>
  </span>
</template>
