<template>
  <span class="function-frame" :title="description">
    <span v-for="(tag, index) in tags" :key="tag" class="function-ring" aria-hidden="true"
      :style="{ inset: `${-3 * index}px`, borderColor: colors[tag] }"></span>
    <slot />
  </span>
</template>

<script setup>
import { computed } from "vue";
import { COVENANT_FUNCTIONS } from "./covenantFunctions.js";

const props = defineProps({ tags: { type: Array, required: true } });
const colors = { attack: "#d97783", economy: "#d6aa58", survival: "#6cb1ce" };
const labels = Object.fromEntries(COVENANT_FUNCTIONS.map(({ id, label }) => [id, label]));
const description = computed(() => props.tags.map((tag, index) => `${index ? "次类" : "主类"} ${labels[tag]}`).join("、"));
</script>

<style scoped>
.function-frame { position: relative; display: inline-block; margin: 7px; padding: 0 6px; }
.function-ring { position: absolute; border: 1px solid; border-radius: 999px; pointer-events: none; }
</style>
