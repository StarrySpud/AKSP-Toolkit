<template>
  <section class="function-editor" aria-labelledby="function-editor-title">
    <header>
      <h2 id="function-editor-title">盟约分类</h2>
      <p>核心盟约的每个等级分别归类。优先级按主要类别判定，次要类别用于功能覆盖。</p>
    </header>
    <section v-for="group in groups" :key="group.id">
      <h3>{{ group.label }}</h3>
      <div class="entries">
        <div v-for="entry in group.entries" :key="`${entry.name}-${entry.level}`" class="entry">
          <div class="entry-title">
            <strong>{{ entry.label }}</strong>
            <small v-if="entry.threshold">{{ entry.threshold }} 人门槛</small>
            <CovenantFunctionTags :tags="entry.tags" />
          </div>
          <label class="primary">主要类别
            <select :aria-label="`${entry.label}主要类别`" :value="entry.tags[0] ?? ''"
              @change="setPrimary(entry, $event.target.value)">
              <option value="" disabled>未分类</option>
              <option v-for="{ id, label } in COVENANT_FUNCTIONS" :key="id" :value="id">{{ label }}</option>
            </select>
          </label>
          <fieldset :disabled="!entry.tags.length">
            <legend>次要类别</legend>
            <label v-for="{ id, label } in COVENANT_FUNCTIONS" :key="id">
              <input type="checkbox" :aria-label="`${entry.label}次类${label}`"
                :checked="entry.tags.slice(1).includes(id)" :disabled="entry.tags[0] === id"
                @change="toggleSecondary(entry, id, $event.target.checked)" />{{ label }}
            </label>
          </fieldset>
          <button type="button" :disabled="!entry.custom" :aria-label="`恢复 ${entry.label} 默认分类`"
            @click="emit('change', entry.name, entry.level, null)">恢复默认</button>
          <details v-if="entry.effects.length" class="effect-details">
            <summary>查看效果</summary>
            <ul>
              <li v-for="(effect, index) in entry.effects" :key="index">
                <strong v-if="effect.condition">{{ effect.condition }} · </strong>{{ effect.description }}
              </li>
            </ul>
          </details>
        </div>
      </div>
    </section>
  </section>
</template>

<script setup>
import { computed } from "vue";
import { ADDITIONAL_GROUP, CORE_GROUP } from "../data/versions.js";
import { getCoreCovenantLevelEffects } from "../composables/useCovenantStats.js";
import CovenantFunctionTags from "./CovenantFunctionTags.vue";
import { COVENANT_FUNCTIONS, covenantFunctionEntries, getCovenantFunctions } from "./covenantFunctions.js";

const props = defineProps({ version: { type: Object, required: true }, overrides: { type: Object, required: true } });
const emit = defineEmits(["change"]);
const groups = computed(() => {
  const entries = covenantFunctionEntries(props.version).map((entry) => ({
    ...entry, label: entry.group === CORE_GROUP ? `${entry.name} Lv.${entry.level}` : entry.name,
    tags: getCovenantFunctions(props.version.id, entry.name, entry.level, props.overrides),
    custom: Boolean(props.overrides[entry.name]?.[entry.level]),
    effects: entry.group === CORE_GROUP
      ? getCoreCovenantLevelEffects(entry.name, props.version.covenants, entry.level, entry.threshold)
      : props.version.covenants[entry.name].effects ?? [],
  }));
  return [{ id: CORE_GROUP, label: "核心盟约" }, { id: ADDITIONAL_GROUP, label: "附加盟约" }]
    .map((group) => ({ ...group, entries: entries.filter((entry) => entry.group === group.id) }));
});

function setPrimary(entry, id) {
  emit("change", entry.name, entry.level, [id, ...entry.tags.slice(1).filter((tag) => tag !== id)]);
}

function toggleSecondary(entry, id, checked) {
  const tags = checked ? [...entry.tags, id] : entry.tags.filter((tag) => tag !== id);
  emit("change", entry.name, entry.level, tags);
}
</script>

<style scoped>
.function-editor { padding: 14px 16px; border: 1px solid #303943; border-radius: 10px; background: #181f28; }
h2, h3, p { margin: 0; }
h2 { font-size: 17px; }
h3 { margin: 12px 0 6px; font-size: 14px; }
p, small { color: #abb9c9; font-size: 12px; }
.entries { display: grid; gap: 5px; }
.entry { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 6px 8px; border: 1px solid #374456; border-radius: 6px; background: #1d2733; font-size: 12px; }
.entry-title { display: flex; flex: 1; align-items: center; flex-wrap: wrap; min-width: min(100%, 230px); gap: 5px; }
.primary, fieldset label { display: inline-flex; align-items: center; gap: 4px; }
fieldset { display: flex; flex-wrap: wrap; gap: 3px 7px; margin: 0; padding: 2px 6px; border: 1px solid #526175; border-radius: 5px; }
legend { padding: 0 3px; color: #c5d3de; }
select, button { padding: 3px 6px; border: 1px solid #526175; border-radius: 5px; background: #151d27; color: #edf2f7; font-size: 12px; }
button:enabled { cursor: pointer; }
button:disabled { opacity: .45; }
.effect-details[open] { flex-basis: 100%; }
.effect-details summary { color: #b8ddd7; cursor: pointer; }
.effect-details ul { margin: 4px 0; padding-inline-start: 18px; white-space: pre-line; }
</style>
