<template>
  <span class="module-help">
    <button ref="anchor" type="button" class="help-button" :aria-label="`${label}操作说明`"
      :aria-describedby="open ? tooltipId : undefined"
      @mouseenter="show" @mouseleave="hide" @focus="show" @blur="hide" @keydown.esc.stop="hide">?</button>
    <Teleport to="body">
      <div v-if="open" :id="tooltipId" ref="tooltip" class="help-tooltip" role="tooltip" :style="position">{{ text }}</div>
    </Teleport>
  </span>
</template>

<script setup>
import { nextTick, onUnmounted, ref, useId } from "vue";

defineProps({
  label: { type: String, required: true },
  text: { type: String, required: true },
});
const tooltipId = useId();
const anchor = ref(null);
const tooltip = ref(null);
const open = ref(false);
const position = ref({});

async function show() {
  open.value = true;
  await nextTick();
  if (!open.value || !tooltip.value || !anchor.value) return;
  const bounds = anchor.value.getBoundingClientRect();
  const { width, height } = tooltip.value.getBoundingClientRect();
  const left = Math.max(8, Math.min(bounds.left + (bounds.width - width) / 2, window.innerWidth - width - 8));
  const top = bounds.bottom + height + 14 <= window.innerHeight
    ? bounds.bottom + 6 : Math.max(8, bounds.top - height - 6);
  position.value = { left: `${left}px`, top: `${top}px` };
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
}

function hide() {
  open.value = false;
  window.removeEventListener("scroll", hide, true);
  window.removeEventListener("resize", hide);
}

onUnmounted(hide);
</script>

<style scoped>
.module-help { display: inline-flex; vertical-align: middle; flex: 0 0 auto; }
.help-button { display: grid; place-items: center; width: 17px; height: 17px; padding: 0; border: 1px solid #596a7e; border-radius: 50%; background: transparent; color: #b9c7d6; font-size: 11px; font-weight: 600; line-height: 1; cursor: help; }
.help-button:hover, .help-button:focus-visible { border-color: #a8ebda; background: #2c4747; color: #edf2f7; }
.help-tooltip { position: fixed; z-index: 3000; width: max-content; max-width: min(285px, calc(100vw - 16px)); padding: 7px 9px; border: 1px solid #526175; border-radius: 7px; background: #202b38; color: #edf2f7; box-shadow: 0 4px 12px #0006; font-size: 12px; line-height: 1.5; text-align: left; white-space: pre-line; pointer-events: none; }
</style>
