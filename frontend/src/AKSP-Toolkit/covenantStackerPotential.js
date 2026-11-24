import { CORE_GROUP, getOperatorTier, getOperatorTraits } from "../data/versions.js";
import { HARMONY_COVENANT } from "../composables/useCovenantStats.js";
import { RANKING_TIERS } from "./covenantWeights.js";

const bracketed = /【([^】]+)】/g;
const capPattern = /(?:每场(?:战斗|作战)|每回合|每名干员每回合)?至多(?:叠加)?(\d+)层/;
const roundPattern = /每回合|本回合/;
const battlePattern = /每场(?:战斗|作战)/;
const tierOf = (layers) => Math.ceil(layers / 5);
const reserveLimit = 10;
const rowLimit = 6;

export function rankCovenantStackers(version, pool, targets, limit, canField) {
  const stackers = new Map();
  const supports = [];
  const eligible = [...pool.keys()];
  const relevantCovenants = [...new Set([...targets, HARMONY_COVENANT])];
  const stackTargets = targets.filter((name) => name !== HARMONY_COVENANT);
  const canDeploy = new Map();
  function field(names, reserve = []) {
    const required = [...new Set(names)].sort();
    if (reserve.some((name) => required.includes(name))) return false;
    const key = JSON.stringify([required, reserve]);
    if (!canDeploy.has(key)) canDeploy.set(key, canField(required, reserve));
    return canDeploy.get(key);
  }

  function reserveCount(required, target) {
    const groups = new Map();
    for (const [name, memberships] of pool) {
      if (required.includes(name) || (target && !memberships.has(target))) continue;
      const key = relevantCovenants.map((covenant) => Number(memberships.has(covenant))).join("");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(name);
    }
    const interchangeable = [...groups.values()];
    let best = 0;
    const upperBound = Math.min(reserveLimit, interchangeable.reduce((sum, group) => sum + group.length, 0));
    function search(index, kept) {
      best = Math.max(best, kept.length);
      if (best === upperBound || index === interchangeable.length) return;
      const group = interchangeable[index];
      for (let quantity = Math.min(upperBound - kept.length, group.length); quantity >= 0; quantity--) {
        const next = [...kept, ...group.slice(0, quantity)];
        if (!quantity || field(required, next)) search(index + 1, next);
        if (best === upperBound) return;
      }
    }
    search(0, []);
    return best;
  }

  function add(target, name, text, layers, required, { support = false, reserve = false, raisable = false, detail = "" } = {}) {
    if (!stackers.has(target)) stackers.set(target, new Map());
    const rows = stackers.get(target);
    const previous = rows.get(name);
    if (previous && (previous.layers ?? -1) >= (layers ?? -1)) return;
    const period = battlePattern.test(text) ? "每场战斗" : roundPattern.test(text) ? "每回合" : "单次触发";
    rows.set(name, { name, text, layers, period, support, reserve, raisable, required, detail });
  }

  for (const [name, memberships] of pool) {
    for (const trait of getOperatorTraits(name, version)) {
      if (trait.type !== "持续叠加") continue;
      const text = trait.upgraded || trait.description || "";
      if (/临时层数/.test(text)) continue;
      const worksFromReserve = /整备区(?:时)?也(?:有效|生效)/.test(text);
      const reserve = worksFromReserve && field([], [name]);
      const required = reserve ? [] : [name];
      if (!reserve && !field(required)) continue;
      if (/叠层上限[+＋]|每次提升的层数额外/.test(text)) {
        supports.push({ name, memberships, text });
        continue;
      }

      for (const target of stackTargets) {
        if (name === "旅骨" && version.id === "guicheng") {
          const recipient = [{ name: "海沫", price: 8 }, { name: "温蒂", price: 6 }]
            .find(({ name }) => pool.get(name)?.has(target) && field([...required, name]));
          if (recipient || memberships.has(target)) {
            add(target, name, text, recipient ? recipient.price * 2 : null, required, {
              detail: recipient ? `前方晋升${recipient.name}，售价 ${recipient.price}${memberships.has(target) ? "。旅骨自身售价待确认" : ""}` : "旅骨自身售价待确认",
            });
          }
          continue;
        }
        const direct = [...text.matchAll(/((?:【[^】]+】(?:[/／](?=【))?)+)(?:盟约)?(?:固定)?层数[+＋](\d+)(?:（[^）]*）)?/g)]
          .filter(([, names]) => [...names.matchAll(bracketed)].some(([, covenant]) => covenant === target));
        const named = [...text.matchAll(bracketed)].some(([, covenant]) => covenant === target);
        const own = /自身(?:已激活|所属已激活|及|以及)|^(?:分别)?层数[+＋]/.test(text);
        const ally = /身前|身后|身后一格|身前一格|最右边|被召唤干员/.test(text);
        const benchTargets = /使整备区每名干员已激活/.test(text);
        const allCore = /已激活的核心盟约层数[+＋]/.test(text) && version.covenants[target]?.group === CORE_GROUP;
        const highest = /已激活且层数最多的盟约/.test(text);
        const indirect = ally || benchTargets || /所有【[^】]+】干员/.test(text);
        const recipients = eligible.filter((other) => other !== name && pool.get(other).has(target));
        const needsTeammate = /干员获得特质/.test(text) || (own && !memberships.has(target) && ally);
        const teammate = needsTeammate && recipients.find((other) => field([...required, other], reserve ? [name] : []));
        if (/每叠加\d+层/.test(text) && !/层数[+＋]|叠加等同/.test(text)) continue;
        if (needsTeammate && !teammate && !direct.length) continue;
        if (!(direct.length || allCore || highest || benchTargets || (own && memberships.has(target)) || teammate
          || (named && /叠加等同/.test(text)))) continue;
        const lineup = teammate && !benchTargets ? [...required, teammate] : required;
        let layers = direct.length
          ? direct.reduce((best, [clause, , amount]) => largest(best, valueFor(clause, Number(amount), text, limit, version, pool, lineup, field)), null)
          : valueFor(text, Number(text.match(/层数[+＋](\d+)/)?.[1] ?? 0), text, limit, version, pool, lineup, field);
        if (benchTargets || text.includes("整备区每有")) {
          const gain = Number(text.match(/层数[+＋](\d+)/)?.[1] ?? 0);
          layers = gain * reserveCount(lineup, benchTargets ? target : null);
          if (!layers) continue;
        }
        const battle = battlePattern.test(text) || /战斗中/.test(trait.trigger ?? "");
        const raisable = (capPattern.test(text) || /至多触发\d+次/.test(text))
          && (battle || /消耗|资金|刷新|每获得过/.test(text));
        add(target, name, text, layers, lineup, { reserve, raisable, support: indirect && !layers });
      }
    }
  }

  return targets.map((target) => {
    const rows = stackers.get(target) ?? new Map();
    const conventional = [...rows.values()].filter(({ layers }) => layers > 0);
    const highestTier = Math.max(0, ...conventional.map(({ layers }) => tierOf(layers)));
    for (const support of supports) {
      const result = rateSupport(support, conventional, pool, field);
      if (result) add(target, support.name, support.text, result.layers, [support.name], { support: true });
    }
    return {
      target,
      candidates: [...rows.values()].map((row) => {
        const tier = row.layers == null ? null : Math.min(tierOf(row.layers), row.support ? highestTier : Infinity) || null;
        const shopLevel = RANKING_TIERS.indexOf(getOperatorTier(row.name, version)) + 1 || null;
        return { ...row, tier, shopLevel, efficiency: tier && shopLevel ? tier - shopLevel : null };
      }).sort((left, right) => (right.efficiency ?? -Infinity) - (left.efficiency ?? -Infinity)
        || (right.tier ?? 0) - (left.tier ?? 0)
        || (right.layers ?? -1) - (left.layers ?? -1) || Number(left.support) - Number(right.support)),
    };
  });
}

function largest(first, second) {
  return second == null ? first : Math.max(first ?? 0, second);
}

function valueFor(clause, amount, text, limit, version, pool, lineup, field) {
  const cap = clause.match(capPattern) || (!text.includes("，【") ? text.match(capPattern) : null);
  const triggers = clause.match(/至多触发(\d+)次/) || text.match(/至多触发(\d+)次/);
  if (cap) return Number(cap[1]);
  if (triggers && amount) return Number(triggers[1]) * amount;
  if (/同一行每有/.test(text)) return amount * Math.min(rowLimit, limit, pool.size);
  if (/售出价格/.test(text)) return null;
  if (/每有一名不同阶/.test(text)) {
    const covenant = text.match(/不同阶的【([^】]+)】/)?.[1];
    const tiers = new Map();
    for (const [operator, memberships] of pool) {
      const tier = getOperatorTier(operator, version);
      if (!tier || !memberships.has(covenant)) continue;
      if (!tiers.has(tier)) tiers.set(tier, []);
      tiers.get(tier).push(operator);
    }
    const groups = [...tiers.values()];
    let maximum = 0;
    function search(index, required, count) {
      maximum = Math.max(maximum, count);
      if (count + groups.length - index <= maximum) return;
      for (const name of groups[index]) {
        const next = [...new Set([...required, name])];
        if (field(next)) search(index + 1, next, count + 1);
        if (count + groups.length - index <= maximum) return;
      }
      search(index + 1, required, count);
    }
    search(0, lineup, 0);
    return amount * maximum || null;
  }
  if (/每有一名存活的我方干员|场上每有一名携带装备/.test(text)) return amount ? Math.min(limit, pool.size) * amount : null;
  if (/每当|每有|每次|每击倒|获得特质.*开启技能/.test(text) && !/本回合首次/.test(text)) return null;
  return amount || null;
}

function rateSupport({ name, memberships, text }, direct, pool, field) {
  const cap = text.match(/叠层上限[+＋](\d+)(%)?/);
  const extra = text.match(/每次提升的层数额外[+＋](\d+)/);
  const matchingCovenants = [...(text.split("干员")[0] ?? "").matchAll(bracketed)].map(([, covenant]) => covenant);
  const eligible = direct.filter((row) => row.name !== name && !row.reserve
    && matchingCovenants.every((covenant) => pool.get(row.name).has(covenant))
    && (!text.includes("拥有相同盟约") || [...memberships].some((covenant) => pool.get(row.name).has(covenant)))
    && field([name, ...row.required]));
  if (!eligible.length) return null;
  if (!cap && extra) {
    const amounts = eligible.map(({ text, layers }) => {
      const gain = Number(text.match(/层数[+＋](\d+)/)?.[1] ?? 0);
      return gain ? Math.floor(layers / gain) * Number(extra[1]) : 0;
    });
    return { layers: Math.max(...amounts) || null };
  }
  if (!cap) return null;
  const partners = eligible.filter(({ raisable, period }) =>
    raisable && (["Mon3tr", "薇薇安娜"].includes(name) || period === "每场战斗")).map((row) => ({
    ...row, extra: cap[2] ? Math.round(row.layers * Number(cap[1]) / 100) : Number(cap[1]),
  })).sort((a, b) => b.extra - a.extra);
  const slots = text.includes("周围八格") ? 8 : text.includes("身前一格") ? 1 : Infinity;
  function bestPartnerGain(index, required, remaining) {
    if (index === partners.length || !remaining) return 0;
    const partner = partners[index];
    const next = [...new Set([...required, ...partner.required])];
    const without = bestPartnerGain(index + 1, required, remaining);
    return field(next) ? Math.max(without, partner.extra + bestPartnerGain(index + 1, next, remaining - 1)) : without;
  }
  return { layers: bestPartnerGain(0, [name], slots) || null };
}
