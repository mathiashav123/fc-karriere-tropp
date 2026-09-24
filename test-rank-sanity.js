'use strict';
/**
 * Quick sanity: young pot-first ranking + HV depth.
 * Run: node test-rank-sanity.js
 * Optional: RANK_SANITY_BACKUP=/path/to/fc-tropp-backup.json
 * Runs against msi + latest backups under /workspace/uploads when present.
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
  'footOppositePos','isClearSellOutForXI','pickBest','usablePotential','rawPotential','growthFactor','xiAbilityScore','xiFootWeight',
  'playerBestFootFitInFormation','recommendSlotScore','compareRecommendPair','academyAsRecommendCandidate',
  'assignRecommendExclusive','fillRecommendLeftover','insertAcademyIntoRecommend','forcePlaceRemainingTropp',
  'recommendPosFamily','spreadProbePos','countFormationSlotsForFamily','highPotPoolForPos','findPlayerPlacement',
  'compactSlotRanks','insertIntoSlotSpreading','tryOneHighPotSpreadMove','spreadHighPotAcrossXI','reorderRecommendDepth','buildRecommendedXI',
  'buildXI','signedDepthForPos','resolveManualPlayer','manualRefForPlayer','recommendUsedSet'
].forEach(f => parts.push(extractFunc(code, f)));
const hp = code.match(/  var HIGH_POT_USE_SPREAD = [^;]+;/);
if (hp) parts.push(hp[0] + '\n');

const sandbox = { console, Set, Map, Array, Object, Math, Number, String, Date, JSON, parseInt, parseFloat, isNaN, Infinity, NaN, undefined, Error, TypeError, RegExp, Promise };
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(parts.join('\n') + '\nthis.__ex={state,usablePotential,compareRecommendPair,recommendSlotScore,xiAbilityScore,buildXI,buildRecommendedXI,getFormation};', sandbox);
const FC = sandbox.__ex;

const defaultBackups = [
  '/workspace/uploads/fc-tropp-backup-msi.json',
  '/workspace/uploads/fc-tropp-backup-latest.json'
].filter(p => fs.existsSync(p));
const backupPaths = process.env.RANK_SANITY_BACKUP
  ? [process.env.RANK_SANITY_BACKUP]
  : (defaultBackups.length
      ? defaultBackups
      : [path.join(__dirname, 'fc-tropp-backup.json')].filter(p => fs.existsSync(p)));
if (!backupPaths.length) {
  console.error('No backup JSON for sanity test');
  process.exit(2);
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed++; }
  else console.log('OK:', msg);
}

function runAgainst(backupPath) {
  console.log('\n=== backup: ' + backupPath + ' ===');
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
    failed++;
    return;
  }

  const form = FC.getFormation();
  const hvId = form.slots.find(s => s.pos === 'HV').id;
  const vvId = form.slots.find(s => s.pos === 'VV').id;

  assert(Ba.alder === 20 && Ba.potensial === 90 && Ba.rating === 72,
    'Backup Ba is 72/90 age 20 (got ' + Ba.rating + '/' + Ba.potensial + ' a' + Ba.alder + ')');
  assert(Step.alder === 18 && Step.potensial === 87 && Step.rating === 69,
    'Backup Stepanovic is 69/87 age 18 (got ' + Step.rating + '/' + Step.potensial + ' a' + Step.alder + ')');
  assert(Math.abs(Ba.alder - Step.alder) <= 2,
    'Age gap Ba vs Stepanovic is ≤2 (got ' + Math.abs(Ba.alder - Step.alder) + ')');
  assert(Ba.potensial - Step.potensial >= 2,
    'Pot gap Ba vs Stepanovic ≥2 (got ' + (Ba.potensial - Step.potensial) + ')');
  assert(FC.compareRecommendPair(Ba, Step, 'HV', 'r1', form, hvId) < 0,
    'Ba (higher pot+OVR) ranks above Stepanovic on HV — age≤2 must not flip');
  assert(FC.compareRecommendPair(Veiga, Ba, 'VV', 'r1', form, vvId) < 0,
    'Veiga above Ba on VV when pot close (foot before OVR floor)');

  /* Soft retrain cannot flip clear pot: Stepanovic soft on HV > Ba soft, Ba still #1 */
  var softBa = FC.recommendSlotScore(Ba, 'HV', 'r1', form, hvId) - FC.xiAbilityScore(Ba, 'r1');
  var softStep = FC.recommendSlotScore(Step, 'HV', 'r1', form, hvId) - FC.xiAbilityScore(Step, 'r1');
  assert(softStep > softBa + 5,
    'Stepanovic soft on HV > Ba soft (got Step=' + softStep.toFixed(1) + ' Ba=' + softBa.toFixed(1) + ')');
  assert(FC.compareRecommendPair(Ba, Step, 'HV', 'r1', form, hvId) < 0,
    'soft retrain cannot flip: Ba still beats Stepanovic on HV despite soft gap');

  /* Synthetic: potGap≥2 ignores 2y younger opponent even if soft retrain favors younger */
  var youngHi = { id: 't1', navn: 'HiPot', rating: 70, potensial: 90, alder: 20, hoved: 'HV', ekstra: [], fot: 'V' };
  var youngLo = { id: 't2', navn: 'LoPot', rating: 68, potensial: 87, alder: 18, hoved: 'VV', ekstra: ['HV'], fot: 'V' };
  assert(FC.compareRecommendPair(youngHi, youngLo, 'HV', 'r1', form, hvId) < 0,
    'Synthetic: 90-pot age20 > 87-pot age18 on HV (age gap ≤2 ignored when potGap≥2)');

  const xi = FC.buildXI();
  assert(xi.result[hvId].r1 && xi.result[hvId].r1.navn === 'Ba',
    'buildXI HV #1 is Ba (got ' + (xi.result[hvId].r1 && xi.result[hvId].r1.navn) + ')');
  assert(xi.result[hvId].r2 && xi.result[hvId].r2.navn === 'Stepanovic',
    'buildXI HV #2 is Stepanovic (got ' + (xi.result[hvId].r2 && xi.result[hvId].r2.navn) + ')');
  assert(xi.result[vvId].r1 && xi.result[vvId].r1.navn === 'Veiga',
    'buildXI VV #1 is Veiga (got ' + (xi.result[vvId].r1 && xi.result[vvId].r1.navn) + ')');

  const rec = FC.buildRecommendedXI({ includeAcademy: false });
  const hvR1 = rec.result[hvId].r1 && rec.result[hvId].r1.navn;
  const hvR2 = rec.result[hvId].r2 && rec.result[hvId].r2.navn;
  console.log('DUMP buildRecommendedXI HV r1=' + hvR1 + ' r2=' + hvR2);
  assert(hvR1 === 'Ba', 'anbefalt HV #1 is Ba (got ' + hvR1 + ')');
  assert(hvR2 === 'Stepanovic', 'anbefalt HV #2 is Stepanovic (got ' + hvR2 + ')');
  assert(rec.result[vvId].r1 && rec.result[vvId].r1.navn === 'Veiga',
    'anbefalt VV #1 is Veiga (got ' + (rec.result[vvId].r1 && rec.result[vvId].r1.navn) + ')');
}

backupPaths.forEach(runAgainst);

if (failed) { console.error('\n' + failed + ' failed'); process.exit(1); }
console.log('\nAll sanity asserts passed (' + backupPaths.length + ' backup(s))');
