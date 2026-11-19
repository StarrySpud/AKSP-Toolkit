<template>
  <section class="operator-pool" :class="{ 'toolkit-pool': separateBan }">
    <!-- 筛选区（可折叠） -->
    <div class="filter-panel">
      <div class="filter-head">
        <input
          v-model="searchQuery"
          placeholder="搜索干员..."
          class="search-input"
        />

        <div class="head-actions">
          <ModuleHelp v-if="separateBan" label="干员池"
            text="单击干员购入，双击切换终端标签。可拖到持有槽或目标阵容，也可按 Alt+Enter 加到目标阵容。Ban 只筛选干员池，干员的所有盟约都被 Ban 时才移出池子。已持有干员仍可上场和激活盟约。" />
          <button
            type="button"
            class="collapse-btn"
            :title="filterCollapsed ? '展开筛选' : '收起筛选'"
            @click="filterCollapsed = !filterCollapsed"
          >
            {{ filterCollapsed ? "筛选" : "收起" }}
            <span
              class="collapse-arrow"
              :class="{ expanded: !filterCollapsed }"
              >▼</span
            >
          </button>

          <button
            type="button"
            class="add-btn"
            @click="showAddOpModal = true"
          >
            自选干员
          </button>
        </div>
        <button v-if="separateBan"
          type="button"
          class="chip terminal-filter-btn"
          :class="{ active: terminalOnly }"
          :aria-pressed="terminalOnly"
          @click="terminalOnly = !terminalOnly"
        >仅看终端干员</button>
        <div v-show="!filterCollapsed" class="icon-filter-row view-row">
          <span class="row-label">视图</span>
          <div
            class="view-switch"
            role="group"
            aria-label="筛选展示方式"
          >
            <button
              type="button"
              class="view-btn"
              :class="{ active: filterView === 'icon' }"
              :aria-pressed="filterView === 'icon'"
              title="图标筛选"
              @click="filterView = 'icon'"
            >
              图标
            </button>
            <button
              type="button"
              class="view-btn"
              :class="{ active: filterView === 'text' }"
              :aria-pressed="filterView === 'text'"
              title="文字筛选"
              @click="filterView = 'text'"
            >
              文字
            </button>
          </div>
        </div>
      </div>

      <!-- 折叠内容 -->
      <div v-show="!filterCollapsed" class="filter-body">
        <!-- 阶数 -->
        <div class="icon-filter-row">
          <span class="row-label">阶数</span>
          <div class="chip-list">
            <button
              v-for="t in TIERS"
              :key="t"
              type="button"
              class="chip tier-chip"
              :class="{ active: selectedTier === t }"
              :title="`${t} 阶干员`"
              @click="toggleFilter(selectedTier, t, (v) => (selectedTier = v))"
            >
              {{ t }}
            </button>
          </div>
        </div>

        <!-- 阵营 -->
        <div
          v-if="coreCovenants.length"
          class="icon-filter-row"
        >
          <span class="row-label">{{ separateBan ? "核心盟约" : "阵营" }}</span>

          <div
            v-if="filterView === 'icon'"
            class="icon-list"
          >
            <button
              v-for="name in coreCovenants"
              :key="name"
              type="button"
              class="cov-icon"
              :class="{
                active: selectedMainCov === name,
                banned: !separateBan && bannedCovenants.includes(name),
              }"
              v-on="covenantHoverEvents(name)"
              @click="toggleCovState(name, selectedMainCov, (v) => (selectedMainCov = v))"
            >
              <img
                :src="getIconUrl(name)"
                :alt="name"
                @error="handleImgError"
              />
            </button>
          </div>

          <div
            v-else
            class="chip-list"
          >
            <button
              v-for="name in coreCovenants"
              :key="name"
              type="button"
              class="chip"
              :class="{
                active: selectedMainCov === name,
                banned: !separateBan && bannedCovenants.includes(name),
              }"
              v-on="covenantHoverEvents(name)"
              @click="toggleCovState(name, selectedMainCov, (v) => (selectedMainCov = v))"
            >
              {{ name }}
            </button>
          </div>
        </div>

        <!-- 盟约 -->
        <div
          v-if="additionalCovenants.length"
          class="icon-filter-row"
        >
          <span class="row-label">{{ separateBan ? "附加盟约" : "盟约" }}</span>
          <span v-if="!separateBan" class="cov-hint">点两下 Ban</span>

          <div
            v-if="filterView === 'icon'"
            class="icon-list"
          >
            <button
              v-for="name in additionalCovenants"
              :key="name"
              type="button"
              class="cov-icon"
              :class="{
                active: selectedSubCov === name,
                banned: !separateBan && bannedCovenants.includes(name),
              }"
              v-on="covenantHoverEvents(name)"
              @click="toggleCovState(name, selectedSubCov, (v) => (selectedSubCov = v))"
            >
              <img
                :src="getIconUrl(name)"
                :alt="name"
                @error="handleImgError"
              />
            </button>
          </div>

          <div
            v-else
            class="chip-list"
          >
            <button
              v-for="name in additionalCovenants"
              :key="name"
              type="button"
              class="chip"
              :class="{
                active: selectedSubCov === name,
                banned: !separateBan && bannedCovenants.includes(name),
              }"
              v-on="covenantHoverEvents(name)"
              @click="toggleCovState(name, selectedSubCov, (v) => (selectedSubCov = v))"
            >
              {{ name }}
            </button>
          </div>
        </div>

        <!-- 特质 -->
        <div
          v-if="traitTypeOptions.length"
          class="icon-filter-row"
        >
          <span class="row-label">特质</span>
          <div class="chip-list">
            <button
              v-for="type in traitTypeOptions"
              :key="type"
              type="button"
              class="chip"
              :class="{ active: selectedTraitType === type }"
              @click="
                toggleFilter(selectedTraitType, type, (v) => (selectedTraitType = v))
              "
            >
              {{ type }}
            </button>
            <span class="chip-divider"></span>
            <button
              v-for="trigger in traitTriggerOptions"
              :key="trigger"
              type="button"
              class="chip trigger-chip"
              :class="{ active: selectedTraitTrigger === trigger }"
              @click="
                toggleFilter(selectedTraitTrigger, trigger, (v) => (selectedTraitTrigger = v))
              "
            >
              {{ trigger }}
            </button>
          </div>
        </div>

        <section v-if="separateBan" class="ban-section" aria-labelledby="pool-ban-title">
          <header class="ban-heading">
            <h3 id="pool-ban-title">Ban<span v-if="bannedCovenants.length">（{{ bannedCovenants.length }}）</span></h3>
            <button
              type="button"
              class="ban-toggle"
              :aria-label="banCollapsed ? '展开 Ban' : '收起 Ban'"
              :aria-expanded="!banCollapsed"
              aria-controls="pool-ban-groups"
              @click="banCollapsed = !banCollapsed"
            ><span class="ban-triangle" aria-hidden="true"></span></button>
          </header>
          <div v-show="!banCollapsed" id="pool-ban-groups">
            <div v-for="group in banGroups" :key="group.label" class="icon-filter-row" role="group" :aria-label="`Ban ${group.label}`">
              <span class="row-label">{{ group.label }}</span>
              <div class="chip-list">
                <button
                  v-for="name in group.names"
                  :key="name"
                  type="button"
                  class="chip"
                  :class="{ banned: bannedCovenants.includes(name) }"
                  :aria-label="`Ban ${name}`"
                  :aria-pressed="bannedCovenants.includes(name)"
                  v-on="covenantHoverEvents(name)"
                  @click="toggleBan(name)"
                >{{ name }}</button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- 已选筛选摘要（折叠时也保留，便于知道当前生效条件） -->
      <div
        v-if="activeFilterList.length > 0"
        class="active-filters"
      >
        <span class="active-label">已筛选</span>
        <button
          v-for="item in activeFilterList"
          :key="item.key"
          type="button"
          class="active-chip"
          :title="`取消「${item.label}」`"
          @click="item.clear()"
        >
          {{ item.label }}
          <span class="active-x">×</span>
        </button>
        <button
          type="button"
          class="active-clear"
          @click="clearAllFilters"
        >
          清除全部
        </button>
      </div>
    </div>

    <!-- 小屏折叠开关：仅在移动端显示，用于把干员列表收起以腾出编队空间 -->
    <button
      type="button"
      class="pool-toggle"
      :class="{ collapsed: isPoolCollapsed }"
      :aria-expanded="!isPoolCollapsed"
      @click="togglePoolCollapse"
    >
      <span class="pool-toggle-title">干员池</span>
      <span class="pool-toggle-count">{{ filteredPool.length }}</span>
      <span v-if="!separateBan" class="pool-toggle-hint">{{
        isPoolCollapsed ? "已收起，点击展开" : "点击收起"
      }}</span>
      <span class="pool-toggle-arrow">▼</span>
    </button>

    <div
      v-show="!isPoolCollapsed"
      class="drag-area scrollable"
    >
      <VueDraggable
        v-model="filteredPool"
        :group="{ name: 'ops', pull: 'clone', put: false }"
        :sort="false"
        class="pool-grid"
        :disabled="isMobile || separateBan"
      >
        <div
          v-for="op in filteredPool"
          :key="op.id"
          class="op-unit"
          :class="{ 'terminal-operator': terminalSet.has(op.name) }"
          :draggable="separateBan ? true : undefined"
          :tabindex="separateBan ? 0 : undefined"
          :role="separateBan ? 'button' : undefined"
          :aria-keyshortcuts="separateBan ? 'Alt+Enter Shift+Enter' : undefined"
          @dragstart="handleOperatorDrag($event, op)"
          @keydown="handleOperatorKeydown($event, op)"
          @click="handleOperatorClick($event, op)"
          @dblclick="handleOperatorDoubleClick(op)"
          @mouseenter="hoverTraits($event, op)"
          @mousemove="moveTraitTooltip"
          @mouseleave="hideTraitTooltip"
        >
          <img
            :src="op.avatar"
            @error="handleImgError"
          />
          <span class="name-label">{{ op.name }}</span>
          <span class="tier-tag">{{ getTier(op) }}</span>
          <span v-if="terminalSet.has(op.name)" class="terminal-tag" title="终端干员">◆ 终端</span>
          <span
            v-if="op.isSelfOperator"
            class="self-tag"
          >
            自选
          </span>
        </div>
      </VueDraggable>

      <div
        v-if="filteredPool.length === 0"
        class="pool-empty"
      >
        <p class="empty-title">{{ terminalOnly ? "没有符合条件的终端干员" : "没有符合条件的干员" }}</p>
        <p v-if="!separateBan" class="empty-hint">减少或清除筛选条件试试</p>
      </div>
    </div>

    <AddOpPanel
      :show="showAddOpModal"
      :compact-help="separateBan"
      :selected-operators="selectedSelfOperators"
      @close="showAddOpModal = false"
      @confirm="handleSelfOperatorsConfirm"
    />
  </section>
</template>

<script setup>
  import ModuleHelp from "./ModuleHelp.vue";
  import { startOperatorDrag } from "../AKSP-Toolkit/operatorDrag.js";
  import { ref, computed, onMounted, onUnmounted, watch } from "vue";
  import { VueDraggable } from "vue-draggable-plus";

  import AddOpPanel from "./AddOpPanel.vue";
  import selfOpConfig from "../data/selfOp.json";
  import {
    getOperatorCovenants,
    getOperatorTier,
    getOperatorTraits,
    isOperatorBanned,
  } from "@/data/versions.js";
  import { useGameVersion } from "@/composables/useGameVersion.js";
  import {
    showTraitTooltip,
    moveTraitTooltip,
    hideTraitTooltip,
  } from "@/composables/useTraitTooltip.js";
  import {
    showCovenantTooltip,
    moveCovenantTooltip,
    hideCovenantTooltip,
    isCoarsePointer,
  } from "@/composables/useCovenantTooltip.js";
  import { handleImgError, getIconUrl, getAvatarUrl } from "@/utils/index.js";

  const {
    currentVersion,
    currentVersionId,
    coreCovenants,
    additionalCovenants,
  } = useGameVersion();

  const TIERS = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ"];

  const FILTER_VIEW_KEY = "arknights_pool_filter_view";
  const FILTER_COLLAPSED_KEY = "arknights_pool_filter_collapsed";
  /** 移动端断点，与样式中的媒体查询保持一致 */
  const MOBILE_QUERY = "(max-width: 1024px)";

  // 筛选状态
  const searchQuery = ref("");
  const selectedTier = ref("");
  const selectedMainCov = ref("");
  const selectedSubCov = ref("");
  const selectedTraitType = ref("");
  const selectedTraitTrigger = ref("");
  const bannedCovenants = ref([]);
  const filterCollapsed = ref(false);
  const filterView = ref("icon");
  const showAddOpModal = ref(false);
  const selectedSelfOperators = ref([]);
  const SELF_OP_STORAGE_KEY = "arknights_selected_self_operators";

  // 移动端：干员池折叠
  const isMobile = ref(false);
  const poolCollapsed = ref(false);
  /** 仅在移动端生效，桌面端始终展开 */
  const isPoolCollapsed = computed(
    () => isMobile.value && poolCollapsed.value,
  );
  let mobileMediaQuery = null;

  const togglePoolCollapse = () => {
    poolCollapsed.value = !poolCollapsed.value;
  };

  /** 视口跨过断点时同步状态：回到宽屏自动展开，避免“列表消失” */
  const handleViewportChange = (event) => {
    isMobile.value = event.matches;
    if (!event.matches) {
      poolCollapsed.value = false;
    }
  };

  const props = defineProps({
    separateBan: Boolean,
    terminalNames: { type: Array, default: () => [] },
  });
  const emit = defineEmits(["addToTeam", "available-pool", "toggle-terminal", "add-target-operator"]);
  const terminalSet = computed(() => new Set(props.terminalNames));
  const terminalOnly = ref(false);
  const banCollapsed = ref(false);
  let pendingClick;
  const banGroups = computed(() => [
    { label: "核心盟约", names: coreCovenants.value },
    { label: "附加盟约", names: additionalCovenants.value },
  ]);

  /** 单选切换：点击已选项则取消，否则选中 */
  const toggleFilter = (current, value, setter) => {
    // 触屏点按会同时触发 mouseenter，点完就收起提示，避免遮挡后续操作
    if (isCoarsePointer()) {
      hideCovenantTooltip();
    }
    setter(current === value ? "" : value);
  };

  /**
   * 盟约三态切换（筛选与 Ban 合并，同一组按钮）：
   * 未选中 → 点一下 = 按该盟约筛选；已选中 → 再点一下 = Ban；
   * 已 Ban → 再点一下 = 取消 Ban。
   */
  const toggleCovState = (cov, currentSelected, setter) => {
    if (props.separateBan) {
      toggleFilter(currentSelected, cov, setter);
      return;
    }
    if (isCoarsePointer()) {
      hideCovenantTooltip();
    }
    if (currentSelected === cov) {
      // 第二次点击：筛选 → Ban
      setter("");
      if (!bannedCovenants.value.includes(cov)) {
        bannedCovenants.value = [...bannedCovenants.value, cov];
      }
    } else if (bannedCovenants.value.includes(cov)) {
      // 第三次点击：取消 Ban
      bannedCovenants.value = bannedCovenants.value.filter((c) => c !== cov);
    } else {
      // 第一次点击：选中筛选
      setter(cov);
    }
  };

  const toggleBan = (name) => {
    if (isCoarsePointer()) hideCovenantTooltip();
    bannedCovenants.value = bannedCovenants.value.includes(name)
      ? bannedCovenants.value.filter((covenant) => covenant !== name)
      : [...bannedCovenants.value, name];
  };

  /** 悬停盟约入口时展示效果详情（图标 / 文字 chip / Ban 列表共用） */
  const covenantHoverEvents = (name) => ({
    mouseenter: (event) => showCovenantTooltip(event, name),
    mousemove: moveCovenantTooltip,
    mouseleave: hideCovenantTooltip,
  });

  /** 当前生效的筛选项摘要，用于顶部回显与逐项取消 */
  const activeFilterList = computed(() => {
    const list = [];
    if (terminalOnly.value) {
      list.push({ key: "terminal", label: "仅看终端干员", clear: () => (terminalOnly.value = false) });
    }
    if (selectedTier.value) {
      list.push({
        key: "tier",
        label: `${selectedTier.value}阶`,
        clear: () => (selectedTier.value = ""),
      });
    }
    if (selectedMainCov.value) {
      list.push({
        key: "main",
        label: selectedMainCov.value,
        clear: () => (selectedMainCov.value = ""),
      });
    }
    if (selectedSubCov.value) {
      list.push({
        key: "sub",
        label: selectedSubCov.value,
        clear: () => (selectedSubCov.value = ""),
      });
    }
    if (selectedTraitType.value) {
      list.push({
        key: "traitType",
        label: selectedTraitType.value,
        clear: () => (selectedTraitType.value = ""),
      });
    }
    if (selectedTraitTrigger.value) {
      list.push({
        key: "traitTrigger",
        label: selectedTraitTrigger.value,
        clear: () => (selectedTraitTrigger.value = ""),
      });
    }
    for (const cov of bannedCovenants.value) {
      list.push({
        key: `ban-${cov}`,
        label: `Ban ${cov}`,
        clear: () =>
          (bannedCovenants.value = bannedCovenants.value.filter(
            (c) => c !== cov,
          )),
      });
    }
    return list;
  });

  const clearAllFilters = () => {
    terminalOnly.value = false;
    selectedTier.value = "";
    selectedMainCov.value = "";
    selectedSubCov.value = "";
    selectedTraitType.value = "";
    selectedTraitTrigger.value = "";
    bannedCovenants.value = [];
  };

  // 干员池处理
  const baseOperators = computed(() =>
    Object.keys(currentVersion.value.operators).map((name, index) => ({
      id: index,
      name,
      avatar: getAvatarUrl(name),
    })),
  );

  const operatorPool = computed(() => {
    const selfOperators = selectedSelfOperators.value.map((op, index) => ({
      id: `self-${op.tier}-${op.name}-${index}`,
      ...op,
    }));
    return [...baseOperators.value, ...selfOperators];
  });

  const getOperatorConfig = (name) => {
    return currentVersion.value.operators[name] || selfOpConfig[name];
  };

  const getTier = (op) => {
    return op.tier || getOperatorTier(op.name, currentVersion.value) || "";
  };

  /** 当前版本可选的全部盟约（核心 + 附加），供 Ban 列表使用 */
  const allCovenants = computed(() => [
    ...coreCovenants.value,
    ...additionalCovenants.value,
  ]);

  /** 当前版本出现的特质类型选项 */
  const traitTypeOptions = computed(() => {
    const types = new Set();
    for (const data of Object.values(currentVersion.value.operators)) {
      for (const trait of data.traits || []) {
        if (trait.type) {
          types.add(trait.type);
        }
      }
    }
    return [...types];
  });

  /** 当前版本出现的特质触发时机选项 */
  const traitTriggerOptions = computed(() => {
    const triggers = new Set();
    for (const data of Object.values(currentVersion.value.operators)) {
      for (const trait of data.traits || []) {
        if (trait.trigger) {
          triggers.add(trait.trigger);
        }
      }
    }
    return [...triggers];
  });

  /** Ban 判定：干员的全部盟约都被 Ban 才隐藏（无盟约的干员不受影响） */
  /**
   * Ban 命中判定（按版本策略区分）：
   * - covenant 策略（盟约版）：干员的全部盟约都被 Ban 才隐藏
   * - faction 策略（规程版）：Ban 阵营 = 带该阵营的干员全部隐藏；
   *   附加盟约仍按「全部被 Ban 才隐藏」
   */
  const isBanned = (covenants) => {
    if (bannedCovenants.value.length === 0 || covenants.length === 0) {
      return false;
    }
    if (!props.separateBan && currentVersion.value.banStrategy === "faction") {
      const factionBanned = covenants.some(
        (cov) =>
          coreCovenants.value.includes(cov) &&
          bannedCovenants.value.includes(cov),
      );
      if (factionBanned) {
        return true;
      }
    }
    return isOperatorBanned(covenants, bannedSet.value);
  };
  const bannedSet = computed(() => new Set(bannedCovenants.value));

  /** 悬停展示干员特质与所属盟约 */
  const hoverTraits = (event, op) => {
    showTraitTooltip(
      event,
      op.name,
      getOperatorTraits(op.name, currentVersion.value),
      "",
      getOperatorCovenants(op.name, currentVersion.value),
    );
  };

  const availablePool = computed(() =>
    operatorPool.value.filter(
      (op) => !isBanned(getOperatorCovenants(op.name, currentVersion.value)),
    ),
  );

  if (props.separateBan) {
    watch(
      [currentVersionId, availablePool, bannedCovenants],
      ([versionId, operators, banned]) => {
        emit("available-pool", { versionId, operators, banned, allOperators: operatorPool.value });
      },
      { immediate: true },
    );
  }

  const filteredPool = computed(() => {
    return availablePool.value.filter((op) => {
      if (terminalOnly.value && !terminalSet.value.has(op.name)) return false;
      const data = getOperatorConfig(op.name);
      if (!data) {
        return false;
      }
      const covenants = getOperatorCovenants(op.name, currentVersion.value);
      const traits = getOperatorTraits(op.name, currentVersion.value);
      const matchName = op.name.includes(searchQuery.value);
      const matchTier = selectedTier.value === "" || getTier(op) === selectedTier.value;
      const matchMainCov =
        selectedMainCov.value === "" || covenants.includes(selectedMainCov.value);
      const matchSubCov =
        selectedSubCov.value === "" || covenants.includes(selectedSubCov.value);
      const matchTraitType =
        selectedTraitType.value === "" ||
        traits.some((trait) => trait.type === selectedTraitType.value);
      const matchTraitTrigger =
        selectedTraitTrigger.value === "" ||
        traits.some((trait) => trait.trigger === selectedTraitTrigger.value);
      return (
        matchName &&
        matchTier &&
        matchMainCov &&
        matchSubCov &&
        matchTraitType &&
        matchTraitTrigger
      );
    });
  });

  // 切换版本时清理已失效的筛选条件
  watch(currentVersionId, () => {
    clearPendingClick();
    if (!coreCovenants.value.includes(selectedMainCov.value)) {
      selectedMainCov.value = "";
    }
    if (!additionalCovenants.value.includes(selectedSubCov.value)) {
      selectedSubCov.value = "";
    }
    if (!traitTypeOptions.value.includes(selectedTraitType.value)) {
      selectedTraitType.value = "";
    }
    if (!traitTriggerOptions.value.includes(selectedTraitTrigger.value)) {
      selectedTraitTrigger.value = "";
    }
    bannedCovenants.value = bannedCovenants.value.filter((cov) =>
      allCovenants.value.includes(cov),
    );
  });

  function clearPendingClick() {
    clearTimeout(pendingClick?.timer);
    pendingClick = undefined;
  }

  function handleOperatorClick(event, op) {
    if (!props.separateBan || event.detail === 0) {
      emit("addToTeam", op);
      return;
    }
    if (event.detail > 1) {
      if (pendingClick?.op.id === op.id) clearPendingClick();
      return;
    }

    if (pendingClick) {
      const previous = pendingClick.op;
      clearPendingClick();
      emit("addToTeam", previous);
    }
    // A native double-click delivers two click events before dblclick.
    const timer = setTimeout(() => {
      pendingClick = undefined;
      emit("addToTeam", op);
    }, 500);
    pendingClick = { timer, op };
  }

  function handleOperatorDoubleClick(op) {
    if (!props.separateBan) return;
    if (pendingClick?.op.id === op.id) clearPendingClick();
    emit("toggle-terminal", op.name);
  }

  function handleOperatorDrag(event, op) {
    if (!props.separateBan) return;
    if (pendingClick?.op.id === op.id) clearPendingClick();
    startOperatorDrag(event, op.name);
  }

  function handleOperatorKeydown(event, op) {
    if (!props.separateBan || !["Enter", " "].includes(event.key)) return;
    if (event.key === " " && (event.altKey || event.shiftKey)) return;
    event.preventDefault();
    if (event.altKey) emit("add-target-operator", op.name);
    else if (event.shiftKey) handleOperatorDoubleClick(op);
    else emit("addToTeam", op);
  }

  const handleSelfOperatorsConfirm = (operators) => {
    selectedSelfOperators.value = operators;
    showAddOpModal.value = false;
  };

  const normalizeSelfOperators = (operators) => {
    if (!Array.isArray(operators)) {
      return [];
    }

    return operators
      .filter((op) => selfOpConfig[op?.name] && ["Ⅴ", "Ⅵ"].includes(op?.tier))
      .map((op) => ({
        name: op.name,
        tier: op.tier,
        avatar: getAvatarUrl(op.name),
        isSelfOperator: true,
      }));
  };

  const configurationFields = {
    searchQuery, selectedTier, selectedMainCov, selectedSubCov,
    selectedTraitType, selectedTraitTrigger, bannedCovenants, selectedSelfOperators,
    filterView, filterCollapsed, poolCollapsed, terminalOnly, banCollapsed,
  };

  function savePoolPreference(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function applyConfiguration(config) {
    clearPendingClick();
    showAddOpModal.value = false;
    for (const [name, state] of Object.entries(configurationFields)) state.value = config[name];
    selectedSelfOperators.value = normalizeSelfOperators(config.selectedSelfOperators);
    bannedCovenants.value = config.bannedCovenants.filter((name) => allCovenants.value.includes(name));
    return [
      savePoolPreference(SELF_OP_STORAGE_KEY, JSON.stringify(selectedSelfOperators.value)),
      savePoolPreference(FILTER_VIEW_KEY, filterView.value),
      savePoolPreference(FILTER_COLLAPSED_KEY, filterCollapsed.value ? "1" : "0"),
    ].every(Boolean);
  }

  defineExpose({
    readConfiguration: () => Object.fromEntries(
      Object.entries(configurationFields).map(([name, state]) => [name, state.value]),
    ),
    applyConfiguration,
  });

  onMounted(() => {
    try {
      const saved = localStorage.getItem(SELF_OP_STORAGE_KEY);
      if (saved) {
        selectedSelfOperators.value = normalizeSelfOperators(
          JSON.parse(saved),
        );
      }
    } catch (error) {
      console.error("加载自选干员缓存失败", error);
      selectedSelfOperators.value = [];
    }

    // 恢复筛选区偏好
    const savedView = localStorage.getItem(FILTER_VIEW_KEY);
    if (savedView === "icon" || savedView === "text") {
      filterView.value = savedView;
    }
    filterCollapsed.value = localStorage.getItem(FILTER_COLLAPSED_KEY) === "1";

    // 监听小屏断点，用于干员池折叠
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      mobileMediaQuery = window.matchMedia(MOBILE_QUERY);
      isMobile.value = mobileMediaQuery.matches;
      if (typeof mobileMediaQuery.addEventListener === "function") {
        mobileMediaQuery.addEventListener("change", handleViewportChange);
      } else {
        mobileMediaQuery.addListener?.(handleViewportChange);
      }
    }
  });

  onUnmounted(() => {
    clearPendingClick();
    if (!mobileMediaQuery) {
      return;
    }
    if (typeof mobileMediaQuery.removeEventListener === "function") {
      mobileMediaQuery.removeEventListener("change", handleViewportChange);
    } else {
      mobileMediaQuery.removeListener?.(handleViewportChange);
    }
    mobileMediaQuery = null;
  });

  watch(
    selectedSelfOperators,
    (value) => {
      savePoolPreference(SELF_OP_STORAGE_KEY, JSON.stringify(value));
    },
    { deep: true },
  );

  watch(filterView, (value) => {
    savePoolPreference(FILTER_VIEW_KEY, value);
  });

  watch(filterCollapsed, (value) => {
    savePoolPreference(FILTER_COLLAPSED_KEY, value ? "1" : "0");
  });
</script>

<style scoped>
  .terminal-filter-btn {
    white-space: nowrap;
  }

  .toolkit-pool .op-unit {
    touch-action: manipulation;
  }

  .terminal-tag {
    color: #ffe2ab;
    font-size: 10px;
    line-height: 1.2;
    white-space: nowrap;
  }

  .terminal-operator img {
    outline: 1px solid #ffe2ab;
  }

  .toolkit-pool .row-label {
    flex-basis: 54px;
  }

  .ban-section {
    border-block: 1px solid #3b414a;
    padding-block: 4px 6px;
    width: 100%;
  }

  .ban-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #a0aaba;
  }

  .ban-heading h3 {
    margin: 0;
    color: inherit;
    font-size: 12px;
    font-weight: 500;
    text-align: left;
  }

  .ban-toggle {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .ban-toggle:hover {
    background: #303943;
  }

  .ban-triangle {
    width: 0;
    height: 0;
    border-inline: 3.5px solid transparent;
    border-top: 5px solid currentColor;
  }

  .ban-toggle[aria-expanded="false"] .ban-triangle {
    transform: rotate(-90deg);
  }

  .ban-section .icon-filter-row + .icon-filter-row {
    margin-top: 6px;
  }

  /* 筛选面板 */
  .filter-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px;
    background: #1b1b1b;
    border: 1px solid #333;
    border-radius: 6px;
  }

  .filter-head {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .search-input {
    background: #2a2a2a;
    border: 1px solid #444;
    color: #fff;
    padding: 7px 8px;
    border-radius: 4px;
    font-size: 13px;
    flex: 1 1 110px;
    min-width: 0;
  }

  .head-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  .operator-pool:not(.toolkit-pool) .view-row {
    flex-basis: 100%;
  }

  .toolkit-pool .view-row {
    align-items: center;
    flex: 0 0 auto;
    width: auto;
    gap: 6px;
  }

  .toolkit-pool .view-row .row-label {
    flex: 0 0 auto;
    line-height: 1;
  }

  .toolkit-pool .view-switch {
    white-space: nowrap;
  }

  /* 图标 / 文字 切换 */
  .view-switch {
    display: inline-flex;
    border: 1px solid #444;
    border-radius: 4px;
    overflow: hidden;
  }

  .view-btn {
    background: #2a2a2a;
    border: none;
    color: #888;
    font-size: 12px;
    padding: 6px 8px;
    cursor: pointer;
    line-height: 1;
  }

  .view-btn:hover {
    color: #ddd;
  }

  .view-btn.active {
    background: rgba(255, 207, 0, 0.18);
    color: #ffcf00;
  }

  .collapse-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #2a2a2a;
    border: 1px solid #444;
    color: #aaa;
    font-size: 12px;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
    line-height: 1;
    white-space: nowrap;
  }

  .collapse-btn:hover {
    color: #fff;
    border-color: #888;
  }

  .collapse-arrow {
    font-size: 9px;
    transition: transform 0.2s;
  }

  .collapse-arrow.expanded {
    transform: rotate(180deg);
  }

  .filter-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    flex: 1;
    min-width: 0;
  }

  .chip {
    background: #2a2a2a;
    border: 1px solid #444;
    color: #bbb;
    border-radius: 4px;
    padding: 5px 8px;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    white-space: nowrap;
    transition:
      border-color 0.15s,
      color 0.15s,
      background 0.15s;
  }

  .chip:hover {
    border-color: #888;
    color: #fff;
  }

  .chip.active {
    background: rgba(255, 207, 0, 0.16);
    border-color: #ffcf00;
    color: #ffcf00;
    font-weight: bold;
  }

  .chip.trigger-chip {
    color: #9db8c9;
  }

  .chip.trigger-chip.active {
    background: rgba(110, 180, 220, 0.16);
    border-color: #6eb4dc;
    color: #6eb4dc;
  }

  /* 图标筛选行 */
  .icon-filter-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
  }

  .row-label {
    flex: 0 0 30px;
    font-size: 12px;
    color: #888;
    line-height: 32px;
    text-align: right;
    user-select: none;
  }

  .icon-list {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    flex: 1;
    min-width: 0;
  }

  .cov-icon {
    width: 32px;
    height: 32px;
    padding: 2px;
    background: #222;
    border: 1px solid #3a3a3a;
    border-radius: 50%;
    cursor: pointer;
    opacity: 0.66;
    position: relative;
    transition:
      opacity 0.15s,
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .cov-icon img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    display: block;
    object-fit: contain;
  }

  .cov-icon:hover {
    opacity: 1;
    border-color: #888;
  }

  .cov-icon.active {
    opacity: 1;
    border-color: #ffcf00;
    box-shadow: 0 0 0 1px #ffcf00, 0 0 8px rgba(255, 207, 0, 0.35);
  }

  .chip-divider {
    width: 1px;
    height: 16px;
    background: #444;
    margin: 0 4px;
  }

  /* 已选筛选摘要 */
  .active-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    width: 100%;
  }

  .active-label {
    font-size: 11px;
    color: #777;
    margin-right: 2px;
  }

  .active-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(255, 207, 0, 0.14);
    border: 1px solid rgba(255, 207, 0, 0.5);
    color: #ffcf00;
    font-size: 11px;
    line-height: 1;
    padding: 4px 7px;
    border-radius: 10px;
    cursor: pointer;
  }

  .active-chip:hover {
    background: rgba(255, 207, 0, 0.24);
  }

  .active-x {
    font-size: 12px;
    opacity: 0.75;
  }

  .active-clear {
    background: transparent;
    border: none;
    color: #888;
    font-size: 11px;
    cursor: pointer;
    padding: 2px 4px;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .active-clear:hover {
    color: #ccc;
  }

  /* Ban 盟约：内联区块 */
  /* 盟约 Ban 态：筛选与 Ban 同一组按钮，Ban 样式区别于选中 */
  .cov-hint {
    font-size: 11px;
    color: #666;
    margin-left: 2px;
    white-space: nowrap;
  }

  .chip.banned {
    background: rgba(255, 77, 79, 0.14);
    border-color: #ff4d4f;
    color: #ff8a8c;
    text-decoration: line-through;
    text-decoration-color: rgba(255, 138, 140, 0.7);
  }

  .cov-icon.banned {
    border-color: #ff4d4f;
    box-shadow: 0 0 0 1px #ff4d4f, 0 0 8px rgba(255, 77, 79, 0.35);
  }

  .cov-icon.banned img {
    filter: grayscale(1) brightness(0.55);
  }

  .cov-icon.banned::after {
    content: "\2715";
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ff6b6d;
    font-size: 16px;
    font-weight: bold;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
    pointer-events: none;
  }

  /* 干员单元格 */
  .op-unit {
    position: relative;
    width: 75px;
    text-align: center;
    cursor: pointer;
  }

  .op-unit img {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 4px;
    background: #222;
    display: block;
  }

  .name-label {
    font-size: 12px;
    display: block;
    margin-top: 5px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .tier-tag {
    position: absolute;
    top: 0;
    left: 0;
    background: rgba(0, 0, 0, 0.8);
    color: #ffcf00;
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 4px 0 4px 0;
  }

  .self-tag {
    position: absolute;
    top: 2px;
    right: 2px;
    background: rgba(255, 207, 0, 0.2);
    color: rgba(255, 240, 180, 0.88);
    font-size: 9px;
    font-weight: 500;
    line-height: 1;
    padding: 2px 3px;
    border: 1px solid rgba(255, 207, 0, 0.28);
    border-radius: 3px;
  }

  /* 拖拽区与网格 */
  .operator-pool {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* 移动端折叠开关：默认隐藏，仅小屏出现 */
  .pool-toggle {
    display: none;
  }

  .drag-area {
    padding: 15px;
    background: #181818;
    border: 1px solid #333;
    min-height: 100px;
    max-height: 80vh;
    align-content: flex-start;
    /* 仅在元素是滚动容器（overflow-y:auto/scroll）时生效，
       桌面端 .scrollable 会把它变成滚动区 */
    -webkit-overflow-scrolling: touch;
  }

  .pool-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 180px;
    color: #888;
    user-select: none;
  }

  .pool-empty .empty-title {
    margin: 0;
    font-size: 14px;
    color: #aaa;
  }

  .pool-empty .empty-hint {
    margin: 0;
    font-size: 12px;
    color: #666;
  }

  .pool-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    align-content: flex-start;
    width: 100%;
  }

  .scrollable {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .add-btn {
    background: #ffcf00;
    border: none;
    color: #121212;
    border-radius: 4px;
    padding: 7px 10px;
    font-size: 13px;
    font-weight: bold;
    cursor: pointer;
    white-space: nowrap;
    flex: 0 0 auto;
  }

  .add-btn:hover {
    background: #ffdd44;
  }

  @media (max-width: 1024px) {
    .operator-pool {
      width: 100%;
    }

    .row-label {
      flex-basis: 34px;
    }

    /* 堆叠布局下取消内部滚动上限：展开的干员池随页面自然滚动，
       不再出现内部滚动区与页面滚动打架导致「溢出无法操作」。
       注意 .drag-area 同时带 .scrollable 类，必须同时覆盖 .scrollable，
       否则 .scrollable 的 overflow-y:auto 会让元素仍是内部滚动容器 */
    .drag-area,
    .scrollable {
      max-height: none;
      overflow-y: visible;
      /* flex:1 + min-height:0 在无固定高度的父级里会塌成很小的视口高度，
         使元素成为内部滚动区。移动端改为按内容自然高度 */
      flex: 0 0 auto;
      min-height: 0;
    }

    /* 干员池折叠条：堆叠布局时可用，把长列表收起腾出编队空间 */
    .pool-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 10px 12px;
      background: #1b1b1b;
      border: 1px solid #333;
      border-radius: 6px;
      color: #ccc;
      font-size: 13px;
      line-height: 1;
      cursor: pointer;
      text-align: left;
    }

    .pool-toggle:active {
      background: #232323;
    }
    .pool-toggle-title {
      font-weight: bold;
      color: #eee;
    }

    .pool-toggle-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 20px;
      padding: 0 6px;
      background: rgba(255, 207, 0, 0.16);
      border: 1px solid rgba(255, 207, 0, 0.4);
      border-radius: 10px;
      color: #ffcf00;
      font-size: 11px;
      font-weight: bold;
    }

    .pool-toggle-hint {
      margin-left: auto;
      font-size: 11px;
      color: #777;
      white-space: nowrap;
    }

    .pool-toggle-arrow {
      font-size: 9px;
      color: #888;
      transition: transform 0.2s;
    }

    .pool-toggle.collapsed .pool-toggle-arrow {
      transform: rotate(-90deg);
    }

    .pool-toggle.collapsed .pool-toggle-hint {
      color: #999;
    }

  }

  @media (max-width: 768px) {
    .operator-pool {
      gap: 12px;
    }

    .filter-panel {
      gap: 8px;
      padding: 8px 10px;
    }

    .filter-head {
      gap: 6px;
    }

    .search-input {
      flex: 1 1 100%;
      padding: 8px 10px;
      font-size: 14px;
    }

    .head-actions {
      width: 100%;
      margin-left: 0;
      gap: 6px;
    }

    .toolkit-pool .head-actions {
      width: auto;
    }

    .toolkit-pool .search-input {
      flex-basis: 110px;
    }

    .view-btn,
    .collapse-btn {
      padding: 8px 10px;
      font-size: 12px;
    }

    .add-btn {
      margin-left: auto;
      padding: 8px 12px;
    }

    .row-label {
      flex-basis: 30px;
      font-size: 11px;
      line-height: 30px;
    }

    .icon-filter-row {
      gap: 6px;
    }

    .chip {
      padding: 8px 10px;
      font-size: 12px;
    }

    .cov-hint {
      display: none;
    }

    .cov-icon {
      width: 34px;
      height: 34px;
    }

    /* 干员网格：固定列宽改为自适应列 */
    .drag-area {
      padding: 10px;
      min-height: 80px;
    }

    .pool-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
      gap: 10px 8px;
    }

    .pool-grid .op-unit {
      width: auto;
    }

    .name-label {
      font-size: 11px;
      margin-top: 4px;
    }





    .active-chip {
      padding: 5px 8px;
    }
  }

  @media (max-width: 420px) {
    .pool-toggle-hint {
      display: none;
    }

    .pool-grid {
      grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
      gap: 12px 8px;
    }
  }
</style>
