'use strict';
/**
 * Quick sanity: young pot-first ranking + HV depth.
 * Run: node test-rank-sanity.js
 * Optional: RANK_SANITY_BACKUP=/path/to/fc-tropp-backup.json
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
function esc(s){ return String(s||''); }
function flashMsg(){}
function posDisplayCode(c){ return c; }
function formationUsedPlayerPositions(){ return {}; }
function academyEffectivePos(raw){ return { effective: (typeof normalizePosCode==='function'?normalizePosCode(raw):raw) || raw }; }
function academyOptimisticPot(a){ return a.potMax != null ? a.potMax : a.potensial; }
function recommendAcademyPool(){ return (state.akademi||[]).filter(function(a){return a.alder==null||a.alder>=16}).map(academyAsRecommendCandidate); }
function troppRoleForPlayer(){ return null; }
function troppGrowth(){ return 10; }
function troppNearPot(){ return false; }
function pickReplacement(){ return null; }
function getFormation(){ return FORMATIONS[state.formationId] || FORMATIONS['433']; }
var ACADEMY_MIN_SIGN_AGE = 16;
var EMPTY_SENTINEL = '';
var RANKS = ['r1','r2','r3'];
`);
['OLD_TO', 'SLOT_ALIASES', 'FORMATIONS'].forEach(v => parts.push(extractVar(code, v)));
[
  'normalizeFot','normalizePosCode','playerPositions','qualifies','qualifiesForRecommend','qualifiesForSlot',
  'plainSmCode','footPosForSlot','footFitForPos','footScoreDelta','footRoleClass','footRetrainTarget','playerHasPos',
  'footOppositePos','isClearSellOutForXI','pickBest','usablePotential','growthFactor','xiAbilityScore','xiFootWeight',
  'playerBestFootFitInFormation','recommendSlotScore','compareRecommendPair','academyAsRecommendCandidate',
  'assignRecommendExclusive','fillRecommendLeftover','insertAcademyIntoRecommend','forcePlaceRemainingTropp',
  'recommendPosFamily','spreadProbePos','countFormationSlotsForFamily','highPotPoolForPos','findPlayerPlacement',
  'compactSlotRanks','insertIntoSlotSpreading','tryOneHighPotSpreadMove','spreadHighPotAcrossXI','buildRecommendedXI',
  'buildXI','signedDepthForPos','resolveManualPlayer','manualRefForPlayer','recommendUsedSet'
].forEach(f => parts.push(extractFunc(code, f)));
const hp = code.match(/  var HIGH_POT_USE_SPREAD = [^;]+;/);
if (hp) parts.push(hp[0] + '\n');

const sandbox = { console, Set, Map, Array, Object, Math, Number, String, Date, JSON, parseInt, parseFloat, isNaN, Infinity, NaN, undefined, Error, TypeError, RegExp, Promise };
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(parts.join('\n') + '\nthis.__ex={state,usablePotential,compareRecommendPair,buildXI,buildRecommendedXI,getFormation};', sandbox);
const FC = sandbox.__ex;

const backupPath = process.env.RANK_SANITY_BACKUP ||
  (fs.existsSync('/workspace/uploads/fc-tropp-backup-msi.json')
    ? '/workspace/uploads/fc-tropp-backup-msi.json'
    : path.join(__dirname, 'fc-tropp-backup.json'));
if (!fs.existsSync(backupPath)) {
  console.error('No backup JSON for sanity test at', backupPath);
  process.exit(2);
}
const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
FC.state.players = (backup.players || []).map(p => Object.assign({}, p));
FC.state.akademi = (backup.akademi || []).map(p => Object.assign({}, p));
FC.state.formationId = backup.formationId || '433';
FC.state.manualSlots = {};

const Ba = FC.state.players.find(p => p.navn === 'Ba');
const Step = FC.state.players.find(p => p.navn === 'Stepanovic');
const Veiga = FC.state.players.find(p => p.navn === 'Veiga');
if (!Ba || !Step || !Veiga) {
  console.error('Backup missing Ba/Stepanovic/Veiga');
  process.exit(2);
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed++; }
  else console.log('OK:', msg);
}

assert(FC.compareRecommendPair(Ba, Step, 'HV', 'r1', FC.getFormation(), 'hv') < 0,
  'Ba (higher pot+OVR) ranks above Stepanovic on HV');
assert(FC.compareRecommendPair(Veiga, Ba, 'VV', 'r1', FC.getFormation(), 'vv') < 0,
  'Veiga above Ba on VV when pot close (foot before OVR floor)');

const xi = FC.buildXI();
const hvId = FC.getFormation().slots.find(s => s.pos === 'HV').id;
const vvId = FC.getFormation().slots.find(s => s.pos === 'VV').id;
assert(xi.result[hvId].r1 && xi.result[hvId].r1.navn === 'Ba',
  'buildXI HV #1 is Ba (got ' + (xi.result[hvId].r1 && xi.result[hvId].r1.navn) + ')');
assert(xi.result[vvId].r1 && xi.result[vvId].r1.navn === 'Veiga',
  'buildXI VV #1 is Veiga (got ' + (xi.result[vvId].r1 && xi.result[vvId].r1.navn) + ')');

const rec = FC.buildRecommendedXI({ includeAcademy: false });
assert(rec.result[hvId].r1 && rec.result[hvId].r1.navn === 'Ba',
  'anbefalt HV #1 is Ba');
assert(rec.result[hvId].r2 && rec.result[hvId].r2.navn === 'Stepanovic',
  'anbefalt HV #2 is Stepanovic');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('All sanity asserts passed');
