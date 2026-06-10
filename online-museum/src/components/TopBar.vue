<script setup>
import { useMuseumContext } from "../composables/useMuseumContext";

const { toggleTheme } = useMuseumContext();
</script>

<template>
  <header class="topbar" id="home">
    <a class="brand" href="#home" aria-label="回到首页">
      <span class="brand-mark">民</span>
      <span>
        <strong>民间藏品线上博物馆</strong>
        <small>Digital Folk Collections Museum</small>
      </span>
    </a>
    <nav class="nav" aria-label="主导航">
      <a href="#hall">展厅</a>
      <a href="#catalog">藏品</a>
      <a href="#stories">脉络</a>
    </nav>
    <button class="icon-button" type="button" aria-label="切换灯光" title="切换灯光" @click="toggleTheme">
      <span aria-hidden="true">◐</span>
    </button>
  </header>
</template>
