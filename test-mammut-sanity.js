'use strict';
/**
 * Mammut A–M + tall-MS-over-back + panel lists sanity.
 * Run: node test-mammut-sanity.js
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

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
    process.exitCode = 1;
  } else {
    console.log('OK:', msg);
  }
}

assert(/app-build" content="20260925-sm-depth"/.test(html), 'app-build stamp 20260925-sm-depth');
assert(html.includes('id="mammut-panel"'), 'mammut panel in HTML');
assert(html.includes('var MAMMUT = {'), 'MAMMUT config present');
assert(html.includes('mammutPreferMsOverBack'), 'tall MS helper present');

const parts = [];
parts.push(`
'use strict';
var state = { players: [], akademi: [], formationId: '433', manualSlots: {}, notes: {}, sort: 'pos' };
var recommendIncludeJuniors = false;
function esc(s){ return String(s==null?'':s); }
function flashMsg(){}
function clampNum(n,lo,hi){ n=Number(n); if(!Number.isFinite(n)) return lo; return Math.max(lo,Math.min(hi,Math.round(n))); }
`);

['OLD_TO', 'SLOT_ALIASES', 'FORMATIONS', 'POS_BY_CODE', 'MAMMUT', 'SCOUT_POS_COUNTRIES',
 'SCOUT_RELATED', 'YA_STRONG_POOL', 'YA_CONTINENT', 'YA_GK_POOL', 'ACADEMY_HEIGHT_BANDS',
 'KARRIERE_POSITIONS', 'HOVED_GROUP_ORDER'].forEach(v => {
  const x = extractVar(code, v);
  if (x) parts.push(x);
});

parts.push(`
if (typeof KARRIERE_POSITIONS !== 'undefined' && KARRIERE_POSITIONS.length) {
  POS_BY_CODE = POS_BY_CODE || {};
  KARRIERE_POSITIONS.forEach(function (p) { POS_BY_CODE[p.code] = p; });
}
`);

const acadMin = code.match(/  var ACADEMY_MIN_SIGN_AGE = [^;]+;/);
if (acadMin) parts.push(acadMin[0] + '\n');
const hp = code.match(/  var HIGH_POT_USE_SPREAD = [^;]+;/);
if (hp) parts.push(hp[0] + '\n');

parts.push("function troppRoleForPlayer(){ return { pos:'SM', depth:[], rank:1, thin:true, crowded:false }; }\n");
parts.push("function troppGrowth(){ return 10; }\n");
parts.push("function troppNearPot(){ return false; }\n");
parts.push("function pickReplacement(){ return null; }\n");
parts.push("function isClearSellOutForXI(){ return false; }\n");
parts.push("var EMPTY_SENTINEL = '';\nvar RANKS = ['r1','r2','r3'];\n");

const funcs = [
  'normalizeFot','normalizePosCode','posDisplayCode','playerPositions','qualifies','qualifiesForRecommend',
  'academyPotSpan','academyOptimisticPot','academyPessimisticPot','fmtPotRange','normalizeAcademyPlayer',
  'academyHeightCm','academyHeightFitForPos','academyRoleSet','academyEffectivePos','formationUsedPlayerPositions',
  'slotRoleCodes','slotsForRole','roleDepthTarget','mammutMaxForRole',
  'getFormation','signedDepthForPos','projectedAcademyRank','academyPosNeedScore','academyPosFitScore',
  'academyNeedSimilar','isBackPosCode','backSideOf','academyBackFootPrefer','academyPreferTarget',
  'footFitForPos','footScoreDelta','footRoleClass','pickBestAcademyTarget','academyBestPosLead',
  'academyRankPhrase','academyRankPhraseAtPot','findStrongestAcademyPeer','academyAreSimilar',
  'compareAcademyToPeer','isSignedCoverageThin','academyVerdict',
  'mammutQuota','mammutPosCode','mammutRolePool','mammutRoleCount','mammutHasMsEliteCeiling','mammutVvCoveredBy86',
  'mammutRangeSharpened','mammutIsNeverPromoteRange','mammutSignTotOk','mammutPromoteTotOk','mammutPromoteGateReason',
  'mammutHeightVerdict','mammutPlayerCanMs','mammutIsTallForMs','mammutPreferBackOverMs','mammutNaturalBackPos','mammutPlayerCanBack','mammutIsShortForMs','mammutIsBackRole','mammutHasViableNonBack',
  'mammutPreferMsOverBack','mammutOverQuota','mammutHoleOpen','mammutYaSignAdvice','applyPosChangeAsHoved','addEkstraPosToPlayer',
  'mammutRankScore','mammutDecisionBucket','computeMammutAcademyLists',
  'scoutProbeSlot','scoutWeekSeed','pickScoutCountries','fillPoolForPos',
  'formationSlotDemand','scoutTroppUsableForPos','academyUsableForPos','scoreScoutPosition',
  'usedPositionsOrdered','computeScoutPlan','scoutXiThinByPos','invalidateScoutXiThinCache',
  'scoutDepthPool','scoutTargetsForPositions','squadAvgOvr','clampScoutAim','relatedPositionsFor',
  'plainSmCode','footPosForSlot','usablePotential','rawPotential','growthFactor',
  'compareRecommendPair','buildRecommendedXI','recommendAcademyPool'
];
funcs.forEach(n => {
  const f = extractFunc(code, n);
  if (f) parts.push(f);
});

// stubs for missing deps referenced inside extracted funcs
parts.push(`
function recommendAcademyPool(){ return (state.akademi||[]).map(function(a){
  return Object.assign({}, a, { _fromAcademy:true, _academyId:a.id, id:'acad:'+a.id, potensial: academyOptimisticPot(a) });
}); }
function comparePlayersWithinHoved(){ return 0; }
function playerHasPos(p,c){ return playerPositions(p).indexOf(normalizePosCode(c))>=0; }
function footRetrainTarget(){ return null; }
function footTrenLabel(){ return ''; }
function footRetrainTip(){ return ''; }
function missingInfoBadges(){ return ''; }
function missingInfoLabels(){ return []; }
function normalizeEkstra(a){ return Array.isArray(a)?a:[]; }
function uid(){ return 'id'+Math.random(); }
function fmtPlayerArrow(pl){ return pl? (pl.navn+' ('+pl.rating+'→'+pl.potensial+')') : ''; }
`);

const sandbox = { console, Set, Map, Math, Number, String, Array, Object, Date, JSON, parseInt, isNaN };
try {
  vm.runInNewContext(parts.join('\n') + '\nthis.__ex={MAMMUT,state,academyVerdict,pickBestAcademyTarget,mammutPreferMsOverBack,mammutYaSignAdvice,mammutPromoteTotOk,mammutSignTotOk,mammutHasMsEliteCeiling,mammutDecisionBucket,computeMammutAcademyLists,pickScoutCountries,scoreScoutPosition,computeScoutPlan,SCOUT_POS_COUNTRIES,normalizeAcademyPlayer,mammutIsTallForMs,mammutIsShortForMs,mammutPlayerCanMs,mammutPlayerCanBack,mammutNaturalBackPos,mammutPreferBackOverMs,applyPosChangeAsHoved};', sandbox);
} catch (e) {
  console.error('VM load error', e);
  process.exit(1);
}
const FC = sandbox.__ex;
const state = FC.state;

// --- A: tak 79 sharpened → slipp ---
{
  const p = FC.normalizeAcademyPlayer({
    id: 'a1', navn: 'LavTak', rating: 55, potMin: 74, potMax: 79, alder: 17, hoyde: 182, fot: 'H', hoved: 'SM', ekstra: []
  });
  state.akademi = [p];
  state.players = [];
  const v = FC.academyVerdict(p, state.akademi);
  assert(v.level === 'drop', 'A: tak 79 skjerpet → slipp (got ' + v.level + ' / ' + v.chip + ')');
  const d = FC.mammutDecisionBucket(p);
  assert(d.bucket === 'slipp', 'panel: tak 79 → slipp bucket');
}

// --- D: promote age gates ---
assert(FC.mammutPromoteTotOk(15, 99) === false, 'D: 15 never promote');
assert(FC.mammutPromoteTotOk(16, 57) === false, 'D: 16 needs 58+');
assert(FC.mammutPromoteTotOk(16, 58) === true, 'D: 16 @58 ok');
assert(FC.mammutPromoteTotOk(17, 63) === true, 'D: 17 @63 ok');
assert(FC.mammutPromoteTotOk(18, 65) === false, 'D: 18 needs 66+');
assert(FC.mammutPromoteTotOk(18, 66) === true, 'D: 18 @66 ok');

// --- C: sign TOT ---
assert(FC.mammutSignTotOk(14, 47) === false, 'C: 14 needs 48');
assert(FC.mammutSignTotOk(14, 48) === true, 'C: 14 @48 ok');
assert(FC.mammutSignTotOk(17, 62) === true, 'C: 17 @62 ok');

// --- K: scout countries ---
{
  const k = FC.pickScoutCountries('K', {});
  assert(k.length === 3, 'K countries length 3');
  assert(k.every(c => FC.MAMMUT.scoutCountries.K.includes(c) || ['Tyskland','Spania','Nederland'].includes(c)),
    'K countries from Mammut table got ' + k.join(','));
  const s = FC.pickScoutCountries('S', {});
  assert(s.indexOf('Brasil') >= 0 || s.indexOf('Argentina') >= 0 || s.indexOf('Nigeria') >= 0,
    'S countries Mammut-ish: ' + s.join(','));
  assert(Array.isArray(FC.SCOUT_POS_COUNTRIES.MS) && FC.SCOUT_POS_COUNTRIES.MS.length === 0,
    'MS scout countries empty');
}

// --- MS not scout when 92+ ---
{
  state.players = [
    FC.normalizeAcademyPlayer ? null : null
  ];
  state.players = [{
    id: 'ms1', navn: 'EliteMS', rating: 72, potensial: 93, alder: 20, hoyde: 190, fot: 'H', hoved: 'MS', ekstra: []
  }];
  state.akademi = [];
  assert(FC.mammutHasMsEliteCeiling() === true, 'MS 92+ detected');
  const scored = FC.scoreScoutPosition('MS');
  assert(scored.mammutSkip === true || scored.severity === 0, 'MS skipped/severity0 when 92+');
}

// --- Tall MS+VB → Best på MS ---
{
  const p = FC.normalizeAcademyPlayer({
    id: 'tall', navn: 'HoyMS', rating: 58, potMin: 82, potMax: 90, alder: 16, hoyde: 188, fot: 'H',
    hoved: 'VB', ekstra: ['MS']
  });
  state.akademi = [p];
  state.players = [];
  assert(FC.mammutPlayerCanMs(p) && FC.mammutIsTallForMs(188), 'tall+can MS');
  assert(FC.mammutPreferMsOverBack(p, 'VB') === true, 'prefer MS over VB');
  const t = FC.pickBestAcademyTarget(p, 90);
  assert(t.pos === 'MS', 'tall MS+VB → Best på MS (got ' + t.pos + ')');
}

// --- Short back-only still OK as back ---
{
  const p = FC.normalizeAcademyPlayer({
    id: 'onlyback', navn: 'BareBack', rating: 55, potMin: 80, potMax: 88, alder: 16, hoyde: 188, fot: 'V',
    hoved: 'VB', ekstra: []
  });
  assert(FC.mammutPreferMsOverBack(p, 'VB') === false, 'back-only: no MS prefer block');
}

// --- Panel lists ---
{
  state.players = [];
  state.akademi = [
    FC.normalizeAcademyPlayer({ id:'1', navn:'SlippMeg', rating:50, potMin:70, potMax:78, alder:18, hoyde:180, fot:'H', hoved:'SM', ekstra:[] }),
    FC.normalizeAcademyPlayer({ id:'2', navn:'VentMeg', rating:52, potMin:67, potMax:95, alder:15, hoyde:175, fot:'H', hoved:'SM', ekstra:[] }),
    FC.normalizeAcademyPlayer({ id:'3', navn:'Prioritet', rating:60, potMin:86, potMax:92, alder:16, hoyde:178, fot:'H', hoved:'HB', ekstra:[] })
  ];
  const lists = FC.computeMammutAcademyLists();
  assert(lists.rangering.length === 3, 'rangering has 3');
  assert(lists.slipp.some(r => r.p.navn === 'SlippMeg'), 'slipp list has SlippMeg');
  assert(lists.vent.some(r => r.p.navn === 'VentMeg'), 'vent list has VentMeg');
  assert(lists.signer.some(r => r.p.navn === 'Prioritet') || lists.rangering[0].p.navn === 'Prioritet',
    'Prioritet is signer or top rank');
}


// --- Short/lav MS+back → prefer natural-foot back ---
{
  const p = FC.normalizeAcademyPlayer({
    id: 'short', navn: 'LavMS', rating: 56, potMin: 80, potMax: 88, alder: 16, hoyde: 172, fot: 'H',
    hoved: 'MS', ekstra: ['HB']
  });
  state.akademi = [p];
  state.players = [];
  assert(FC.mammutIsShortForMs(172) === true, '172 cm is short for MS');
  assert(FC.mammutPreferMsOverBack(p, 'HB') === false, 'short: do not prefer MS over back');
  const t = FC.pickBestAcademyTarget(p, 88);
  assert(t.pos === 'HB', 'lav MS+HB fot=H → Best på HB (got ' + t.pos + ')');
  assert((t.heightNote || '').toLowerCase().indexOf('lav') >= 0 ||
         (t.heightNote || '').indexOf('VB/HB') >= 0 ||
         (t.heightNote || '').indexOf('vurder') >= 0,
    'tip mentions lav for MS (got: ' + (t.heightNote || '') + ')');
}
{
  const p = FC.normalizeAcademyPlayer({
    id: 'shortV', navn: 'LavMSV', rating: 55, potMin: 78, potMax: 86, alder: 16, hoyde: 175, fot: 'V',
    hoved: 'MS', ekstra: ['VB', 'HB']
  });
  state.akademi = [p];
  state.players = [];
  const t = FC.pickBestAcademyTarget(p, 86);
  assert(t.pos === 'VB', 'lav MS dual backs fot=V → VB (got ' + t.pos + ')');
}


// --- Tip done: set recommended as hoved, old → ekstra ---
{
  const p = FC.normalizeAcademyPlayer({
    id: 'swap', navn: 'ByttPos', rating: 60, potMin: 80, potMax: 88, alder: 17, hoyde: 178, fot: 'H',
    hoved: 'VB', ekstra: ['HB']
  });
  const r = FC.applyPosChangeAsHoved(p, 'HB');
  assert(r.ok === true, 'applyPosChangeAsHoved ok');
  assert(p.hoved === 'HB', 'hoved becomes HB (got ' + p.hoved + ')');
  assert((p.ekstra || []).indexOf('VB') >= 0, 'old VB in ekstra');
  assert((p.ekstra || []).indexOf('HB') < 0, 'HB not duplicated in ekstra');
}

console.log('\nDone.' + (failed ? ' WITH FAILURES ('+failed+')' : ' all asserts passed.'));
