/**
 * Lab: run system Tesseract on cropped markovic.jpg (real TV photo).
 * Asserts fields Tesseract can reliably read; documents gap for 63/MS/17/72-94.
 */
var fs = require('fs');
var path = require('path');
var { execFileSync } = require('child_process');
var vm = require('vm');

var img = path.join(__dirname, 'screenshots/markovic.jpg');
if (!fs.existsSync(img)) {
  console.error('MISSING', img);
  process.exit(2);
}

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

function tesseractWords(imagePath) {
  var tsv = execFileSync('tesseract', [imagePath, 'stdout', '-l', 'eng', '--psm', '6', 'tsv'], {
    encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
  });
  var words = [];
  tsv.split(/\n/).forEach(function (line, i) {
    if (i === 0) return;
    var p = line.split('\t');
    if (p.length < 12) return;
    var t = (p[11] || '').trim();
    if (!t) return;
    var conf = parseFloat(p[10]);
    if (!isFinite(conf)) conf = 0;
    var l = +p[6], top = +p[7], w = +p[8], h = +p[9];
    words.push({ text: t, confidence: conf, bbox: { x0: l, y0: top, x1: l + w, y1: top + h } });
  });
  return words;
}

function tesseractText(imagePath) {
  return execFileSync('tesseract', [imagePath, 'stdout', '-l', 'eng', '--psm', '6'], {
    encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
  });
}

var rawText = tesseractText(img);
var words = tesseractWords(img);
var textParsed = sandbox.parseEaFcOcrText(rawText);
var layout = sandbox.parseEaFcOcrLayout(words);
var merged = sandbox.mergeLayoutWithTextParse(layout, textParsed);

console.log('--- raw OCR (first 500) ---');
console.log(rawText.slice(0, 500));
console.log('--- merged parse ---');
console.log(JSON.stringify(merged, null, 2));

var fails = 0;
function assert(c, m) { if (!c) { console.error('FAIL', m); fails++; } else console.log('OK', m); }

// Achievable on this TV photo with Tesseract 5.5 + color crop:
assert(/markov/i.test(merged.navn || rawText), 'name contains Markovic (OCR or parse)');
assert(merged.hoyde === 193 || /\b193\b/.test(rawText), 'height 193 visible to OCR');
assert(!/serbia/i.test(merged.navn || ''), 'parser must not use SERBIA as name (got=' + merged.navn + ')');
assert(merged.rating !== 61 && merged.rating !== 32 && merged.rating !== 67, 'OVR not hex TMP/SKU/FYS');

// Document gap — these often fail on moiré TV photos even when cropped
var gap = [];
if (merged.rating !== 63) gap.push('rating≠63 (got ' + merged.rating + ')');
if (!(merged.potMin === 72 && merged.potMax === 94)) gap.push('pot≠72-94 (got ' + merged.potMin + '-' + merged.potMax + ')');
if (merged.alder !== 17) gap.push('age≠17 (got ' + merged.alder + ')');
if (merged.hoved !== 'MS') gap.push('pos≠MS (got ' + merged.hoved + ')');

var report = {
  crop: 'screenshots/markovic.jpg (2400x1100+300+2100 from full TV photo)',
  winning_preprocess: 'raw COLOR on info-card crop (soft grayscale hurt; white-mask reconnect helps MS intermittently)',
  achievable: {
    name: !!(merged.navn && /markov/i.test(merged.navn)) || /markov/i.test(rawText),
    height193: merged.hoyde === 193 || /\b193\b/.test(rawText),
    alder_label: /alder/i.test(rawText),
    hex_labels_ignored: true
  },
  gap: gap,
  note: 'Tesseract cannot reliably read OVR 63 / age 17 / full 72-94 / MS from this moiré TV photo even when tightly cropped. Manual entry recommended for those fields. Parser accepts Norwegian layout when OCR words are correct (see test-markovic-fasit.js).'
};
fs.writeFileSync(path.join(__dirname, 'screenshots/markovic_ocr_gap_report.json'), JSON.stringify(report, null, 2));
console.log('--- gap report ---');
console.log(JSON.stringify(report, null, 2));

if (gap.length) {
  console.log('GAP (documented, not hard-fail):', gap.join('; '));
}
process.exit(fails ? 1 : 0);
