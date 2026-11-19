<template>
  <button
    v-if="launcherMode"
    type="button"
    class="launcher-heart"
    :class="{ enabled: enabled && ready }"
    :disabled="!ready || changing"
    :title="label"
    :aria-label="label"
    :aria-pressed="enabled && ready"
    @click="toggleMonitoring"
  ><span aria-hidden="true">{{ enabled ? "♥" : "♡" }}</span></button>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

const launcherMode = import.meta.env.MODE === "launcher";
const heartbeatInterval = 60_000;
const enabled = ref(true);
const ready = ref(false);
const changing = ref(false);
const failed = ref(false);
const label = computed(() => {
  if (failed.value) return "心跳连接失败，等待重试";
  if (!ready.value) return "正在连接本地服务";
  return enabled.value ? "心跳检查已开启，点击暂停自动退出" : "心跳检查已暂停，点击恢复自动退出";
});
let tabId;
let timer;
let channel;
let active = false;
let revision = 0;
let lastAttempt = 0;
let sending = false;

function endpoint(action, query = {}) {
  const params = new URLSearchParams({ tab: tabId, ...query });
  return `/__aksp_launcher/${action}?${params}`;
}

function stopTimer() {
  clearInterval(timer);
  timer = undefined;
}

function applyStatus(nextEnabled, broadcast = false) {
  const changed = enabled.value !== nextEnabled;
  failed.value = false;
  ready.value = true;
  enabled.value = nextEnabled;
  if (!nextEnabled) stopTimer();
  else if (active && timer === undefined) timer = setInterval(pulse, heartbeatInterval);
  if (changed && broadcast) channel?.postMessage(nextEnabled);
}

async function requestStatus(action, query) {
  const response = await fetch(endpoint(action, query), { method: "POST", keepalive: true, cache: "no-store" });
  if (!response.ok) throw new Error("Launcher request failed");
  const data = await response.json();
  if (typeof data.enabled !== "boolean") throw new Error("Invalid launcher response");
  return data.enabled;
}

async function pulse() {
  if (!active || !enabled.value || sending || changing.value) return;
  const requestRevision = revision;
  sending = true;
  lastAttempt = Date.now();
  try {
    const status = await requestStatus("heartbeat");
    if (active && requestRevision === revision) applyStatus(status, true);
  } catch {
    if (active && requestRevision === revision) failed.value = true;
  } finally {
    sending = false;
  }
}

async function toggleMonitoring() {
  if (!active || !ready.value || changing.value) return;
  changing.value = true;
  const requestRevision = ++revision;
  try {
    const status = await requestStatus("monitor", { enabled: String(!enabled.value) });
    if (active && requestRevision === revision) applyStatus(status, true);
  } catch {
    if (active && requestRevision === revision) failed.value = true;
  } finally {
    changing.value = false;
  }
}

function startPage() {
  if (active) return;
  active = true;
  tabId = crypto.randomUUID();
  applyStatus(true);
  ready.value = false;
  void pulse();
}

function closePage() {
  if (!active) return;
  active = false;
  revision++;
  stopTimer();
  void fetch(endpoint("close"), { method: "POST", keepalive: true }).catch(() => {});
}

function checkVisible() {
  if (document.visibilityState === "visible" && Date.now() - lastAttempt >= heartbeatInterval) {
    void pulse();
  }
}

onMounted(() => {
  if (!launcherMode) return;
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("aksp-launcher-monitor");
    channel.onmessage = ({ data }) => {
      if (!active || typeof data !== "boolean") return;
      revision++;
      applyStatus(data);
      if (data) void pulse();
    };
  }
  window.addEventListener("pageshow", startPage);
  window.addEventListener("pagehide", closePage);
  document.addEventListener("visibilitychange", checkVisible);
  startPage();
});

onUnmounted(() => {
  if (!launcherMode) return;
  window.removeEventListener("pageshow", startPage);
  window.removeEventListener("pagehide", closePage);
  document.removeEventListener("visibilitychange", checkVisible);
  channel?.close();
  closePage();
});
</script>

<style scoped>
.launcher-heart {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #475769;
  border-radius: 6px;
  background: #222d3a;
  color: #bcc7d6;
  font-size: 19px;
  line-height: 1;
  cursor: pointer;
}
.launcher-heart.enabled { color: #ff929f; }
.launcher-heart:hover:enabled { background: #304153; }
.launcher-heart:disabled { opacity: 0.55; cursor: default; }
</style>
