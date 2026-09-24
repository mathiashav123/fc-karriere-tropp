/** Regression: Norwegian FC card spatial fixture (Marković fasit). */
var fs = require('fs');
var vm = require('vm');
var KARRIERE_POSITIONS = [
  { code: 'K' }, { code: 'VB' }, { code: 'VWB' }, { code: 'MS' }, { code: 'HB' }, { code: 'HWB' },
  { code: 'SDM' }, { code: 'SM' }, { code: 'AM' }, { code: 'VV' }, { code: 'S' }, { code: 'HV' }
];
var POS_BY_CODE = {};
KARRIERE_POSITIONS.forEach(function (p) { POS_BY_CODE[p.code] = p; });
POS_BY_CODE.CB = { code: 'CB' };
var OLD_TO = {
  GK: 'K', ST: 'S', CB: 'MS', CDM: 'SDM', CM: 'SM', CAM: 'AM', LB: 'VB', RB: 'HB',
  LWB: 'VWB', RWB: 'HWB', LW: 'VV', RW: 'HV', CF: 'S', VMS: 'MS', HMS: 'MS'
};
function normalizePosCode(c) {
  if (!c) return '';
  c = String(c).trim().toUpperCase();
  return OLD_TO[c] || c;
}
var src = fs.readFileSync(__dirname + '/_ocr_extract.js', 'utf8');
var code = src.slice(0, src.indexOf('function fillTroppFormFromOcr'));
var sandbox = {
  KARRIERE_POSITIONS: KARRIERE_POSITIONS, POS_BY_CODE: POS_BY_CODE, OLD_TO: OLD_TO,
  normalizePosCode: normalizePosCode, console: console, window: {},
  document: { createElement: function () { return {}; }, head: { appendChild: function () {} }, getElementById: function () { return null; } },
  URL: { createObjectURL: function () { return ''; }, revokeObjectURL: function () {} },
  Image: function () {}, Promise: Promise, Math: Math, JSON: JSON, parseInt: parseInt,
  String: String, Array: Array, isFinite: isFinite, Uint8ClampedArray: Uint8ClampedArray,
  Float32Array: Float32Array
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

var fails = 0;
function assert(c, m) { if (!c) { console.error('FAIL', m); fails++; } else console.log('OK', m); }

// 1) Spatial fasit fixture (Norwegian layout: OVR left of name, Alder-labeled age)
var fixture = JSON.parse(fs.readFileSync(__dirname + '/screenshots/markovic_fasit_words.json', 'utf8'));
var layout = sandbox.parseEaFcOcrLayout(fixture);
var merged = sandbox.mergeLayoutWithTextParse(layout, sandbox.emptyOcrParse());
console.log('fixture parse', JSON.stringify(merged));
assert(/Markovi/i.test(merged.navn || ''), 'name≈Marković got=' + merged.navn);
assert(merged.rating === 63, 'rating=63 got=' + merged.rating);
assert(merged.potMin === 72 && merged.potMax === 94, 'pot 72-94 got=' + merged.potMin + '-' + merged.potMax);
assert(merged.alder === 17, 'age=17 got=' + merged.alder);
assert(merged.hoved === 'MS', 'pos=MS got=' + merged.hoved);
assert(merged.hoyde === 193, 'height=193 got=' + merged.hoyde);
assert(!/serbia|cm|kg/i.test(merged.navn || ''), 'reject Serbia/CM/KG as name');

// 2) Garbage name rejection
assert(!sandbox.isLikelyPlayerName('Serbia Cm Kg'), 'reject «Serbia Cm Kg»');
assert(!sandbox.isLikelyPlayerName('SERBIA'), 'reject SERBIA alone');
assert(!sandbox.isLikelyPlayerName('TMP'), 'reject TMP hex');
assert(!sandbox.isLikelyPlayerName('FYS'), 'reject FYS hex');
assert(sandbox.isLikelyPlayerName('Z. MARKOVIĆ'), 'accept Z. MARKOVIĆ');

// 3) Text parse with Alder label
var textParsed = sandbox.parseEaFcOcrText(
  'MS\n63  Z. MARKOVIĆ\n72-94\nAlder\n17\nNasjonalitet/region SERBIA\nHøyde og vekt\n193 CM/84 KG\nTMP 61 SKU 32 PAS 44 DRI 47 FOR 59 FYS 67'
);
assert(/Markovi/i.test(textParsed.navn || ''), 'text name got=' + textParsed.navn);
assert(textParsed.rating === 63, 'text rating=63 got=' + textParsed.rating);
assert(textParsed.potMin === 72 && textParsed.potMax === 94, 'text pot');
assert(textParsed.alder === 17, 'text age=17 got=' + textParsed.alder);
assert(textParsed.hoyde === 193, 'text height');
assert(textParsed.hoved === 'MS', 'text pos=MS got=' + textParsed.hoved);
// Hex stats must not become OVR
assert(textParsed.rating !== 61 && textParsed.rating !== 67, 'OVR not confused with TMP/FYS');

process.exit(fails ? 1 : 0);
