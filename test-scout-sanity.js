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
// sandbox kept for synthetic thin-map cache poke

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

function assert(cond, msg) {
  if (!cond) {
    console.error('ASSERT FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log('OK:', msg);
}

function assertNoBroadWhileThinCovered(plan, thinPosSet, label) {
  const thinStill = new Set(thinPosSet);
  plan.scouts.forEach(s => {
    if (s.positions.length === 1 && thinStill.has(s.positions[0])) {
      thinStill.delete(s.positions[0]);
    }
  });
  plan.scouts.forEach(s => {
    if (s.positions.length <= 1) return;
    const midCluster = s.positions.includes('MS') && s.positions.length > 1 &&
      (s.positions.includes('SDM') || s.positions.includes('SM'));
    if (midCluster && thinStill.has('MS')) {
      assert(false, label + ': scout ' + s.index + ' is multi midfield ' + s.positions.join('+') +
        ' while MS still needs a dedicated hunt (remaining thin: ' + [...thinStill].join(',') + ')');
    }
  });
  assert(true, label + ': no MS+SDM/SM broad cluster while MS still thin');
  if (thinPosSet.size >= 3) {
    plan.scouts.forEach(s => {
      assert(s.style === 'spisset' && s.positions.length === 1,
        label + ': with ≥3 thin, scout ' + s.index + ' must be spisset 1-pos (got ' +
        s.style + ' ' + s.positions.join('+') + ')');
      assert(thinPosSet.has(s.positions[0]),
        label + ': scout ' + s.index + ' pos ' + s.positions[0] + ' should be one of thin ' +
        [...thinPosSet].join(','));
    });
  }
}

/** Drop anyone with VB/VWB on hoved or ekstra so anbefalt XI marks VB thin. */
function stripVbQualification(players) {
  return players.filter(p => {
    const codes = [];
    const hoved = p.hoved || p.pos;
    if (hoved) codes.push(String(hoved).toUpperCase());
    (p.ekstra || []).forEach(e => codes.push(String(e || '').toUpperCase()));
    return !codes.some(c => c === 'VB' || c === 'VWB' || c === 'LB' || c === 'LWB');
  });
}

function loadBackup(backupPath, opts) {
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  let players = (backup.players || []).map(p => Object.assign({}, p, {
    ekstra: Array.isArray(p.ekstra) ? p.ekstra.slice() : []
  }));
  if (opts && opts.stripVb) players = stripVbQualification(players);
  FC.state.players = players;
  FC.state.akademi = (backup.akademi || []).map(p => Object.assign({}, p, {
    ekstra: Array.isArray(p.ekstra) ? p.ekstra.slice() : []
  }));
  FC.state.formationId = backup.formationId || '433';
  FC.state.manualSlots = {};
}

function runSyntheticThreeThin(backupPath) {
  console.log('\n========== SYNTHETIC K+VB+MS thin @ ' + path.basename(backupPath) + ' ==========');
  loadBackup(backupPath, { stripVb: true });
  FC.setRecommendIncludeJuniorsFlag(false);
  FC.invalidateScoutXiThinCache();
  const thinMap = FC.scoutXiThinByPos();
  const thinPos = Object.keys(thinMap).filter(k => thinMap[k].thinSlots > 0);
  console.log('Thin after VB strip:', thinPos.join(', '), JSON.stringify(thinMap));
  assert(thinPos.includes('K') && thinPos.includes('VB') && thinPos.includes('MS'),
    'synth setup: K, VB, MS all thin (got ' + thinPos.join(',') + ')');
  const plan = FC.computeScoutPlan();
  plan.scouts.forEach(s => {
    console.log('Speider ' + s.index + ' (' + s.roleLabel + '):', s.positions.join(' · '),
      '| focused=' + s.focused, '|', s.why);
  });
  const thinSet = new Set(['K', 'VB', 'MS']);
  assertNoBroadWhileThinCovered(plan, thinSet, path.basename(backupPath) + ' synth');
  const posOrder = plan.scouts.map(s => s.positions[0]);
  assert(posOrder.includes('K') && posOrder.includes('VB') && posOrder.includes('MS'),
    'synth: scouts cover K, VB, MS (got ' + posOrder.join(',') + ')');
  assert(plan.scouts.every(s => s.positions.length === 1 && s.style === 'spisset'),
    'synth: all three spisset single-pos');
}

backupPaths.forEach(runAgainst);

console.log('\n========== ASSERTIONS (live backups) ==========');
backupPaths.forEach(backupPath => {
  loadBackup(backupPath, {});
  ['uten', 'med'].forEach(mode => {
    FC.setRecommendIncludeJuniorsFlag(mode === 'med');
    FC.invalidateScoutXiThinCache();
    const thinMap = FC.scoutXiThinByPos();
    const thinPos = new Set(Object.keys(thinMap).filter(k => thinMap[k].thinSlots > 0));
    const plan = FC.computeScoutPlan();
    console.log(path.basename(backupPath), mode, 'thin=', [...thinPos].join(',') || '(none)');
    console.log('  picks:', plan.scouts.map(s => s.style + ':' + s.positions.join('+')).join(' | '));
    assertNoBroadWhileThinCovered(plan, thinPos, path.basename(backupPath) + ' ' + mode);
    const dedicated = new Set();
    plan.scouts.forEach(s => {
      if (s.positions.length === 1 && thinPos.has(s.positions[0])) dedicated.add(s.positions[0]);
    });
    [...thinPos].slice(0, 3).forEach(pos => {
      assert(dedicated.has(pos),
        path.basename(backupPath) + ' ' + mode + ': thin ' + pos +
        ' must have a dedicated single-pos scout (dedicated=' + [...dedicated].join(',') +
        ' picks=' + plan.scouts.map(s => s.positions.join('+')).join(';') + ')');
    });
  });
});

backupPaths.forEach(runSyntheticThreeThin);

console.log('\nDone.' + (process.exitCode ? ' WITH FAILURES' : ' all asserts passed.'));
