<template>
  <section class="affinity-editor" aria-labelledby="affinity-editor-title">
    <header>
      <h2 id="affinity-editor-title">相性羁绊</h2>
      <ModuleHelp label="相性羁绊" text="为两名干员添加独立的虚线连线，权重为基础值的 2 倍。两名干员都在图谱或计算池内时计分。" />
    </header>
    <div class="affinity-form">
      <div v-for="(name, index) in selected" :key="index" class="affinity-slot">
        <span v-if="name" class="affinity-operator">
          <img :src="avatar(name)" alt="" width="27" height="27" />{{ name }}
        </span>
        <OperatorPicker :catalog="operatorCatalog" collapsible show-avatars
          :toggle-label="index === 0 ? '选择干员一' : '选择干员二'"
          :operator-label="index === 0 ? '羁绊干员一' : '羁绊干员二'" submit-label="确认干员"
          @add="selected[index] = $event" />
      </div>
      <button type="button" :disabled="!canAdd" @click="add">添加羁绊</button>
      <small v-if="duplicate">这对干员已有羁绊。</small>
    </div>
    <ul v-if="bonds.length" class="affinity-list">
      <li v-for="pair in bonds" :key="affinityBondKey(pair)">
        <template v-for="(name, index) in pair" :key="name">
          <i v-if="index" aria-hidden="true"></i>
          <span class="affinity-operator"><img :src="avatar(name)" alt="" width="27" height="27" loading="lazy" />{{ name }}</span>
        </template>
        <button type="button" :aria-label="`移除 ${pair.join('与')} 的羁绊`" @click="emit('remove', pair)">移除</button>
      </li>
    </ul>
    <p v-else>暂无自定义羁绊。</p>
  </section>
</template>

<script setup>
import { computed, ref } from "vue";
import ModuleHelp from "../components/ModuleHelp.vue";
import { getAvatarUrl } from "../utils/index.js";
import OperatorPicker from "./OperatorPicker.vue";
import { affinityBondKey, readAffinityBond } from "./affinityBonds.js";

const props = defineProps({ bonds: { type: Array, required: true }, operatorCatalog: { type: Array, required: true } });
const emit = defineEmits(["add", "remove"]);
const selected = ref(["", ""]);
const avatar = (name) => getAvatarUrl(encodeURIComponent(name));
const pair = computed(() => readAffinityBond(selected.value));
const duplicate = computed(() => pair.value && props.bonds.some((bond) => affinityBondKey(bond) === affinityBondKey(pair.value)));
const canAdd = computed(() => pair.value && !duplicate.value);

function add() {
  if (!canAdd.value) return;
  emit("add", pair.value);
  selected.value = ["", ""];
}
</script>

<style scoped>
.affinity-editor { padding: 14px 16px; border: 1px solid #303943; border-radius: 10px; background: #181f28; }
header, .affinity-form, .affinity-list li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
h2 { margin: 0; font-size: 17px; }
.affinity-form { align-items: end; margin: 10px 0; }
.affinity-slot { min-width: 0; padding: 4px 7px; border: 1px solid #303943; border-radius: 7px; }
.affinity-operator { display: inline-flex; align-items: center; gap: 5px; margin-right: 5px; }
.affinity-operator img { border-radius: 4px; object-fit: cover; }
button { padding: 4px 7px; border: 1px solid #3b4959; border-radius: 6px; background: #222d3a; color: #edf2f7; font-size: 12px; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
button:hover:enabled { background: #304153; }
.affinity-list { display: grid; gap: 5px; margin: 0; padding: 0; list-style: none; }
.affinity-list li { width: fit-content; padding: 5px 8px; border: 1px solid #3b4959; border-radius: 6px; font-size: 13px; }
.affinity-list i { width: 16px; border-top: 2px dashed #f4e0ff; }
p, small { margin: 0; color: #abb9c9; font-size: 12px; }
</style>
