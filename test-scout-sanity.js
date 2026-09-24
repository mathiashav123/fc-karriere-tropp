'use strict';
/**
 * Speiderplan sanity: depth map, thin positions, 3 scout picks.
 * Run: node test-scout-sanity.js
 * Optional: RANK_SANITY_BACKUP=/path/to/backup.json
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const htmlPath = path.join(__dirname, 'fc-karriere-tropp.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function extractFunc(src, name) {
  const m = src.match(new RegExp('  function ' + name + '\\s*\\('));
  if (!m) return '';
  const start = m.index;
  let i = src.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1) + '\n';
    }
  }
  return '';
}
function extractVar(src, name) {
  const m = src.match(new RegExp('  var ' + name + ' = '));
  if (!m) return '';
  const start = m.index;
  let depth = 0, inStr = null;
  for (let j = start + m[0].length - 1; j < src.length; j++) {
    const c = src[j];
    if (inStr) {
      if (c === inStr && src[j - 1] !== '\\') inStr = null;
      continue;
    }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === ';' && depth === 0) return src.slice(start, j + 1) + '\n';
  }
  return '';
}

const parts = [];
parts.push(`
'use strict';
var state = { players: [], akademi: [], formationId: '433', manualSlots: {}, notes: {}, sort: 'pos' };
var recommendIncludeJuniors = false;
function esc(s){ return String(s||''); }
function flashMsg(){}
function ObjectAssign(a,b){ return Object.assign(a,b); }
`);
['OLD_TO', 'SLOT_ALIASES', 'FORMATIONS', 'POS_BY_CODE', 'SCOUT_POS_COUNTRIES', 'SCOUT_RELATED', 'YA_STRONG_POOL', 'YA_CONTINENT', 'YA_GK_POOL'].forEach(v => {
  const x = extractVar(code, v);
  if (x) parts.push(x);
});
// Also extract HIGH_POT etc
const hp = code.match(/  var HIGH_POT_USE_SPREAD = [^;]+;/);
if (hp) parts.push(hp[0] + '\n');
const acadMin = code.match(/  var ACADEMY_MIN_SIGN_AGE = [^;]+;/);
if (acadMin) parts.push(acadMin[0] + '\n');

parts.push("function troppRoleForPlayer(){ return null; }\n");
parts.push("function troppGrowth(){ return 10; }\n");
parts.push("function troppNearPot(){ return false; }\n");
parts.push("function pickReplacement(){ return null; }\n");
parts.push("var EMPTY_SENTINEL = \"\";\nvar RANKS = [\"r1\",\"r2\",\"r3\"];\n");
const funcs = [
  'normalizeFot','normalizePosCode','playerPositions','qualifies','qualifiesForRecommend','qualifiesForSlot',
  'plainSmCode','footPosForSlot','footFitForPos','footScoreDelta','footRoleClass','footRetrainTarget','playerHasPos',
  'footOppositePos','isClearSellOutForXI','pickBest','usablePotential','rawPotential','growthFactor','xiAbilityScore','xiFootWeight',
  'playerBestFootFitInFormation','recommendSlotScore','compareRecommendPair','academyAsRecommendCandidate',
  'assignRecommendExclusive','fillRecommendLeftover','insertAcademyIntoRecommend','forcePlaceRemainingTropp',
  'recommendPosFamily','spreadProbePos','countFormationSlotsForFamily','highPotPoolForPos','findPlayerPlacement',
  'compactSlotRanks','insertIntoSlotSpreading','tryOneHighPotSpreadMove','spreadHighPotAcrossXI','reorderRecommendDepth','buildRecommendedXI',
  'buildXI','signedDepthForPos','resolveManualPlayer','manualRefForPlayer','recommendUsedSet',
  'posDisplayCode','formationUsedPlayerPositions','academyEffectivePos','academyOptimisticPot','recommendAcademyPool',
  'getFormation','scoutWeekSeed','squadAvgOvr','clampScoutAim','scoutDepthPool','scoutTargetsForPositions','scoutTargets',
  'fillPoolForPos','pickScoutCountries','relatedPositionsFor','formationSlotDemand','scoutProbeSlot',
  'scoutTroppUsableForPos','academyUsableForPos','scoreScoutPosition','scoutXiThinByPos','invalidateScoutXiThinCache','usedPositionsOrdered','computeScoutNeeds','computeScoutPlan'
];
funcs.forEach(f => {
  const x = extractFunc(code, f);
  if (!x) console.error('MISSING FUNC', f);
  else parts.push(x);
});

const sandbox = {
  console, Set, Map, Array, Object, Math, Number, String, Date, JSON,
  parseInt, parseFloat, isNaN, Infinity, NaN, undefined, Error, TypeError, RegExp, Promise,
  localStorage: { getItem: () => null, setItem: () => {} }
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
try {
  vm.runInNewContext(parts.join('\n') + '\nthis.__ex={state,getFormation,signedDepthForPos,scoutTroppUsableForPos,academyUsableForPos,scoreScoutPosition,scoutXiThinByPos,invalidateScoutXiThinCache,usedPositionsOrdered,computeScoutPlan,formationSlotDemand,formationUsedPlayerPositions,buildRecommendedXI,buildXI,posDisplayCode,getRecommendIncludeJuniors:function(){return recommendIncludeJuniors;},setRecommendIncludeJuniorsFlag:function(v){recommendIncludeJuniors=!!v;}};', sandbox);
} catch (e) {
  console.error('VM load error:', e.message);
  // try to find which line
  process.exit(1);
}
const FC = sandbox.__ex;

const defaultBackups = [
  '/workspace/uploads/fc-tropp-backup-msi.json',
  '/workspace/uploads/fc-tropp-backup-latest.json'
].filter(p => fs.existsSync(p));
const backupPaths = process.env.RANK_SANITY_BACKUP
  ? [process.env.RANK_SANITY_BACKUP]
  : defaultBackups;

function depthNames(arr) {
  return arr.map(p => p.navn + '(' + p.rating + '/' + p.potensial + ')').join(', ');
}

function runAgainst(backupPath) {
  console.log('\n========== ' + path.basename(backupPath) + ' ==========');
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  FC.state.players = (backup.players || []).map(p => Object.assign({}, p, {
    ekstra: Array.isArray(p.ekstra) ? p.ekstra.slice() : []
  }));
  FC.state.akademi = (backup.akademi || []).map(p => Object.assign({}, p, {
    ekstra: Array.isArray(p.ekstra) ? p.ekstra.slice() : []
  }));
  FC.state.formationId = backup.formationId || '433';
  FC.state.manualSlots = {};

  const used = FC.usedPositionsOrdered();
  console.log('Formation:', FC.state.formationId, 'used positions:', used.join(', '));

  console.log('\n--- Depth map (scoutTroppUsable + YA usable) ---');
  const thin = [];
  used.forEach(pos => {
    const tropp = FC.scoutTroppUsableForPos(pos);
    const signed = FC.signedDepthForPos(pos);
    const ya = FC.academyUsableForPos(pos);
    const slots = FC.formationSlotDemand(pos);
    const usable = tropp.length + ya.length;
    const s = FC.scoreScoutPosition(pos);
    const isThin = tropp.length < 2 || usable < 2;
    if (isThin || s.mustHunt || s.thin) thin.push(s);
    console.log(
      pos.padEnd(4),
      'slots=' + slots,
      'signed=' + signed.length,
      'troppUsable=' + tropp.length,
      'ya=' + ya.length,
      'usable=' + usable,
      'mustHunt=' + s.mustHunt,
      'sev=' + s.severity,
      'thin=' + s.thin,
      '|', s.why
    );
    console.log('      tropp:', depthNames(tropp) || '(none)');
    if (ya.length) console.log('      ya:', ya.map(y => y.p.navn + '(pot' + y.potHi + ')').join(', '));
  });

  console.log('\n--- Thin / mustHunt list ---');
  if (!thin.length) console.log('(none)');
  thin.forEach(s => console.log(s.pos, 'mustHunt=' + s.mustHunt, 'usable=' + s.usable, s.why));

  ['uten', 'med'].forEach(mode => {
    FC.setRecommendIncludeJuniorsFlag(mode === 'med');
    FC.invalidateScoutXiThinCache();
    console.log('\n--- Speiderplan (' + mode + ' junior) ---');
    const thinMap = FC.scoutXiThinByPos();
    console.log('XI thin map:', JSON.stringify(thinMap));
    const plan = FC.computeScoutPlan();
    plan.scouts.forEach(s => {
      console.log(
        'Speider ' + s.index + ' (' + s.roleLabel + '):',
        s.labels.join(' · '),
        '| land:', (s.countries || []).join(', '),
        '|', s.why,
        '| sikte:', s.targets && s.targets.line
      );
    });
  });
  FC.setRecommendIncludeJuniorsFlag(false);
  FC.invalidateScoutXiThinCache();

  // Also show XI thin slots from buildRecommendedXI uten/med junior
  ['uten', 'med'].forEach(mode => {
    const rec = FC.buildRecommendedXI({ includeAcademy: mode === 'med' });
    console.log('\n--- Anbefalt XI thin slots (' + mode + ' junior) ---');
    rec.formation.slots.forEach(slot => {
      const e = rec.result[slot.id];
      const thinSlot = !e.r1 || !e.r2;
      if (thinSlot) {
        console.log(slot.id, slot.pos,
          'r1=' + (e.r1 && e.r1.navn || 'MANGLER'),
          'r2=' + (e.r2 && e.r2.navn || 'MANGLER'),
          'r3=' + (e.r3 && e.r3.navn || '-'));
      }
    });
  });
}

backupPaths.forEach(runAgainst);
console.log('\nDone.');
