<template>
  <section class="spectrum" :aria-label="label">
    <div ref="ring" class="spectrum-ring">
      <div class="spectrum-track" :style="{ background: gradient }" aria-hidden="true"></div>
      <h4>{{ label }}</h4>
      <ol class="spectrum-slots">
        <li
          v-for="(entry, index) in entries"
          :key="entry.name"
          class="spectrum-segment"
          :style="slotStyle(index, entry.color)"
        >
          <button
            type="button"
            class="covenant-card"
            :class="{
              'drag-source': drag?.moved && drag.index === index,
              'drop-target': drag?.moved && drag.target === index,
            }"
            :title="describeEntry(entry)"
            :aria-label="describeEntry(entry)"
            aria-keyshortcuts="ArrowLeft ArrowRight"
            @pointerdown="startDrag($event, index)"
            @pointermove="moveDrag"
            @pointerup="finishDrag"
            @pointercancel="drag = null"
            @lostpointercapture="drag = null"
            @keydown.left.prevent="moveByKey($event, index, -1)"
            @keydown.right.prevent="moveByKey($event, index, 1)"
          >
            <img :src="getIconUrl(entry.name)" alt="" width="20" height="20" draggable="false" />
            <span class="covenant-name">{{ entry.name }}</span>
          </button>
          <button
            v-for="option in lineOptions"
            :key="option.delta"
            type="button"
            class="line-adjust"
            :class="option.position"
            :aria-label="`${entry.name}连线${option.label}`"
            :title="`${entry.name}连线${option.label} · 当前 ${lineLevel(entry.name)}/${COVENANT_LINE_WIDTHS.length} 级`"
            :disabled="option.delta < 0 ? lineLevel(entry.name) === 1 : lineLevel(entry.name) === COVENANT_LINE_WIDTHS.length"
            @click="emit('adjust-line', entry.name, option.delta)"
          ><span class="line-arrow" aria-hidden="true"></span></button>
        </li>
      </ol>
    </div>
    <Teleport to="body">
      <div
        v-if="draggedEntry"
        aria-hidden="true"
        class="covenant-card drag-preview"
        :style="{ left: `${drag.pointerX}px`, top: `${drag.pointerY}px`, '--slot-color': draggedEntry.color }"
      >
        <img :src="getIconUrl(draggedEntry.name)" alt="" width="20" height="20" />
        <span class="covenant-name">{{ draggedEntry.name }}</span>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, nextTick, ref } from "vue";
import { getIconUrl } from "../utils/index.js";
import { COVENANT_LINE_WIDTHS, DEFAULT_LINE_LEVEL } from "./covenantGraph.js";

const props = defineProps({
  entries: { type: Array, required: true },
  label: { type: String, required: true },
  lineLevels: { type: Object, required: true },
});
const emit = defineEmits(["reorder", "adjust-line"]);
const ring = ref(null);
const drag = ref(null);
const draggedEntry = computed(() => drag.value?.moved ? props.entries[drag.value.index] : null);
const lineOptions = [
  { position: "line-inner", label: "调细", delta: -1 },
  { position: "line-outer", label: "调粗", delta: 1 },
];
const turn = Math.PI * 2;
const gradient = computed(() => {
  const size = 360 / props.entries.length;
  const segments = props.entries.map(({ color }, index) =>
    `${color} ${index * size}deg ${(index + 1) * size}deg`,
  );
  return segments.length ? `conic-gradient(from ${-size / 2}deg, ${segments.join(", ")})` : "";
});

function slotStyle(index, color) {
  const angle = index * turn / props.entries.length;
  return {
    "--slot-x": Math.sin(angle),
    "--slot-y": -Math.cos(angle),
    "--slot-angle": `${angle}rad`,
    "--slot-color": color,
  };
}

function lineLevel(name) {
  return props.lineLevels[name] ?? DEFAULT_LINE_LEVEL;
}

function describeEntry({ name, banned }) {
  return `${name} · ${props.label}${banned ? " · 已 Ban" : ""}`;
}

function swapEntries(index, target) {
  if (index === target || target < 0 || target >= props.entries.length) return;
  const names = props.entries.map(({ name }) => name);
  [names[index], names[target]] = [names[target], names[index]];
  emit("reorder", names);
}

function startDrag(event, index) {
  if (drag.value || event.button !== 0) return;
  event.currentTarget.setPointerCapture(event.pointerId);
  drag.value = { id: event.pointerId, index, x: event.clientX, y: event.clientY, moved: false, target: index };
}

function moveDrag(event) {
  const active = drag.value;
  if (active?.id !== event.pointerId) return;
  if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 5) return;
  active.moved = true;
  active.pointerX = event.clientX;
  active.pointerY = event.clientY;
  const bounds = ring.value.getBoundingClientRect();
  const x = event.clientX - bounds.left - bounds.width / 2;
  const y = event.clientY - bounds.top - bounds.height / 2;
  const distance = Math.hypot(x, y) / bounds.width;
  const angle = (Math.atan2(x, -y) + turn) % turn;
  const count = props.entries.length;
  active.target = distance >= 0.22 && distance <= 0.55
    ? Math.round(angle * count / turn) % count
    : -1;
}

function finishDrag(event) {
  if (drag.value?.id !== event.pointerId) return;
  moveDrag(event);
  const { index, target, moved } = drag.value;
  drag.value = null;
  if (moved) swapEntries(index, target);
}

async function moveByKey(event, index, offset) {
  const button = event.currentTarget;
  const count = props.entries.length;
  swapEntries(index, (index + offset + count) % count);
  await nextTick();
  button.focus();
}
</script>

<style scoped>
.spectrum { min-width: 0; }
.spectrum-ring { position: relative; aspect-ratio: 1; }
.spectrum-track {
  position: absolute;
  inset: 10%;
  border-radius: 50%;
  mask-image: radial-gradient(circle closest-side, transparent 72%, #000 73% 99%, transparent 100%);
}
h4 {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  color: #c5d2df;
  font-size: 12px;
  pointer-events: none;
}
.spectrum-slots { list-style: none; margin: 0; padding: 0; }
.spectrum-segment { position: absolute; inset: 0; pointer-events: none; }
.spectrum-segment button {
  position: absolute;
  left: calc(50% + var(--slot-x) * var(--radius));
  top: calc(50% + var(--slot-y) * var(--radius));
  transform: translate(-50%, -50%);
  pointer-events: auto;
}
.covenant-card {
  --radius: 39%;
  display: grid;
  justify-items: center;
  gap: 0;
  min-width: 24px;
  padding: 1px 2px 2px;
  border: 1px solid var(--slot-color);
  border-radius: 5px;
  background: #1d2632;
  color: #edf2f7;
  touch-action: none;
  user-select: none;
  cursor: grab;
}
.covenant-card:hover { background: #293648; }
.covenant-card:active { cursor: grabbing; }
.spectrum-segment button:focus-visible, .spectrum-segment .drop-target { outline: 2px solid white; outline-offset: 1px; }
.drag-source { opacity: 0.35; }
.drag-preview {
  position: fixed;
  z-index: 10000;
  transform: translate(-50%, -50%);
  box-shadow: 0 5px 16px #000a;
  pointer-events: none;
}
.covenant-card img { width: 20px; height: 20px; object-fit: contain; }
.line-adjust {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid #3d4b5c;
  border-radius: 50%;
  background: #17212b;
  color: #c5d2df;
  cursor: pointer;
}
.line-adjust:hover:enabled { border-color: var(--slot-color); background: #2d3948; }
.line-adjust:disabled { opacity: 0.35; cursor: default; }
.line-inner { --radius: 24%; --arrow-offset: 135deg; }
.line-outer { --radius: 50%; --arrow-offset: -45deg; }
.line-arrow {
  width: 5px;
  height: 5px;
  border: solid currentColor;
  border-width: 1.5px 1.5px 0 0;
  transform: rotate(calc(var(--slot-angle) + var(--arrow-offset)));
}
.covenant-name { font-size: var(--control-text-size, 13px); line-height: 1; white-space: nowrap; }
</style>
