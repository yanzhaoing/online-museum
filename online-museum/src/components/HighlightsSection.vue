<script setup>
import { computed } from "vue";
import { useMuseumContext } from "../composables/useMuseumContext";
import { buildCodeIndex, CHINESE_BACKDROP_CODE, sunHaibinExhibition } from "../lib/exhibition";
import { fileUrl, previewPath } from "../lib/catalog";

const { items, chooseTour, scrollToSection } = useMuseumContext();

const exhibition = sunHaibinExhibition;
const codeIndex = computed(() => buildCodeIndex(items));

// 三大展厅的代表影像（档号经 buildCodeIndex 解析，目录重生成也不失效）
const HALL_REPRESENTATIVES = {
  "hall-documents": "MJCP-SHB-WX.01-0034",
  "hall-objects": "MJCP-SHB-QW.01-0021",
  "hall-artworks": "MJCP-SHB-ZH.02-0059",
};

const halls = computed(() => exhibition.halls.map((hall) => {
  const repItem = codeIndex.value.get(HALL_REPRESENTATIVES[hall.id]) || null;
  return {
    ...hall,
    unitCount: hall.units.length,
    itemCount: hall.units.reduce((sum, unit) => sum + unit.items.length, 0),
    image: repItem ? fileUrl(previewPath(repItem)) : "",
  };
}));

const unitNames = computed(() => exhibition.halls.flatMap((hall) => hall.units.map((unit) => unit.title)));

const backdropItem = computed(() => codeIndex.value.get(CHINESE_BACKDROP_CODE) || null);
const backdropStyle = computed(() =>
  backdropItem.value ? { backgroundImage: `url("${fileUrl(previewPath(backdropItem.value))}")` } : null);

function enterExhibition() {
  chooseTour("guqin-exhibition");
  scrollToSection("#hall", "smooth");
}
</script>

<template>
  <section class="museum-section guqin-cover" id="highlights" aria-labelledby="highlightsTitle">
    <div v-if="backdropStyle" class="guqin-backdrop" :style="backdropStyle" aria-hidden="true"></div>

    <div class="section-heading" data-fx>
      <p class="eyebrow">{{ exhibition.eyebrow }}</p>
      <h2 id="highlightsTitle">{{ exhibition.title }}</h2>
      <p>{{ exhibition.summary }}</p>
    </div>

    <div class="guqin-intro" data-fx>
      <div class="guqin-preface">
        <p v-for="(paragraph, index) in exhibition.preface" :key="index">{{ paragraph }}</p>
        <button class="primary-action" type="button" @click="enterExhibition">进入 3D 古琴展</button>
      </div>
      <div class="guqin-seal" aria-hidden="true">
        <span>琴</span>
        <small>孙海滨民间收藏数字展</small>
      </div>
    </div>

    <div class="guqin-halls">
      <button
        v-for="(hall, hallIndex) in halls"
        :key="hall.id"
        class="guqin-hall-card"
        type="button"
        data-fx
        :style="{ '--fx-index': hallIndex }"
        @click="enterExhibition"
      >
        <span class="guqin-hall-media">
          <img v-if="hall.image" :src="hall.image" :alt="hall.title" loading="lazy" decoding="async" />
        </span>
        <span class="guqin-hall-meta">
          <em>{{ hall.indexLabel }} · {{ hall.kind }}</em>
          <strong>{{ hall.title }}</strong>
          <span>{{ hall.subtitle }}</span>
          <small>{{ hall.unitCount }} 个单元 · {{ hall.itemCount }} 件展品</small>
        </span>
      </button>
    </div>

    <p class="guqin-units" data-fx>
      <span v-for="(name, index) in unitNames" :key="index">{{ name }}</span>
    </p>
  </section>
</template>
