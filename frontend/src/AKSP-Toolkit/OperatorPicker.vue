<template>
  <button v-if="collapsible" type="button" class="picker-toggle" :aria-expanded="expanded"
    :aria-controls="expanded ? formId : undefined" @click="expanded = !expanded">{{ expanded ? "收起选择" : toggleLabel }}</button>
  <form v-if="!collapsible || expanded" :id="formId" class="operator-picker-form" @submit.prevent="add">
    <label>核心盟约
      <select v-model="core">
        <option value="">全部核心盟约</option>
        <option v-for="name in coreOptions" :key="name" :value="name">{{ name }}</option>
      </select>
    </label>
    <label>附加盟约
      <select v-model="additional">
        <option value="">全部附加盟约</option>
        <option v-for="name in additionalOptions" :key="name" :value="name">{{ name }}</option>
      </select>
    </label>
    <div v-if="showAvatars && operatorOptions.length" class="operator-options" role="group" :aria-label="operatorLabel">
      <button v-for="name in operatorOptions" :key="name" type="button" :aria-pressed="operator === name"
        @click="operator = name">
        <img :src="getAvatarUrl(encodeURIComponent(name))" alt="" width="24" height="24" loading="lazy" />{{ name }}
      </button>
    </div>
    <label v-else-if="!showAvatars">干员
      <select v-model="operator" :aria-label="operatorLabel" :disabled="!operatorOptions.length">
        <option value="" disabled>选择干员</option>
        <option v-for="name in operatorOptions" :key="name" :value="name">{{ name }}</option>
      </select>
    </label>
    <button type="submit" :disabled="full || !operator">{{ submitLabel }}</button>
    <p v-if="!operatorOptions.length" class="operator-empty" role="status">没有符合条件的干员。</p>
  </form>
</template>

<script setup>
import { computed, ref, useId, watch } from "vue";
import { getAvatarUrl } from "../utils/index.js";

const props = defineProps({
  catalog: { type: Array, required: true },
  full: Boolean,
  collapsible: Boolean,
  showAvatars: Boolean,
  operatorLabel: { type: String, default: "目标干员" },
  toggleLabel: { type: String, default: "选择干员" },
  submitLabel: { type: String, default: "添加干员" },
});
const emit = defineEmits(["add"]);
const formId = useId();
const expanded = ref(false);
const core = ref("");
const additional = ref("");
const operator = ref("");
const uniqueNames = (names) => [...new Set(names)].sort((a, b) => a.localeCompare(b, "zh-CN"));
const coreOptions = computed(() => uniqueNames(props.catalog.flatMap((item) => item.core)));
const additionalOptions = computed(() => uniqueNames(props.catalog.flatMap((item) => item.additional)));
const operatorOptions = computed(() => props.catalog.filter((item) =>
  (!core.value || item.core.includes(core.value)) && (!additional.value || item.additional.includes(additional.value)),
).map(({ name }) => name));

watch(coreOptions, (options) => {
  if (!options.includes(core.value)) core.value = "";
});
watch(additionalOptions, (options) => {
  if (!options.includes(additional.value)) additional.value = "";
});
watch(operatorOptions, (options) => {
  if (!options.includes(operator.value)) operator.value = "";
});

function add() {
  if (!props.full && operatorOptions.value.includes(operator.value)) emit("add", operator.value);
}
</script>

<style scoped>
.operator-picker-form { display: flex; flex-wrap: wrap; align-items: end; gap: 6px; margin: 8px 0; }
.operator-picker-form label { display: grid; gap: 3px; font-size: 12px; }
.operator-picker-form select, .operator-picker-form button, .picker-toggle { padding: 3px 6px; border: 1px solid #3b4959; border-radius: 6px; background: #222d3a; color: #edf2f7; font-size: 12px; }
.operator-picker-form button, .picker-toggle { cursor: pointer; }
.picker-toggle { margin-block: 4px; }
.operator-picker-form :disabled { opacity: .45; cursor: default; }
.operator-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 4px; width: 100%; max-height: 132px; overflow-y: auto; }
.operator-options button { display: flex; align-items: center; gap: 4px; text-align: left; }
.operator-options button[aria-pressed="true"] { border-color: #8bb6e8; background: #304153; }
.operator-options img { flex: none; border-radius: 3px; object-fit: cover; }
.operator-empty { flex-basis: 100%; margin: 0; color: #abb9c9; font-size: 12px; }
</style>
