<template>
  <div class="toolkit" :class="`toolkit--${page}`">
    <header class="toolkit-header">
      <div class="brand">
        <h1>AKSP-Toolkit</h1>
        <a :href="currentVersion.source" target="_blank" rel="noopener">数据来源 PRTS</a>
      </div>
      <nav aria-label="功能页面">
        <button :aria-pressed="page === 'game'" @click="page = 'game'">局内信息</button>
        <button :aria-pressed="page === 'analysis'" @click="openAnalysis">盟约分析</button>
        <button :aria-pressed="page === 'strategy'" @click="page = 'strategy'">策略编辑</button>
      </nav>
      <div class="header-settings">
        <VersionSwitch />
        <LauncherHeartbeat />
        <div class="configuration-actions" role="group" aria-label="配置备份">
          <button type="button" :disabled="configBusy" @click="exportConfiguration">导出配置</button>
          <button
            type="button"
            :disabled="configBusy"
            title="导入会替换当前设置、本地编队和持有棋子，可撤销本次导入"
            @click="configFile.click()"
          >导入配置</button>
          <button v-if="previousConfiguration" type="button" :disabled="configBusy" @click="undoConfiguration">撤销导入</button>
          <input ref="configFile" type="file" accept=".json,application/json" hidden @change="importConfiguration" />
        </div>
      </div>
    </header>
    <p v-if="configurationMessage" class="configuration-status" role="status">{{ configurationMessage }}</p>

    <div v-show="page === 'game'" class="game-page" aria-label="局内信息">
      <GameInformation
        ref="gameInformation"
        toolkit
        :terminal-names="terminalNames"
        @available-pool="pool = $event"
        @toggle-terminal="toggleTerminal"
        @buy-operator="editHeldPieces($event, 'buy')"
        @add-target-operator="addTargetPiece"
      />
    </div>
    <CovenantAnalysis
      ref="covenantAnalysis"
      v-if="analysisOpened"
      v-show="page === 'analysis'"
      :version="currentVersion"
      :operators="currentPool.operators"
      :banned="currentPool.banned"
      :terminal-names="terminalNames"
      :covenant-weights="covenantWeights"
      :terminal-coefficient="terminalCoefficient"
      :pair-coefficient="pairCoefficient"
      :stacking-coefficient="stackingCoefficient"
      :inventory="inventory"
      :held="held"
      :target-covenant-set="targetCovenantSet"
      :directed-covenants="directedCovenants"
      :get-purchase-effects="purchaseEffectsFor"
      @toggle-terminal="toggleTerminal"
      @edit-held-pieces="editHeldPieces"
      @add-target-operator="addTargetPiece"
      @update-inventory="updateInventory"
    />
    <section v-show="page === 'strategy'" class="strategy-page" aria-label="策略编辑">
      <nav aria-label="策略编辑页面">
        <button type="button" :aria-pressed="strategyTab === 'target'" @click="strategyTab = 'target'">终局阵容方案</button>
        <button type="button" :aria-pressed="strategyTab === 'affinity'" @click="strategyTab = 'affinity'">相性羁绊</button>
        <button type="button" :aria-pressed="strategyTab === 'weights'" @click="strategyTab = 'weights'">评分设置</button>
      </nav>
      <ScoringSettings
        v-if="strategyTab === 'weights'"
        class="strategy-weights"
        :version="currentVersion"
        :weights="covenantWeights"
        :terminal-coefficient="terminalCoefficient"
        :pair-coefficient="pairCoefficient"
        :stacking-coefficient="stackingCoefficient"
        @change="changeCovenantWeight"
        @change-terminal-coefficient="changeTerminalCoefficient"
        @change-pair-coefficient="changePairCoefficient"
        @change-stacking-coefficient="changeStackingCoefficient"
      />
      <AffinityBondsEditor v-else-if="strategyTab === 'affinity' && page === 'strategy'" :key="currentVersionId"
        class="strategy-weights" :bonds="inventory.affinityBonds" :operator-catalog="targetOperatorCatalog"
        @add="addAffinityBond" @remove="removeAffinityBond" />
      <div v-else-if="page === 'strategy'" class="endgame-plans">
        <div class="endgame-actions">
          <button type="button" @click="addEndgamePlan">添加方案</button>
        </div>
        <div class="endgame-scroll" role="region" aria-label="终局阵容方案列表" tabindex="0">
          <div class="auto-endgame-grid" aria-label="自动终局方案">
            <LineupView v-for="plan in automaticEndgamePlans" :key="plan.title" class="auto-endgame"
              :title="plan.title" :title-id="plan.id" :lineup="plan.lineup" :limit="plan.limit"
              :covenants="plan.covenants" :network-score="plan.score" fixed @buy="editHeldPieces($event, 'buy')"
              @add="addTargetPiece">
              <template #switch>
                <button type="button" class="apply-endgame" :disabled="!plan.pieces.length"
                  @click="applyAutomaticPlan(plan)">设为目标阵容</button>
              </template>
              <template #empty>
                <p class="endgame-empty">{{ plan.status }}</p>
              </template>
            </LineupView>
          </div>
          <div v-if="endgamePlans.length" class="endgame-grid">
          <LineupView
            v-for="(plan, index) in endgamePlans"
            :key="`${currentVersionId}:${plan.id}`"
            class="strategy-lineup"
            :title="plan.name"
            :title-id="`strategy-lineup-title-${index + 1}`"
            :lineup="plan.lineup"
            :limit="plan.limit"
            :covenants="plan.covenants"
            :network-score="plan.score"
            editable
            @set-limit="(limit) => setTargetLimit(limit, plan.id)"
            @add="(name) => addTargetPiece(name, plan.id)"
            @buy="editHeldPieces($event, 'buy')"
            @remove="(index) => removeTargetPiece(index, plan.id)"
            @toggle-promotion="(index) => toggleTargetPromotion(index, plan.id)"
          >
            <template #title>
              <input class="endgame-name" type="text" aria-label="方案名称" :value="plan.name"
                @change="renameEndgamePlan($event, plan)"
                @keydown.enter="!$event.isComposing && $event.target.blur()" />
            </template>
            <template #switch>
              <button type="button" class="apply-endgame" @click="applyEndgamePlan(plan.id)">设为目标阵容</button>
              <button type="button" class="delete-endgame" :aria-label="`删除方案 ${plan.name}`"
                @click="removeEndgamePlan(plan.id)">删除</button>
            </template>
            <template #editor>
              <OperatorPicker :catalog="targetOperatorCatalog" collapsible :full="plan.lineup.length >= plan.limit"
                @add="(name) => addTargetPiece(name, plan.id)" />
            </template>
          </LineupView>
          </div>
          <p v-else class="endgame-empty">暂无自定义终局阵容方案。</p>
        </div>
      </div>
    </section>
    <div class="shared-inventory">
      <p v-if="unsavedSettings.size" class="settings-warning" role="alert">
        浏览器无法保存{{ [...unsavedSettings.values()].join("、") }}，这些改动目前仅在当前窗口有效。
      </p>
      <HeldLineup
        :held="held"
        :covenants="heldCovenants"
        :target-covenant-set="targetCovenantSet"
        :covenant-icons="inventory.covenantIcons"
        :covenant-panel="inventory.covenantPanel"
        :covenant-panel-collapsed="inventory.covenantPanelCollapsed"
        :extra-covenants="extraCovenants"
        :has-saved-layers="Object.keys(inventory.covenantLayers).length > 0"
        :lineup="lineup"
        :lineup-covenants="lineupCovenants"
        :lineup-score="recommendedLineup.score / COVENANT_TICKS_PER_POINT"
        :lineup-size="inventory.lineupSize"
        :lineup-view="inventory.lineupView"
        :target-lineup="targetLineup"
        :target-lineup-size="inventory.targetLineupSize"
        :target-covenants="targetCovenants"
        :target-network-score="targetNetworkScore"
        :can-undo-target="canUndoCurrentTarget"
        :operator-catalog="targetOperatorCatalog"
        :version-id="currentVersionId"
        :collapsed="inventory.collapsed"
        @sell="editHeldPieces"
        @buy="editHeldPieces($event, 'buy')"
        @set-collapsed="updateInventory({ collapsed: $event })"
        @set-lineup-size="updateInventory({ lineupSize: $event })"
        @set-covenant-layers="(name, count) => setInventoryCovenantCount('covenantLayers', name, count)"
        @set-extra-count="(name, count) => setInventoryCovenantCount(extraCountField, name, count)"
        @set-covenant-panel="updateInventory({ covenantPanel: $event, covenantPanelCollapsed: false })"
        @set-covenant-panel-collapsed="updateInventory({ covenantPanelCollapsed: $event })"
        @set-covenant-icons="updateInventory({ covenantIcons: $event })"
        @clear-held="updateInventory({ pieces: {} })"
        @reset-layers="updateInventory({ covenantLayers: {} })"
        @toggle-target-covenant="toggleTargetCovenant"
        @set-lineup-view="updateInventory({ lineupView: $event })"
        @set-target-limit="setTargetLimit"
        @add-target="addTargetPiece"
        @remove-target="removeTargetPiece"
        @toggle-target-promotion="toggleTargetPromotion"
        @clear-target="clearTargetLineup"
        @undo-target="undoCurrentTarget"
        @save-target-plan="saveTargetAsEndgamePlan"
      />
    </div>
    <PwaUpdatePrompt />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from "vue";
import GameInformation from "../App.vue";
import LauncherHeartbeat from "../components/LauncherHeartbeat.vue";
import PwaUpdatePrompt from "../components/PwaUpdatePrompt.vue";
import VersionSwitch from "../components/VersionSwitch.vue";
import { getHeldCovenantMembers, summarizeRecommendedCovenants } from "../composables/useCovenantStats.js";
import { useGameVersion } from "../composables/useGameVersion.js";
import { ADDITIONAL_GROUP, CORE_GROUP, getCovenantsByGroup, getOperatorCovenants } from "../data/versions.js";
import { getAvatarUrl } from "../utils/index.js";
import CovenantAnalysis from "./CovenantAnalysis.vue";
import AffinityBondsEditor from "./AffinityBondsEditor.vue";
import { affinityBondKey, readAffinityBond } from "./affinityBonds.js";
import ScoringSettings from "./ScoringSettings.vue";
import HeldLineup from "./HeldLineup.vue";
import LineupView from "./LineupView.vue";
import OperatorPicker from "./OperatorPicker.vue";
import { canUndoTargetLineup, recordTargetLineupChange, undoTargetLineupChange } from "./targetLineupUndo.js";
import { COVENANT_TICKS_PER_POINT, normalizeCovenantWeight, normalizePairCoefficient, normalizeStackingCoefficient, normalizeTerminalCoefficient } from "./covenantWeights.js";
import { buildLineupScoring, getLineupPieceTicks, getLineupScoreTicks } from "./lineupScoring.js";
import { ENDGAME_LINEUP_SIZES } from "./endgameOptimizer.js";
import {
  changeHeldPieces, DEFAULT_ENDGAME_PLAN_NAME, DEFAULT_LINEUP_SIZE, getHeldActivatableCovenants, getHeldOperators,
  getHeldPurchaseEffects, normalizeInventory,
  recommendHeldLineup, validCovenantLayerCount, validLineupSize,
} from "./operatorInventory.js";
import { CONFIG_FORMAT, CONFIG_VERSION, parseToolkitConfiguration } from "./toolkitConfiguration.js";

const { versions, currentVersion, currentVersionId, setVersion } = useGameVersion();
const page = ref("game");
const strategyTab = ref("target");
const analysisOpened = ref(false);
const gameInformation = ref(null);
const covenantAnalysis = ref(null);
const configFile = ref(null);
const configBusy = ref(false);
const configurationMessage = ref("");
const previousConfiguration = shallowRef(null);
const targetUndoByVersion = shallowRef({});
let statusTimer;
const emptyPool = { operators: [], banned: [] };
const pool = shallowRef(null);
const currentPool = computed(() =>
  pool.value?.versionId === currentVersionId.value ? pool.value : emptyPool,
);

const settingReaders = new Map();
const unsavedSettings = reactive(new Map());
const terminalSetting = localSetting(
  "aksp_toolkit_terminal_operators",
  "终端标签",
  (names) => Array.isArray(names) ? [...new Set(names.filter((name) => typeof name === "string" && name))] : [],
);
const weightSetting = localSetting(
  "aksp_toolkit_covenant_weights",
  "盟约权重",
  (weights, { covenants }) => Object.fromEntries(Object.keys(covenants)
    .filter((name) => Number.isFinite(weights?.[name]))
    .map((name) => [name, normalizeCovenantWeight(weights[name], covenants[name].group)])),
);
const coefficientSetting = localSetting(
  "aksp_toolkit_terminal_coefficients", "终端干员系数", normalizeTerminalCoefficient,
);
const pairCoefficientSetting = localSetting(
  "aksp_toolkit_pair_coefficients", "成对干员系数", normalizePairCoefficient,
);
const stackingCoefficientSetting = localSetting(
  "aksp_toolkit_stacking_coefficients", "持续叠加倍率", normalizeStackingCoefficient,
);
const inventorySetting = localSetting("aksp_toolkit_operator_inventory", "持有干员", normalizeInventory);
const inventory = computed(() => inventorySetting.current.value ?? normalizeInventory());
const terminalNames = computed(() => terminalSetting.current.value ?? []);
const covenantWeights = computed(() => weightSetting.current.value ?? {});
const terminalCoefficient = computed(() => normalizeTerminalCoefficient(coefficientSetting.current.value));
const pairCoefficient = computed(() => normalizePairCoefficient(pairCoefficientSetting.current.value));
const stackingCoefficient = computed(() => normalizeStackingCoefficient(stackingCoefficientSetting.current.value));
const held = computed(() => getHeldOperators(inventory.value.pieces));
const heldCovenantMembers = computed(() => getHeldCovenantMembers(held.value, currentVersion.value));
const targetCovenantSet = computed(() => new Set(inventory.value.targetCovenantNames));
const extraCovenantCounts = computed(() => ({ ...inventory.value.extraCoreCounts, ...inventory.value.extraAdditionalCounts }));
const heldCovenants = computed(() => getHeldActivatableCovenants(
  currentVersion.value, held.value, inventory.value.covenantLayers, extraCovenantCounts.value,
  targetCovenantSet.value,
));
const extraCountField = computed(() => inventory.value.covenantPanel === "extra-additional" ? "extraAdditionalCounts" : "extraCoreCounts");
const extraCovenants = computed(() => {
  const group = extraCountField.value === "extraCoreCounts" ? CORE_GROUP : ADDITIONAL_GROUP;
  return getCovenantsByGroup(currentVersion.value, group).map((name) => ({
    name, count: inventory.value[extraCountField.value][name] ?? 0,
  }));
});
const lineupScoringOptions = computed(() => ({
  weights: covenantWeights.value, layers: inventory.value.covenantLayers, targets: targetCovenantSet.value,
  extras: extraCovenantCounts.value,
}));
const recommend = (operators) => recommendHeldLineup(currentVersion.value, operators,
  inventory.value.lineupSize, lineupScoringOptions.value);
const recommendedLineup = computed(() => recommend(held.value));
const lineup = computed(() => displayManualLineup(recommendedLineup.value.pieces));
const purchaseEffectsFor = (candidates) => getHeldPurchaseEffects(
  currentVersion.value, candidates, inventory.value.pieces, held.value,
  recommendedLineup.value, recommend, extraCovenantCounts.value,
);
const summarizeLineupCovenants = (team) => summarizeRecommendedCovenants(
  team, currentVersion.value, extraCovenantCounts.value, heldCovenantMembers.value,
);
const lineupCovenants = computed(() => summarizeLineupCovenants(recommendedLineup.value.pieces));
const targetOperatorNames = computed(() => [...new Set([
  ...Object.keys(currentVersion.value.operators),
  ...(currentPool.value.allOperators ?? []).map(({ name }) => name),
])].sort((a, b) => a.localeCompare(b, "zh-CN")));
const targetOperatorCatalog = computed(() => targetOperatorNames.value.map((name) => {
  const covenants = getOperatorCovenants(name, currentVersion.value);
  const core = covenants.filter((covenant) => currentVersion.value.covenants[covenant]?.group === CORE_GROUP);
  const additional = covenants.filter((covenant) => currentVersion.value.covenants[covenant]?.group === ADDITIONAL_GROUP);
  return { name, core: core.length ? core : ["无核心盟约"], additional: additional.length ? additional : ["无附加盟约"] };
}));
const displayManualLineup = (pieces) => pieces.map(({ name, promoted }) => ({
  node: { name, avatar: getAvatarUrl(encodeURIComponent(name)) }, promoted,
  pieceScore: getLineupPieceTicks(name, currentVersion.value, promoted) / COVENANT_TICKS_PER_POINT,
}));
const targetLineup = computed(() => displayManualLineup(inventory.value.targetLineup));
const targetCovenants = computed(() => summarizeLineupCovenants(inventory.value.targetLineup));
const directedCovenants = computed(() => new Set(inventory.value.directedSearch && targetLineup.value.length
  ? targetCovenants.value.activeNames : []));
const lineupScore = (covenants, pieces) => getLineupScoreTicks(covenants, pieces, currentVersion.value,
  lineupScoringOptions.value) / COVENANT_TICKS_PER_POINT;
const targetNetworkScore = computed(() => inventory.value.lineupView === "target"
  ? lineupScore(targetCovenants.value, inventory.value.targetLineup)
  : undefined);
const canUndoCurrentTarget = computed(() => canUndoTargetLineup(
  targetUndoByVersion.value[currentVersionId.value], inventory.value.targetLineup,
));
const endgamePlans = computed(() => inventory.value.endgamePlans.map((plan) => {
  const covenants = summarizeLineupCovenants(plan.pieces);
  return { ...plan, lineup: displayManualLineup(plan.pieces), covenants, score: lineupScore(covenants, plan.pieces) };
}));
const autoResult = shallowRef({});
const automaticEndgameStatus = ref("正在搜索满编阵容…");
const autoSignature = computed(() => page.value === "strategy" && strategyTab.value === "target" ? JSON.stringify([
  currentVersionId.value, currentPool.value.operators.map(({ name }) => name),
  covenantWeights.value, inventory.value.covenantLayers, inventory.value.targetCovenantNames,
  extraCovenantCounts.value,
  [...heldCovenantMembers.value].map(([name, members]) => [name, [...members].sort()]).sort(),
]) : "");
let cachedAutoResult;
watch(autoSignature, (signature, _, onCleanup) => {
  if (!signature) return;
  if (cachedAutoResult?.signature === signature) {
    autoResult.value = cachedAutoResult.result;
    return;
  }
  autoResult.value = {};
  if (typeof Worker === "undefined") {
    automaticEndgameStatus.value = "当前环境无法运行自动搜索。";
    return;
  }
  automaticEndgameStatus.value = "正在搜索满编阵容…";
  const worker = new Worker(new URL("./endgameOptimizer.worker.js", import.meta.url), { type: "module" });
  onCleanup(() => worker.terminate());
  worker.onmessage = ({ data }) => {
    autoResult.value = { ...autoResult.value, [data.size]: data.result };
    if (ENDGAME_LINEUP_SIZES.every((size) => Object.hasOwn(autoResult.value, size))) {
      cachedAutoResult = { signature, result: autoResult.value };
      worker.terminate();
    }
  };
  worker.onerror = () => {
    automaticEndgameStatus.value = "自动搜索遇到错误，请重新打开终局方案。";
    worker.terminate();
  };
  worker.postMessage(buildLineupScoring(currentVersion.value, currentPool.value.operators,
    { ...lineupScoringOptions.value, heldMembers: heldCovenantMembers.value, defaultPromoted: true }));
});
const automaticEndgamePlans = computed(() => ENDGAME_LINEUP_SIZES.map((limit) => {
  const result = autoResult.value[limit];
  const pieces = result?.pieces ?? [];
  return {
    id: `automatic-${limit}`, title: `自动方案 · ${limit} 人`, limit, pieces,
    status: result === null ? "当前池子没有足够干员组成满编阵容。" : automaticEndgameStatus.value,
    score: result ? result.score / COVENANT_TICKS_PER_POINT : undefined,
    lineup: displayManualLineup(pieces),
    covenants: result ? summarizeLineupCovenants(result.names)
      : { activeNames: [], counts: {}, advancedLevels: {} },
  };
}));

function localSetting(key, label, normalizeVersion) {
  const byVersion = ref({});
  const current = computed(() => byVersion.value[currentVersionId.value]);

  function sync() {
    if (unsavedSettings.has(key)) return;
    try {
      const stored = JSON.parse(localStorage.getItem(key));
      byVersion.value = Object.fromEntries(versions.map((version) => [
        version.id, normalizeVersion(stored?.[version.id], version),
      ]));
    } catch {
      // Keep the settings already loaded if the storage is unavailable.
    }
  }

  function update(editVersion) {
    sync();
    const versionId = currentVersionId.value;
    byVersion.value[versionId] = editVersion(current.value);
    save();
  }

  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(byVersion.value));
      unsavedSettings.delete(key);
      return true;
    } catch {
      unsavedSettings.set(key, label);
      return false;
    }
  }

  sync();
  settingReaders.set(key, sync);
  return {
    current,
    update,
    readAll() {
      sync();
      return byVersion.value;
    },
    replace(values) {
      byVersion.value = structuredClone(values);
      return save();
    },
  };
}

function syncOtherWindow(event) {
  if (event.storageArea !== localStorage) return;
  if (event.key === null) {
    for (const sync of settingReaders.values()) sync();
  } else {
    settingReaders.get(event.key)?.();
  }
}

onMounted(() => window.addEventListener("storage", syncOtherWindow));
onUnmounted(() => {
  window.removeEventListener("storage", syncOtherWindow);
  clearTimeout(statusTimer);
});

function toggleTerminal(name) {
  terminalSetting.update((names = []) => names.includes(name)
    ? names.filter((item) => item !== name)
    : [...names, name]);
}

function changeCovenantWeight(name, value) {
  const covenants = currentVersion.value.covenants;
  if (!Object.hasOwn(covenants, name) || !Number.isFinite(value)) return;
  const weight = normalizeCovenantWeight(value, covenants[name].group);
  weightSetting.update((weights) => ({ ...weights, [name]: weight }));
}

function changeTerminalCoefficient(value) {
  const coefficient = normalizeTerminalCoefficient(value);
  coefficientSetting.update(() => coefficient);
}

function changePairCoefficient(value) {
  pairCoefficientSetting.update(() => normalizePairCoefficient(value));
}

function changeStackingCoefficient(value) {
  stackingCoefficientSetting.update(() => normalizeStackingCoefficient(value));
}

function editHeldPieces(name, action) {
  if (action === "buy" && !isKnownOperator(name)) return;
  inventorySetting.update((state = normalizeInventory()) => ({
    ...state, pieces: changeHeldPieces(state.pieces, name, action),
  }));
}

function updateInventory(settings) {
  inventorySetting.update((state) => normalizeInventory({ ...state, ...settings }, currentVersion.value));
}

function toggleTargetCovenant(name) {
  if (!Object.hasOwn(currentVersion.value.covenants, name)) return;
  inventorySetting.update((state = normalizeInventory()) => ({
    ...state,
    targetCovenantNames: state.targetCovenantNames.includes(name)
      ? state.targetCovenantNames.filter((item) => item !== name)
      : [...state.targetCovenantNames, name],
  }));
}

function addAffinityBond(value) {
  const pair = readAffinityBond(value);
  if (!pair || !pair.every((name) => targetOperatorNames.value.includes(name))) return;
  const key = affinityBondKey(pair);
  inventorySetting.update((state = normalizeInventory()) => state.affinityBonds.some((bond) => affinityBondKey(bond) === key)
    ? state : { ...state, affinityBonds: [...state.affinityBonds, pair] });
}

function removeAffinityBond(pair) {
  const key = affinityBondKey(pair);
  inventorySetting.update((state = normalizeInventory()) => ({
    ...state, affinityBonds: state.affinityBonds.filter((bond) => affinityBondKey(bond) !== key),
  }));
}

function setTargetUndo(change) {
  targetUndoByVersion.value = { ...targetUndoByVersion.value, [currentVersionId.value]: change };
}

function rememberTargetChange(before, after, removedIndex) {
  const change = recordTargetLineupChange(before, after, removedIndex);
  if (change) setTargetUndo(change);
}

function undoCurrentTarget() {
  inventorySetting.update((state = normalizeInventory()) => {
    const change = targetUndoByVersion.value[currentVersionId.value];
    if (!canUndoTargetLineup(change, state.targetLineup)) return state;
    const targetLineup = undoTargetLineupChange(change, state.targetLineup);
    setTargetUndo(null);
    return { ...state, targetLineup, targetLineupSize: Math.max(state.targetLineupSize, targetLineup.length) };
  });
}

function updateManualLineup(edit, planId, removedIndex) {
  inventorySetting.update((state = normalizeInventory()) => {
    if (planId) return {
      ...state, endgamePlans: state.endgamePlans.map((plan) => plan.id === planId ? edit(plan) : plan),
    };
    const lineup = edit({ pieces: state.targetLineup, limit: state.targetLineupSize });
    rememberTargetChange(state.targetLineup, lineup.pieces, removedIndex);
    return { ...state, targetLineup: lineup.pieces, targetLineupSize: lineup.limit };
  });
}

function setTargetLimit(limit, planId) {
  if (!validLineupSize(limit)) return;
  updateManualLineup((lineup) => limit >= lineup.pieces.length ? { ...lineup, limit } : lineup, planId);
}

function isKnownOperator(name) {
  return targetOperatorNames.value.includes(name) || Object.hasOwn(inventory.value.pieces, name)
    || inventory.value.targetLineup.some((piece) => piece.name === name)
    || inventory.value.endgamePlans.some(({ pieces }) => pieces.some((piece) => piece.name === name));
}

function addTargetPiece(name, planId) {
  if (!isKnownOperator(name)) return;
  updateManualLineup((lineup) => lineup.pieces.length < lineup.limit
    ? { ...lineup, pieces: [...lineup.pieces, { name, promoted: true }] } : lineup, planId);
}

function toggleTargetPromotion(index, planId) {
  updateManualLineup((lineup) => ({
    ...lineup, pieces: lineup.pieces.map((piece, itemIndex) =>
      index === itemIndex ? { ...piece, promoted: !piece.promoted } : piece),
  }), planId);
}

function removeTargetPiece(index, planId) {
  updateManualLineup((lineup) => ({
    ...lineup, pieces: lineup.pieces.filter((_, itemIndex) => index !== itemIndex),
  }), planId, index);
}

function clearTargetLineup() {
  updateManualLineup((lineup) => ({ ...lineup, pieces: [] }));
}

function addEndgamePlan() {
  inventorySetting.update((state = normalizeInventory()) => appendEndgamePlan(state, [], DEFAULT_LINEUP_SIZE));
}

function appendEndgamePlan(state, pieces, limit) {
  const names = new Set(state.endgamePlans.map((plan) => plan.name));
  let number = 1;
  while (names.has(`${DEFAULT_ENDGAME_PLAN_NAME} ${number}`)) number++;
  const name = names.size ? `${DEFAULT_ENDGAME_PLAN_NAME} ${number}` : DEFAULT_ENDGAME_PLAN_NAME;
  const plan = { id: crypto.randomUUID(), name, pieces, limit };
  return { ...state, endgamePlans: [...state.endgamePlans, plan] };
}

function saveTargetAsEndgamePlan() {
  inventorySetting.update((state = normalizeInventory()) => state.targetLineup.length
    ? appendEndgamePlan(state, state.targetLineup.map(({ name }) => ({ name, promoted: true })), state.targetLineupSize)
    : state);
  announceConfiguration("已保存为新的终局阵容方案。");
}

function removeEndgamePlan(id) {
  inventorySetting.update((state = normalizeInventory()) => ({
    ...state, endgamePlans: state.endgamePlans.filter((plan) => plan.id !== id),
  }));
}

function renameEndgamePlan(event, plan) {
  const input = event.target;
  const name = input.value.trim() || plan.name;
  input.value = name;
  if (name !== plan.name) updateManualLineup((lineup) => ({ ...lineup, name }), plan.id);
}

function applyEndgamePlan(id) {
  inventorySetting.update((state = normalizeInventory()) => {
    const plan = state.endgamePlans.find((item) => item.id === id);
    if (!plan) return state;
    return replaceTargetWithPlan(state, plan);
  });
  announceConfiguration("已将终局阵容方案设为目标阵容。");
}

function replaceTargetWithPlan(state, plan) {
  const targetLineup = plan.pieces.map((piece) => ({ ...piece }));
  rememberTargetChange(state.targetLineup, targetLineup);
  return { ...state, targetLineup, targetLineupSize: plan.limit, lineupView: "target", collapsed: false };
}

function applyAutomaticPlan(plan) {
  if (!plan.pieces.length) return;
  inventorySetting.update((state = normalizeInventory()) => replaceTargetWithPlan(state, plan));
  announceConfiguration("已将自动方案设为目标阵容。");
}

function setInventoryCovenantCount(field, name, count) {
  const covenants = currentVersion.value.covenants;
  if (!Object.hasOwn(covenants, name) || !validCovenantLayerCount(count)) return;
  if (field === "extraCoreCounts" && covenants[name].group !== CORE_GROUP) return;
  if (field === "extraAdditionalCounts" && covenants[name].group !== ADDITIONAL_GROUP) return;
  inventorySetting.update((state = normalizeInventory()) => {
    const values = { ...state[field], [name]: count };
    if (count === 0) delete values[name];
    return { ...state, [field]: values };
  });
}

function openAnalysis() {
  analysisOpened.value = true;
  page.value = "analysis";
}

function buildConfiguration() {
  const snapshot = {
    format: CONFIG_FORMAT,
    schemaVersion: CONFIG_VERSION,
    versionId: currentVersionId.value,
    page: page.value,
    strategyTab: strategyTab.value,
    terminals: terminalSetting.readAll(),
    weights: weightSetting.readAll(),
    coefficients: coefficientSetting.readAll(),
    pairCoefficients: pairCoefficientSetting.readAll(),
    stackingCoefficients: stackingCoefficientSetting.readAll(),
    inventory: inventorySetting.readAll(),
    game: gameInformation.value.readConfiguration(),
    analysis: covenantAnalysis.value?.readConfiguration() ?? null,
  };
  return parseToolkitConfiguration(JSON.stringify(snapshot));
}

function announceConfiguration(message) {
  clearTimeout(statusTimer);
  configurationMessage.value = message;
  statusTimer = setTimeout(() => (configurationMessage.value = ""), 5000);
}

function exportConfiguration() {
  try {
    const json = JSON.stringify(buildConfiguration(), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "AKSP-Toolkit-配置.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announceConfiguration("已导出 AKSP-Toolkit 配置。");
  } catch (error) {
    announceConfiguration(`无法导出配置。${error.message}`);
  }
}

async function applyConfiguration(config) {
  targetUndoByVersion.value = {};
  const saved = [
    terminalSetting.replace(config.terminals),
    weightSetting.replace(config.weights),
    coefficientSetting.replace(config.coefficients),
    ...(config.pairCoefficients ? [pairCoefficientSetting.replace(config.pairCoefficients)] : []),
    ...(config.stackingCoefficients ? [stackingCoefficientSetting.replace(config.stackingCoefficients)] : []),
    ...(config.inventory ? [inventorySetting.replace(config.inventory)] : []),
  ].every(Boolean);
  setVersion(config.versionId);
  await nextTick();
  const gameSaved = await gameInformation.value.applyConfiguration(structuredClone(config.game));
  analysisOpened.value = config.analysis !== null;
  strategyTab.value = config.strategyTab;
  page.value = config.page;
  await nextTick();
  if (config.analysis) covenantAnalysis.value.applyConfiguration(structuredClone(config.analysis));
  return saved && gameSaved;
}

async function importConfiguration(event) {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file || configBusy.value) return;
  configBusy.value = true;
  let previous;
  try {
    const config = parseToolkitConfiguration(await file.text());
    previous = buildConfiguration();
    const saved = await applyConfiguration(config);
    previousConfiguration.value = previous;
    announceConfiguration(saved ? "配置和编队已导入，可撤销本次导入。" : "已导入当前窗口，部分设置无法写入浏览器存储。");
  } catch (error) {
    if (previous) {
      try {
        await applyConfiguration(previous);
      } catch {
        previousConfiguration.value = previous;
      }
    }
    announceConfiguration(`无法导入配置。${error.message}`);
  } finally {
    configBusy.value = false;
  }
}

async function undoConfiguration() {
  if (!previousConfiguration.value || configBusy.value) return;
  configBusy.value = true;
  try {
    const saved = await applyConfiguration(previousConfiguration.value);
    previousConfiguration.value = null;
    announceConfiguration(saved ? "已恢复导入前的配置和编队。" : "已在当前窗口恢复，部分设置无法写入浏览器存储。");
  } catch (error) {
    announceConfiguration(`无法撤销导入。${error.message}`);
  } finally {
    configBusy.value = false;
  }
}
</script>

<style scoped>
.toolkit {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 100dvh;
  background: #11161d;
  color: #edf2f7;
  text-align: left;
}
.toolkit-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px 24px;
  padding: 12px clamp(12px, 3vw, 40px);
  background: #181f28;
  border-bottom: 1px solid #303943;
}
.brand { display: flex; flex-direction: column; }
h1 { margin: 0; color: #edf2f7; font-size: 23px; line-height: 1.3; }
.brand a { font-size: 12px; color: #a3c9c6; }
nav { display: flex; gap: 5px; }
nav button {
  border: 1px solid #3b4959;
  border-radius: 8px;
  padding: 8px 12px;
  background: transparent;
  color: #c7d3df;
  font-size: 14px;
  cursor: pointer;
}
nav button:hover { background: #273543; }
nav button[aria-pressed="true"] { background: #a8ebda; border-color: #a8ebda; color: #11241f; }
.header-settings, .configuration-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.header-settings { gap: 6px 12px; }
.configuration-actions button {
  padding: 6px 9px;
  border: 1px solid #3b4959;
  border-radius: 6px;
  background: #222d3a;
  color: #edf2f7;
  font-size: 12px;
  cursor: pointer;
}
.configuration-actions button:hover:enabled { background: #304153; }
.configuration-status {
  position: fixed;
  right: 16px;
  bottom: 14px;
  z-index: 1010;
  max-width: calc(100vw - 32px);
  margin: 0;
  padding: 8px 14px;
  border: 1px solid #526175;
  border-radius: 6px;
  background: #222d3a;
  color: #edf2f7;
  font-size: 13px;
}
.game-page { min-height: 0; display: flex; flex-direction: column; text-align: center; }
.settings-warning { margin: 6px 12px 0; color: #ffc2ae; font-size: 13px; }
.game-page :deep(.arknights-tool--toolkit) {
  min-height: 0;
  padding-inline: clamp(12px, 3vw, 40px);
  background: #11161d;
}
.game-page :deep(.tab-item.active) { background: #a8ebda; color: #11241f; }
.shared-inventory { padding: 0 clamp(12px, 3vw, 40px) 16px; min-width: 0; }
.toolkit--strategy { height: 100dvh; grid-template-rows: auto minmax(min(210px, 35dvh), 1fr) auto; }
.strategy-page { display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: 14px clamp(12px, 3vw, 40px); }
.strategy-page nav { flex-shrink: 0; margin-bottom: 10px; }
.strategy-weights, .endgame-scroll { min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; }
.endgame-plans { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.endgame-actions { display: flex; flex-shrink: 0; justify-content: flex-end; margin-bottom: 8px; }
.endgame-scroll { padding: 2px; }
.endgame-grid, .auto-endgame-grid { display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; align-items: start; gap: 10px; }
.auto-endgame-grid { margin-bottom: 10px; }
.apply-endgame:disabled { opacity: .45; cursor: default; }
.endgame-empty { margin: 0; color: #abb9c9; font-size: 13px; }
.strategy-lineup, .auto-endgame { padding: 14px 16px; border: 1px solid #303943; border-radius: 10px; background: #181f28; }
.endgame-actions button, .apply-endgame, .delete-endgame { padding: 4px 7px; border: 1px solid #3b4959; border-radius: 6px; background: #222d3a; color: #edf2f7; font-size: 12px; cursor: pointer; }
.apply-endgame { border-color: #79b8ad; color: #c6f7e9; }
.endgame-actions button:hover, .apply-endgame:hover, .delete-endgame:hover { background: #304153; }
.endgame-name { width: min(12em, 52vw); padding: 2px 4px; border: 1px solid transparent; border-radius: 4px; background: transparent; color: inherit; font: inherit; }
.endgame-name:hover, .endgame-name:focus { border-color: #526175; background: #222d3a; }
@media (max-width: 760px) {
  .toolkit--analysis .toolkit-header { gap: 5px 10px; padding-block: 6px; }
}
@media (min-width: 1025px) {
  .toolkit--game { height: 100dvh; grid-template-rows: auto minmax(min(330px, 42dvh), 1fr) auto; }
}
</style>
