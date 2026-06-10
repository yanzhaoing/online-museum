<script setup>
import { useMuseumContext } from "../composables/useMuseumContext";

const { category, collector, type, categories, collectors, types, setFilter } = useMuseumContext();

const groups = [
  { title: "类别", key: "category", values: ["全部", ...categories], active: category },
  { title: "藏家", key: "collector", values: ["全部", ...collectors.slice(0, 40)], active: collector },
  { title: "形态", key: "type", values: ["全部", ...types], active: type },
];
</script>

<template>
  <section class="filters" aria-label="筛选器">
    <div v-for="group in groups" :key="group.key">
      <h2>{{ group.title }}</h2>
      <div class="chip-row">
        <button
          v-for="value in group.values"
          :key="value"
          class="chip"
          :class="{ 'is-active': group.active.value === value }"
          type="button"
          @click="setFilter(group.key, value)"
        >
          {{ value }}
        </button>
      </div>
    </div>
  </section>
</template>
