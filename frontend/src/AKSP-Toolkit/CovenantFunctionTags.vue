<template>
  <span class="function-tags">
    <span v-for="(tag, index) in tags" :key="tag" class="function-tag" :data-category="tag"
      :class="{ secondary: index > 0 }">{{ labels[tag] }}</span>
    <span v-if="!tags.length" class="function-tag">未分类</span>
  </span>
</template>

<script setup>
import { COVENANT_FUNCTIONS } from "./covenantFunctions.js";

defineProps({ tags: { type: Array, required: true } });
const labels = Object.fromEntries(COVENANT_FUNCTIONS.map(({ id, label }) => [id, label]));
</script>

<style scoped>
.function-tags { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 3px; }
.function-tag { padding: 1px 5px; border: 1px solid var(--tag-border, #475465); border-radius: 4px; color: var(--tag-text, #c7d3df); background: var(--tag-bg, #29323d); font-size: 11px; font-weight: 600; }
.function-tag.secondary { background: transparent; }
[data-category="attack"] { --tag-bg: #482b33; --tag-text: #ffb1ae; --tag-border: #9b5360; }
[data-category="economy"] { --tag-bg: #493918; --tag-text: #ffe0a0; --tag-border: #a98643; }
[data-category="survival"] { --tag-bg: #203f4b; --tag-text: #afe3f6; --tag-border: #4d8aa1; }
</style>
