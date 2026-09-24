// —— Tesseract OCR (lazy CDN load, 100% in-browser) ——
  var TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  var tesseractLoadPromise = null;
  var ocrLastByTarget = { tropp: null, akademi: null }; // { file, objectUrl, aggressive }

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tesseractLoadPromise) return tesseractLoadPromise;
    tesseractLoadPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = TESSERACT_CDN;
      s.async = true;
      s.onload = function () {
        if (window.Tesseract) resolve(window.Tesseract);
        else {
          tesseractLoadPromise = null;
          reject(new Error('Tesseract mangler etter lasting'));
        }
      };
      s.onerror = function () {
        tesseractLoadPromise = null;
        reject(new Error('cdn'));
      };
      document.head.appendChild(s);
    });
    return tesseractLoadPromise;
  }

  function setOcrStatus(target, msg, kind) {
    var el = document.getElementById('ocr-status-' + target);
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      el.classList.remove('warn', 'ok');
      return;
    }
    el.hidden = false;
    el.textContent = msg;
    el.classList.remove('warn', 'ok');
    if (kind === 'warn') el.classList.add('warn');
    if (kind === 'ok') el.classList.add('ok');
  }

  function setOcrPreviewNote(target, msg) {
    var el = document.getElementById('ocr-preview-note-' + target);
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function setOcrRetryVisible(target, visible) {
    var btn = document.getElementById('ocr-retry-' + target);
    if (!btn) return;
    btn.hidden = !visible;
    btn.disabled = false;
  }

  function showOcrPreview(target, objectUrl, spinning, spinText) {
    var box = document.getElementById('ocr-preview-' + target);
    if (!box) return;
    box.classList.remove('hidden');
    var spin = spinning
      ? '<div class="ocr-spin">' + (spinText || 'Leser bilde…') + '</div>'
      : '';
    box.innerHTML = '<img alt="Forhåndsvisning" src="' + objectUrl + '">' + spin;
  }

  function clearOcrPreviewSpin(target) {
    var box = document.getElementById('ocr-preview-' + target);
    if (!box) return;
    var spin = box.querySelector('.ocr-spin');
    if (spin) spin.remove();
  }

  function updateOcrSpin(target, text) {
    var box = document.getElementById('ocr-preview-' + target);
    if (!box) return;
    var spin = box.querySelector('.ocr-spin');
    if (spin) spin.textContent = text || 'Leser bilde…';
  }

  /** Load File/Blob into HTMLImageElement */
  function loadImageFromBlob(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('bilde'));
      };
      img.src = url;
    });
  }

  /**
   * Soft letter class for EA FC player names (Latin + Nordic + South Slavic).
   * MARKOVIĆ / Č / Š / Ž must survive cleaning — otherwise names collapse to noise.
   */
  var OCR_LETTER = 'A-Za-zÆØÅæøåÄÖäöÜüßĆćČčŠšŽžĐđ';
  var OCR_LETTER_RE = new RegExp('[^' + OCR_LETTER + ']', 'g');
  var OCR_LETTER_KEEP_RE = new RegExp('[^' + OCR_LETTER + "\\-'\\.\\s]", 'g');

  var OCR_HEX_STAT_LABELS = /^(PAC|SHO|PAS|DRI|DEF|PHY|TMP|SKU|FOR|FYS|ACC|SPR|FIN|SHA|VOL|PEN|CRO|FRE|SHO?T|SHT|TAC|STR|JMP|STA|AGI|BAL|REA|COM|POS|ATT|INT|VIS|LBS|KG)$/i;

  /**
   * Preprocess EA FC screenshots for OCR.
   * Default (soft): mild COLOR contrast/brightness — TV photos of FC UI lose
   * name/height when forced to grayscale (moiré). Preview stays colour.
   * Aggressive (retry): white-luminance B&W + light blur reconnect for moiré gaps.
   * Returns { blob, width, height, note, processed, scale, aggressive, mode }.
   */
  function preprocessImageForOcr(file, opts) {
    opts = opts || {};
    var aggressive = !!opts.aggressive;
    var maxSide = 1800;
    var minSide = 720;

    return loadImageFromBlob(file).then(function (img) {
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      if (!w || !h) throw new Error('bilde');

      var scale = 1;
      var longest = Math.max(w, h);
      var shortest = Math.min(w, h);
      if (longest > maxSide) scale = maxSide / longest;
      else if (shortest < minSide && longest < maxSide) {
        scale = Math.min(minSide / shortest, maxSide / longest);
      }

      var dw = Math.max(1, Math.round(w * scale));
      var dh = Math.max(1, Math.round(h * scale));
      var canvas = document.createElement('canvas');
      canvas.width = dw;
      canvas.height = dh;
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, dw, dh);

      var imageData = ctx.getImageData(0, 0, dw, dh);
      var d = imageData.data;

      if (aggressive) {
        // White-luminance B&W + 1px blur reconnect (helps TV moiré stroke gaps)
        var tmp = new Float32Array(dw * dh);
        for (var i = 0, p = 0; i < d.length; i += 4, p++) {
          var y = 0.25 * d[i] + 0.55 * d[i + 1] + 0.2 * d[i + 2];
          // Keep bright HUD text; crush dark jersey/bg
          tmp[p] = y >= 145 ? y : 0;
        }
        // Box blur ~radius 1 then threshold
        var blur = new Float32Array(dw * dh);
        for (var yy = 0; yy < dh; yy++) {
          for (var xx = 0; xx < dw; xx++) {
            var sum = 0, n = 0;
            for (var dy = -1; dy <= 1; dy++) {
              for (var dx = -1; dx <= 1; dx++) {
                var sx = xx + dx, sy = yy + dy;
                if (sx < 0 || sy < 0 || sx >= dw || sy >= dh) continue;
                sum += tmp[sy * dw + sx];
                n++;
              }
            }
            blur[yy * dw + xx] = sum / n;
          }
        }
        for (var j = 0, q = 0; j < d.length; j += 4, q++) {
          var v = blur[q] >= 90 ? 255 : 0;
          d[j] = d[j + 1] = d[j + 2] = v;
        }
      } else {
        // Soft COLOR: gentle lift/contrast — do NOT force grayscale (TV moiré + gray kills digits)
        var softContrast = 1.18;
        var softLift = 8;
        for (var k = 0; k < d.length; k += 4) {
          for (var c = 0; c < 3; c++) {
            var ch = d[k + c] + softLift;
            ch = (ch - 128) * softContrast + 128;
            if (ch < 0) ch = 0;
            if (ch > 255) ch = 255;
            d[k + c] = Math.round(ch);
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);

      var noteParts = [];
      if (scale !== 1) {
        noteParts.push(scale < 1 ? 'nedskalert' : 'oppskalert');
      }
      noteParts.push(aggressive ? 'sterk kontrast (svart/hvitt + moiré-bro)' : 'myk fargeforbehandling');
      var note = 'OCR-forbehandling (' + noteParts.join(', ') + ') · ' + dw + '\u00d7' + dh;

      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (!blob) {
            reject(new Error('canvas'));
            return;
          }
          resolve({
            blob: blob,
            width: dw,
            height: dh,
            note: note,
            processed: true,
            scale: scale,
            aggressive: aggressive,
            mode: aggressive ? 'aggressive' : 'soft'
          });
        }, 'image/png');
      });
    });
  }

  function formatPreprocessNote(info, previewMode) {
    // previewMode: 'color' (default display) | 'processed'
    var parts = [];
    if (info && info.scale && info.scale !== 1) {
      parts.push(info.scale < 1 ? 'nedskalert' : 'oppskalert');
    }
    if (previewMode === 'processed' && info && info.aggressive) {
      parts.push('sterk kontrast (svart/hvitt)');
      return 'Forhåndsvisning: sterk kontrast · ' + (info.width || '?') + '\u00d7' + (info.height || '?');
    }
    // Soft / default: preview keeps original colours
    parts.push('forhåndsvisning beholder farger');
    if (info && !info.aggressive) parts.push('myk OCR-forbehandling i bakgrunnen');
    var dim = info && info.width ? (' · ' + info.width + '\u00d7' + info.height) : '';
    return parts.join(' · ') + dim;
  }

  var POS_OCR_TOKENS = [
    'LWB', 'RWB', 'CDM', 'CAM', 'VWB', 'HWB', 'SDM', 'VMS', 'HMS', 'VSM', 'HSM',
    'GK', 'CB', 'LB', 'RB', 'CM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF', 'LF', 'RF',
    'VB', 'MS', 'HB', 'SM', 'AM', 'VV', 'HV', 'K', 'S'
  ];

  function ocrLettersOnly(s) {
    return String(s || '').replace(OCR_LETTER_RE, '');
  }

  function ocrCleanNameLine(s) {
    return String(s || '').replace(OCR_LETTER_KEEP_RE, ' ').replace(/\s+/g, ' ').trim();
  }

  /** Reject OCR noise like "ig bi Pes", single junk tokens, mixed nonsense. */
  function isLikelyPlayerName(raw) {
    var cleaned = ocrCleanNameLine(raw);
    if (!cleaned || cleaned.length < 3 || cleaned.length > 42) return false;
    if (/^(OVR|POT|POTENTIAL|POTENSIAL|AGE|ALDER|HEIGHT|H[ØO]YDE|POSITION|POSISJON|RAT|OVERALL|CM|KG|FIFA|EA|FC|YOUTH|ACADEMY|PLAYER|STATS|INFO|CLUB|NATION|NASJONALITET|REGION|SERBIA|NORWAY|NORGE|SWEDEN|SVERIGE|DENMARK|DANMARK|ENGLAND|FRANCE|SPAIN|BRAZIL|BRASIL|GERMANY|TYSKLAND|ITALY|ITALIA|CROATIA|POLAND|PORTUGAL|NETHERLANDS|BELGIUM|ARGENTINA|MEXICO|USA|ADIDAS|NIKE|PUMA)$/i.test(cleaned)) return false;
    // Reject "Serbia Cm Kg" / nation+unit garbage glued by OCR
    if (/\b(serbia|norway|norge|sweden|england|france|spain|brazil|germany|italy)\b/i.test(cleaned) && /\b(cm|kg|lbs)\b/i.test(cleaned)) return false;
    if (/^(cm\/?\d*|\d+\s*cm|\d+\s*kg)/i.test(cleaned)) return false;
    if (OCR_HEX_STAT_LABELS.test(cleaned)) return false;
    if (POS_OCR_TOKENS.some(function (t) { return t.toUpperCase() === cleaned.toUpperCase(); })) return false;
    var words = cleaned.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 5) return false;
    var letters = ocrLettersOnly(cleaned);
    if (letters.length < 3) return false;
    // Reject mostly-lowercase short fragments ("ig bi Pes")
    var lowerFrac = (cleaned.match(/[a-zæøåäöüćčšžđ]/g) || []).length / Math.max(letters.length, 1);
    var hasInitial = /^[A-ZÆØÅÄÖÜĆČŠŽĐ]\.\s*[A-ZÆØÅÄÖÜĆČŠŽĐ]/.test(cleaned);
    var allCapsWord = words.some(function (w) {
      var L = ocrLettersOnly(w);
      return L.length >= 4 && L === L.toUpperCase();
    });
    if (letters.length <= 8 && lowerFrac > 0.55 && !hasInitial && !allCapsWord) return false;
    // Reject if every word is tiny (≤2 letters) without an initial pattern
    if (!hasInitial && words.every(function (w) { return ocrLettersOnly(w).length <= 2; })) return false;
    // Reject pure noise: digits-heavy or too few vowels in longer strings
    if (/^\d/.test(cleaned)) return false;
    return true;
  }

  function scorePlayerNameCandidate(cleaned, idx, confBonus) {
    confBonus = confBonus || 0;
    var words = cleaned.split(/\s+/).filter(Boolean);
    var letters = ocrLettersOnly(cleaned);
    var score = letters.length * 2 + confBonus;
    // Initial + surname: "Z. MARKOVIĆ"
    if (/^[A-ZÆØÅÄÖÜĆČŠŽĐ]\.\s*[A-ZÆØÅÄÖÜĆČŠŽĐ][A-Za-zÆØÅæøåÄÖäöÜüßĆćČčŠšŽžĐđ'\-]{2,}$/.test(cleaned)) {
      score += 55;
    }
    // ALL-CAPS / title name band
    if (/^[A-ZÆØÅÄÖÜĆČŠŽĐ.\-\s']{3,}$/.test(cleaned) && letters.length >= 4) score += 35;
    else if (/^[A-ZÆØÅÄÖÜĆČŠŽĐ][A-Za-zÆØÅæøåÄÖäöÜüßĆćČčŠšŽžĐđ'\-\.]+(?:\s+[A-ZÆØÅÄÖÜĆČŠŽĐ][A-Za-zÆØÅæøåÄÖäöÜüßĆćČčŠšŽžĐđ'\-\.]+)*$/.test(cleaned)) {
      score += 22;
    }
    // Longer surname bonus
    var longest = 0;
    words.forEach(function (w) {
      var L = ocrLettersOnly(w.replace(/\./g, ''));
      if (L.length > longest) longest = L.length;
    });
    if (longest >= 6) score += 18;
    else if (longest >= 4) score += 8;
    if (idx < 8) score += 10 - idx;
    if (words.length > 3) score -= 5;
    // Penalize mixed junk
    if (/\b(pes|ig|bi|www|http)\b/i.test(cleaned) && longest < 6) score -= 40;
    return score;
  }

  function parseEaFcOcrText(raw) {

    var text = String(raw || '').replace(/\r/g, '\n');
    var lines = text.split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
    var flat = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');
    var out = {
      navn: '', rating: null, potensial: null, potMin: null, potMax: null,
      alder: null, hoyde: null, hoved: '', confidence: 0, fields: []
    };
    var hits = 0;

    function claim(field) {
      if (out.fields.indexOf(field) === -1) out.fields.push(field);
    }

    // Potential range near POT label: 62-96 / 62–96 / 62 / 96 / 62/96
    var rangeLabeled = flat.match(
      /(?:pot(?:ensial|ential)?|pot\.?|potential)\s*[:.]?\s*(\d{2})\s*(?:[-–—~]|\/|\\)\s*(\d{2})/i
    );
    // also "62 / 96" with spaces
    if (!rangeLabeled) {
      rangeLabeled = flat.match(
        /(?:pot(?:ensial|ential)?|pot\.?)\s*[:.]?\s*(\d{2})\s*[\/|]\s*(\d{2})/i
      );
    }
    if (rangeLabeled) {
      var a = parseInt(rangeLabeled[1], 10), b = parseInt(rangeLabeled[2], 10);
      if (a >= 1 && a <= 99 && b >= 1 && b <= 99) {
        out.potMin = Math.min(a, b);
        out.potMax = Math.max(a, b);
        out.potensial = Math.round((out.potMin + out.potMax) / 2);
        hits += 2;
        claim('pot');
      }
    } else {
      var rangeRe2 = /(\d{2})\s*[-–—]\s*(\d{2})(?!\d)/g;
      var m2, bestSpan = -1, bestPair = null;
      while ((m2 = rangeRe2.exec(flat))) {
        var x = parseInt(m2[1], 10), y = parseInt(m2[2], 10);
        if (x < 40 || y > 99 || x >= y) continue;
        var span = y - x;
        if (span >= 5 && span <= 55 && span > bestSpan) {
          bestSpan = span;
          bestPair = [x, y];
        }
      }
      // slash ranges without label (academy cards often show 62/96)
      if (!bestPair) {
        var slashRe = /(\d{2})\s*[\/|]\s*(\d{2})(?!\d)/g;
        while ((m2 = slashRe.exec(flat))) {
          var x2 = parseInt(m2[1], 10), y2 = parseInt(m2[2], 10);
          if (x2 < 40 || y2 > 99 || x2 >= y2) continue;
          var sp2 = y2 - x2;
          if (sp2 >= 5 && sp2 <= 55 && sp2 > bestSpan) {
            bestSpan = sp2;
            bestPair = [x2, y2];
          }
        }
      }
      if (bestPair) {
        out.potMin = bestPair[0];
        out.potMax = bestPair[1];
        out.potensial = Math.round((out.potMin + out.potMax) / 2);
        hits += 2;
        claim('pot');
      }
    }

    // Single potential
    if (out.potensial == null) {
      var potSingle = flat.match(/(?:pot(?:ensial|ential)?|pot\.?)\s*[:.]?\s*(\d{2})\b/i);
      if (potSingle) {
        var pv = parseInt(potSingle[1], 10);
        if (pv >= 40 && pv <= 99) {
          out.potensial = pv;
          out.potMin = pv;
          out.potMax = pv;
          hits++;
          claim('pot');
        }
      }
    }

    // Overall / rating — labeled first
    var ovr = flat.match(/(?:ovr|overall|rating|rat\.?|o\s*v\s*r)\s*[:.]?\s*(\d{2})\b/i);
    if (ovr) {
      var ov = parseInt(ovr[1], 10);
      if (ov >= 40 && ov <= 99) {
        out.rating = ov;
        hits++;
        claim('ovr');
      }
    }
    if (out.rating == null) {
      for (var i = 0; i < Math.min(lines.length, 12); i++) {
        var line = lines[i];
        // Skip pot-range lines: "72-94", "72 94", "2 94" (OCR often drops the tens of min)
        if (/\d{2}\s*[-–—\/]\s*\d{2}/.test(line)) continue;
        if (/(?:^|\s)\d{1,2}\s+\d{2}(?:\s|$)/.test(line) && !/ovr|overall|rating/i.test(line)) continue;
        // Skip height/weight lines (193 CM/84 KG) — 84 must not become OVR
        if (/\b(cm|kg|lbs|høyde|hoyde|height|vekt|weight)\b/i.test(line)) continue;
        if (/\d{2,3}\s*cm\s*\/?\s*\d{2}/i.test(line)) continue;
        var nm = line.match(/^(?:OVR|RAT|OVERALL)?\s*(\d{2})\s*$/i);
        if (!nm) {
          // Prefer a lone 2-digit token; ignore digits glued to CM/KG
          nm = line.match(/(?:^|\s)(\d{2})(?=\s|$)/);
        }
        if (!nm) continue;
        var n = parseInt(nm[1], 10);
        if (n >= 45 && n <= 99 &&
            (out.potensial == null || n !== out.potensial) &&
            (out.potMin == null || n !== out.potMin) &&
            (out.potMax == null || n !== out.potMax)) {
          out.rating = n;
          hits++;
          claim('ovr');
          break;
        }
      }
    }

    // Age
    var ageM = flat.match(/(?:alder|age|år|yrs?)\s*[:.]?\s*(\d{1,2})\b/i);
    if (ageM) {
      var ag = parseInt(ageM[1], 10);
      if (ag >= 14 && ag <= 45) {
        out.alder = ag;
        hits++;
        claim('alder');
      }
    }

    // Height cm or feet'inches
    var hM = flat.match(/(?:høyde|hoyde|height|ht)\s*[:.]?\s*(\d{3})\s*(?:cm)?/i) ||
      flat.match(/\b(1[5-9]\d|20\d|210)\s*cm\b/i);
    if (hM) {
      var hy = parseInt(hM[1], 10);
      if (hy >= 150 && hy <= 210) {
        out.hoyde = hy;
        hits++;
        claim('hoyde');
      }
    } else {
      var ft = flat.match(/\b([4-7])\s*[\'′']\s*(\d{1,2})\s*[\"″"]?/);
      if (ft) {
        var cm = Math.round((parseInt(ft[1], 10) * 12 + parseInt(ft[2], 10)) * 2.54);
        if (cm >= 150 && cm <= 210) {
          out.hoyde = cm;
          hits++;
          claim('hoyde');
        }
      } else {
        // bare 3-digit in plausible height range (avoid OVR confusion: heights >= 150)
        var bareH = flat.match(/\b(1[5-9]\d|20[0-9]|210)\b/);
        if (bareH) {
          var hy2 = parseInt(bareH[1], 10);
          out.hoyde = hy2;
          hits++;
          claim('hoyde');
        }
      }
    }

    // Position — labeled or token scan (longer tokens first)
    var posFound = '';
    var posLabel = flat.match(
      /(?:pos(?:isjon|ition)?|pos\.?)\s*[:.]?\s*([A-Za-zÆØÅæøå]{1,4})\b/i
    );
    if (posLabel) {
      var cand = normalizePosCode(posLabel[1]);
      if (cand && POS_BY_CODE[cand]) posFound = cand;
    }
    // Norwegian words
    if (!posFound) {
      var noMap = [
        [/\bmidtstopper\b/i, 'MS'], [/\bkeeper\b/i, 'K'], [/\bmålvakt\b/i, 'K'],
        [/\bvenstreback\b/i, 'VB'], [/\bhøyreback\b/i, 'HB'], [/\bhoyreback\b/i, 'HB'],
        [/\bvingback\b/i, 'VWB'], [/\bspiss\b/i, 'S'], [/\bvenstre\s*ving\b/i, 'VV'],
        [/\bhøyre\s*ving\b/i, 'HV'], [/\bsittende\b/i, 'SDM'], [/\bangripende\b/i, 'AM']
      ];
      for (var ni = 0; ni < noMap.length; ni++) {
        if (noMap[ni][0].test(flat)) {
          posFound = noMap[ni][1];
          break;
        }
      }
    }
    if (!posFound) {
      // Prefer unambiguous 2–3 letter codes (MS/CB/…). Never take lone S from "PES" noise.
      // Case-sensitive first: EA FC shows MS/CB/ST uppercase — avoids matching "cm" as CM
      var preferOrder = POS_OCR_TOKENS.slice().sort(function (a, b) { return b.length - a.length; });
      for (var pass = 0; pass < 2 && !posFound; pass++) {
        var flags = pass === 0 ? '' : 'i';
        for (var pi = 0; pi < preferOrder.length; pi++) {
          var tok = preferOrder[pi];
          // Skip ambiguous short tokens (S/ST/CM/K/AM) — too many false positives from OCR noise
          if (tok === 'S' || tok === 'ST' || tok === 'CM' || tok === 'K' || tok === 'AM') continue;
          if (pass === 1 && tok.length <= 2) continue;
          var re = new RegExp('\\b' + tok + '\\b', flags);
          if (re.test(flat)) {
            var nc = normalizePosCode(tok);
            if (nc && KARRIERE_POSITIONS.some(function (p) { return p.code === nc; })) {
              posFound = nc;
              break;
            }
          }
        }
      }
    }
    if (posFound) {
      // Extra safety: sided → generic for player attribute
      posFound = normalizePosCode(posFound);
      if (KARRIERE_POSITIONS.some(function (p) { return p.code === posFound; })) {
        out.hoved = posFound;
        hits++;
        claim('pos');
      }
    }

    // Name: prefer Initial + SURNAME / largest ALL-CAPS band; reject OCR noise
    var bestName = '';
    var bestScore = 0;
    lines.forEach(function (line, idx) {
      var cleaned = ocrCleanNameLine(line);
      if (!isLikelyPlayerName(cleaned)) return;
      if (/^(position|posisjon|overall|potential|potensial|age|alder|height|høyde|hoyde|ovr|pot)\b/i.test(cleaned)) return;
      var score = scorePlayerNameCandidate(cleaned, idx, 0);
      if (score > bestScore) {
        bestScore = score;
        bestName = cleaned.replace(/\s+/g, ' ');
        bestName = titleCaseName(bestName);
      }
    });
    if (bestName && bestScore >= 12) {
      out.navn = bestName;
      hits++;
      claim('navn');
    }


    out.confidence = hits;
    return out;
  }


  /**
   * Spatial EA FC card parse from Tesseract word boxes.
   * Expected layout (approx):
   *         POS
   *        NAME
   *  RATING     POTENTIAL
   *  AGE
   * Sample (mental check):
   *   ST @ (120,40)-(150,60), Haaland @ (80,70)-(200,100),
   *   91 @ (60,110)-(90,140), 94 @ (140,110)-(170,140), 23 @ (60,150)-(90,175)
   *   → hoved=S, navn=Haaland, rating=91, pot=94, alder=23
   */
  function emptyOcrParse() {
    return {
      navn: '', rating: null, potensial: null, potMin: null, potMax: null,
      alder: null, hoyde: null, hoved: '', confidence: 0, fields: []
    };
  }

  function normalizeOcrWords(rawWords) {
    var out = [];
    if (!rawWords || !rawWords.length) return out;
    for (var i = 0; i < rawWords.length; i++) {
      var w = rawWords[i];
      if (!w) continue;
      var t = String(w.text || '').trim();
      if (!t) continue;
      var conf = typeof w.confidence === 'number' ? w.confidence : 50;
      if (conf < 25 && t.length <= 2) continue;
      var b = w.bbox || w.boundingBox || {};
      var x0 = +b.x0, y0 = +b.y0, x1 = +b.x1, y1 = +b.y1;
      if (!(isFinite(x0) && isFinite(y0) && isFinite(x1) && isFinite(y1))) continue;
      if (x1 <= x0 || y1 <= y0) continue;
      out.push({
        text: t,
        confidence: conf,
        bbox: { x0: x0, y0: y0, x1: x1, y1: y1 },
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
        w: x1 - x0,
        h: y1 - y0
      });
    }
    return out;
  }

  function dedupeOcrWords(words) {
    var seen = {};
    var out = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var key = w.text.toUpperCase() + '|' + Math.round(w.bbox.x0 / 4) + '|' + Math.round(w.bbox.y0 / 4);
      if (seen[key]) {
        if (w.confidence > seen[key].confidence) {
          out[seen[key].idx] = w;
          seen[key] = { confidence: w.confidence, idx: seen[key].idx };
        }
        continue;
      }
      seen[key] = { confidence: w.confidence, idx: out.length };
      out.push(w);
    }
    return out;
  }

  var OCR_LABEL_SKIP = /^(OVR|POT|POTENTIAL|POTENSIAL|AGE|ALDER|HEIGHT|HØYDE|HOYDE|POSITION|POSISJON|RAT|OVERALL|CM|KG|FIFA|EA|FC|CAREER|KARRIERE|YOUTH|AKADEMIE|ACADEMY|PLAYER|STATS|INFO|CLUB|NATION|NASJONALITET|REGION|CONTRACT|WAGE|VALUE|PAC|SHO|PAS|DRI|DEF|PHY|TMP|SKU|FOR|FYS|SERBIA|NORWAY|NORGE|ADIDAS|NIKE)$/i;

  function isLetterishWord(t) {
    var s = String(t || '').trim();
    // Allow initials like "Z." so "Z. MARKOVIĆ" clusters as one name
    if (/^[A-Za-zÆØÅæøåÄÖäöÜüßĆćČčŠšŽžĐđ]\.$/.test(s)) return true;
    var letters = ocrLettersOnly(s);
    return letters.length >= 2 && letters.length / Math.max(s.length, 1) >= 0.55;
  }

  function titleCaseName(s) {
    // Keep "Z. MARKOVIĆ" → "Z. Marković" (preserve initial + diacritics)
    var t = String(s || '').trim();
    if (!t) return t;
    // "Z.MARKOVIĆ" / "Z.markovic" → insert space after initial
    t = t.replace(/^([A-Za-zÆØÅæøåÄÖäöÜüßĆćČčŠšŽžĐđ])\.\s*([A-Za-zÆØÅæøåÄÖäöÜüßĆćČčŠšŽžĐđ])/, '$1. $2');
    if (/^[A-Za-zÆØÅæøåÄÖäöÜüßĆćČčŠšŽžĐđ.\-'\s]+$/.test(t) && ocrLettersOnly(t).length > 3) {
      return t.toLowerCase().replace(/(^|[\s\-'])([a-zæøåäöüćčšžđ])/g, function (_, a, b) {
        return a + b.toUpperCase();
      }).replace(/^([a-zæøåäöüćčšžđ])\./, function (_, c) {
        return c.toUpperCase() + '.';
      });
    }
    return t;
  }

  function parseEaFcOcrLayout(rawWords) {
    var words = dedupeOcrWords(normalizeOcrWords(rawWords));
    var out = emptyOcrParse();
    if (words.length < 2) return out;

    // Drop labeled hex-stat tokens (PAC/SHO/…) — their numbers must not become OVR/POT
    var hexLabelYs = [];
    words.forEach(function (w) {
      if (OCR_HEX_STAT_LABELS.test(w.text)) hexLabelYs.push(w);
    });
    function nearHexStat(w) {
      for (var hi = 0; hi < hexLabelYs.length; hi++) {
        var lab = hexLabelYs[hi];
        if (Math.abs(w.cy - lab.cy) <= Math.max(w.h, lab.h) * 1.4 + 10 &&
            Math.abs(w.cx - lab.cx) <= Math.max(w.w, lab.w) * 2.5 + 30) {
          return true;
        }
      }
      // Also skip the label words themselves
      return OCR_HEX_STAT_LABELS.test(w.text);
    }
    var filtered = words.filter(function (w) { return !nearHexStat(w); });
    // Keep labels out but allow height "193 CM" — CM alone already skipped via OCR_LABEL_SKIP later
    words = filtered.length >= 2 ? filtered : words;

    var minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    words.forEach(function (w) {
      minY = Math.min(minY, w.bbox.y0);
      maxY = Math.max(maxY, w.bbox.y1);
      minX = Math.min(minX, w.bbox.x0);
      maxX = Math.max(maxX, w.bbox.x1);
    });
    var cardH = Math.max(1, maxY - minY);
    var cardW = Math.max(1, maxX - minX);
    var ySlack = Math.max(8, cardH * 0.04);
    var xSlack = Math.max(10, cardW * 0.06);

    // —— Name: largest ALL-CAPS / Initial+Surname band near top of info block ——
    var letterWords = words.filter(function (w) {
      if (!isLetterishWord(w.text)) return false;
      if (OCR_LABEL_SKIP.test(w.text)) return false;
      if (OCR_HEX_STAT_LABELS.test(w.text)) return false;
      if (POS_OCR_TOKENS.some(function (t) { return t.toUpperCase() === w.text.toUpperCase(); })) return false;
      return w.cy <= minY + cardH * 0.55;
    });
    letterWords.sort(function (a, b) { return a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0; });

    var clusters = [];
    var used = {};
    for (var i = 0; i < letterWords.length; i++) {
      if (used[i]) continue;
      var seed = letterWords[i];
      var group = [seed];
      used[i] = true;
      for (var j = i + 1; j < letterWords.length; j++) {
        if (used[j]) continue;
        var o = letterWords[j];
        var sameLine = Math.abs(o.cy - group[0].cy) <= Math.max(group[0].h, o.h) * 0.75 + 5;
        var gLeft = Math.min.apply(null, group.map(function (g) { return g.bbox.x0; }));
        var gRight = Math.max.apply(null, group.map(function (g) { return g.bbox.x1; }));
        var gap = Math.max(xSlack * 1.5, group[0].w * 0.9);
        var nearX = (o.bbox.x0 <= gRight + gap) && (o.bbox.x1 >= gLeft - gap);
        if (sameLine && nearX) {
          group.push(o);
          used[j] = true;
        }
      }
      // Left-to-right so "Z." + "MARKOVIĆ" stays "Z. MARKOVIĆ" even if OCR y-order differs
      group.sort(function (a, b) { return a.bbox.x0 - b.bbox.x0; });
      var text = group.map(function (g) { return g.text; }).join(' ').replace(/\s+/g, ' ').trim();
      text = ocrCleanNameLine(text);
      if (!isLikelyPlayerName(text)) continue;
      var bx0 = Math.min.apply(null, group.map(function (g) { return g.bbox.x0; }));
      var by0 = Math.min.apply(null, group.map(function (g) { return g.bbox.y0; }));
      var bx1 = Math.max.apply(null, group.map(function (g) { return g.bbox.x1; }));
      var by1 = Math.max.apply(null, group.map(function (g) { return g.bbox.y1; }));
      var avgConf = group.reduce(function (s, g) { return s + g.confidence; }, 0) / group.length;
      var heightBonus = (by1 - by0) * 0.4; // taller glyphs ≈ name band
      var widthBonus = (bx1 - bx0) / 15;
      var topBonus = by0 <= minY + cardH * 0.38 ? 25 : (by0 <= minY + cardH * 0.5 ? 10 : 0);
      var score = scorePlayerNameCandidate(text, 0, avgConf / 4) + heightBonus + widthBonus + topBonus;
      clusters.push({
        text: titleCaseName(text),
        bbox: { x0: bx0, y0: by0, x1: bx1, y1: by1 },
        cx: (bx0 + bx1) / 2,
        cy: (by0 + by1) / 2,
        score: score,
        conf: avgConf
      });
    }
    clusters.sort(function (a, b) { return b.score - a.score; });
    var name = clusters[0] || null;
    if (name && name.score >= 12) {
      out.navn = name.text;
      out.fields.push('navn');
      out.confidence++;
    } else {
      return out; // without name, spatial relatives are unreliable
    }

    var nameBox = name.bbox;
    var nameH = Math.max(1, nameBox.y1 - nameBox.y0);
    var nameW = Math.max(1, nameBox.x1 - nameBox.x0);

    // —— Position: short code above name. Prefer MS/CB; avoid false S from "PES"/noise ——
    var AMBIGUOUS_POS = { S: 1, K: 1, ST: 1, CM: 1, AM: 1 };
    var PREFERRED_POS = { MS: 30, CB: 28, SDM: 18, SM: 16, AM: 14, VB: 14, HB: 14, VV: 12, HV: 12, VWB: 12, HWB: 12, GK: 12, K: 4, S: 2, ST: 3 };
    var posCands = [];
    words.forEach(function (w) {
      var rawTok = w.text.replace(/[^A-Za-zÆØÅæøå]/g, '');
      var tok = rawTok.toUpperCase();
      if (!tok || tok.length > 4) return;
      // Never take a letter out of a longer junk fragment (PES → S)
      if (tok.length === 1 && rawTok.length !== 1) return;
      if (/PES|FIFA|EAFC|OVR|POT/i.test(w.text)) return;
      var above = w.bbox.y1 <= nameBox.y0 + ySlack;
      if (!above) return;
      if (w.bbox.y0 < nameBox.y0 - nameH * 2.2 - ySlack) return;
      // MS sits above OVR (left of name) on NO cards — allow left column as well as near name center
      var horizNear = Math.abs(w.cx - name.cx) <= nameW * 0.75 + xSlack;
      var leftColPos = w.cx <= nameBox.x0 + nameW * 0.15 && w.cx >= minX - xSlack;
      if (!horizNear && !leftColPos) return;
      var nc = normalizePosCode(tok);
      if (!nc) return;
      if (!KARRIERE_POSITIONS.some(function (p) { return p.code === nc; })) return;
      var known = POS_OCR_TOKENS.some(function (t) { return t.toUpperCase() === tok; });
      // Require exact token match for ambiguous short codes
      if (AMBIGUOUS_POS[tok] && tok.length <= 2 && w.confidence < 55) return;
      if (tok === 'S' && w.confidence < 70) return; // lone S is almost always noise
      var pref = PREFERRED_POS[tok] || PREFERRED_POS[nc] || 8;
      var score = pref + (known ? 12 : 0) + w.confidence / 8 - Math.abs(w.cx - name.cx) / 10;
      // Strong boost for 2–3 letter unambiguous codes directly above name
      if (tok.length >= 2 && !AMBIGUOUS_POS[tok]) score += 15;
      posCands.push({ code: nc, score: score, word: w, tok: tok });
    });
    posCands.sort(function (a, b) { return b.score - a.score; });
    if (posCands.length) {
      // If best is ambiguous S/ST but an MS/CB candidate exists above name, prefer that
      var best = posCands[0];
      if ((best.code === 'S') && posCands.some(function (c) { return c.code === 'MS'; })) {
        best = posCands.filter(function (c) { return c.code === 'MS'; })[0];
      }
      out.hoved = best.code;
      out.fields.push('pos');
      out.confidence++;
    }

    function numVal(w) {
      var m = String(w.text).match(/^(\d{1,3})(?:\s*[-–—\/]\s*(\d{2}))?$/);
      if (!m) {
        m = String(w.text).match(/^(\d{2})\s*[-–—\/]\s*(\d{2})$/);
      }
      if (!m) return null;
      return { a: parseInt(m[1], 10), b: m[2] != null ? parseInt(m[2], 10) : null, word: w };
    }

    var belowBand = words.filter(function (w) {
      return w.bbox.y0 >= nameBox.y1 - ySlack * 0.5 &&
        w.bbox.y0 <= nameBox.y1 + nameH * 3.8 + ySlack * 2;
    });

    // Numbers on the row just under the name (OVR left, POT center)
    var justBelowNums = [];
    belowBand.forEach(function (w) {
      var nv = numVal(w);
      if (!nv) return;
      if (w.bbox.y0 > nameBox.y1 + nameH * 1.9 + ySlack) return;
      justBelowNums.push(nv);
    });
    justBelowNums.sort(function (a, b) { return a.word.cx - b.word.cx; });

    // —— Rating: OVR left of name (NO FC UI) OR left column under name ——
    // Norwegian card: large "63" sits LEFT of "Z. MARKOVIĆ" on roughly the same band.
    var ratingPick = null;
    var leftOfNameNums = [];
    words.forEach(function (w) {
      var nv = numVal(w);
      if (!nv || nv.b != null) return;
      if (nv.a < 40 || nv.a > 99) return;
      // Same vertical band as name (taller OVR glyphs often extend below name top)
      var sameBand = w.cy >= nameBox.y0 - nameH * 0.85 && w.cy <= nameBox.y1 + nameH * 0.55;
      var leftOf = w.bbox.x1 <= nameBox.x0 + Math.max(24, xSlack * 0.6) && w.cx <= nameBox.x0 + 8;
      if (sameBand && leftOf) leftOfNameNums.push(nv);
    });
    leftOfNameNums.sort(function (a, b) {
      // Prefer larger glyph (OVR is the biggest number on the card)
      return (b.word.h * b.word.w) - (a.word.h * a.word.w);
    });
    if (leftOfNameNums.length) {
      ratingPick = { val: leftOfNameNums[0].a, word: leftOfNameNums[0].word };
    }
    if (!ratingPick) {
      var belowLeft = [];
      for (var ri = 0; ri < justBelowNums.length; ri++) {
        var rn = justBelowNums[ri];
        if (rn.b != null) continue; // range = potential
        if (rn.a < 40 || rn.a > 99) continue;
        // Left edge under name (OVR column). Reject digits sitting under the surname (pot 94).
        var leftEdge = nameBox.x0 + Math.max(36, nameW * 0.1);
        var underLeft = rn.word.cx <= leftEdge && rn.word.bbox.x0 <= nameBox.x0 + xSlack;
        if (!underLeft) continue;
        belowLeft.push(rn);
      }
      belowLeft.sort(function (a, b) {
        return (b.word.h * b.word.w) - (a.word.h * a.word.w);
      });
      if (belowLeft.length) {
        ratingPick = { val: belowLeft[0].a, word: belowLeft[0].word };
      }
    }
    if (ratingPick) {
      out.rating = ratingPick.val;
      out.fields.push('ovr');
      out.confidence++;
    }

    // —— Potential: range under name center (72-94) or two close numbers ——
    var potCands = [];
    justBelowNums.forEach(function (nv) {
      if (ratingPick && nv.word === ratingPick.word) return;
      if (ratingPick && nv.a === ratingPick.val && nv.b == null) return;
      if (ratingPick && nv.word.cx < ratingPick.word.cx - 2) return;
      if (nv.b != null) {
        var lo = Math.min(nv.a, nv.b), hi = Math.max(nv.a, nv.b);
        if (lo < 40 || hi > 99 || lo >= hi) return;
        var span0 = hi - lo;
        if (span0 < 5 || span0 > 55) return;
        var centerBonus0 = -Math.abs(nv.word.cx - name.cx) / 10;
        potCands.push({
          min: lo, max: hi,
          score: 55 + span0 + nv.word.confidence / 5 + centerBonus0,
          word: nv.word
        });
      } else if (nv.a >= 40 && nv.a <= 99) {
        var centerBonus = -Math.abs(nv.word.cx - name.cx) / 12;
        var rightBonus = (ratingPick && nv.word.cx > ratingPick.word.cx) ? 12 : 0;
        potCands.push({
          min: nv.a, max: nv.a,
          score: 18 + nv.word.confidence / 5 + centerBonus + rightBonus,
          word: nv.word
        });
      }
    });
    var digitPool = justBelowNums.filter(function (n) {
      if (n.b != null) return false;
      if (n.a < 40 || n.a > 99) return false;
      if (ratingPick && n.word === ratingPick.word) return false;
      if (ratingPick && n.a === ratingPick.val) return false;
      if (ratingPick && n.word.cx < ratingPick.word.cx - 2) return false;
      return true;
    });
    for (var pi = 0; pi < digitPool.length; pi++) {
      for (var pj = pi + 1; pj < digitPool.length; pj++) {
        var A = digitPool[pi], B = digitPool[pj];
        var dy = Math.abs(A.word.cy - B.word.cy);
        var dx = Math.abs(A.word.cx - B.word.cx);
        if (dy > Math.max(A.word.h, B.word.h) * 0.95 + 8) continue;
        if (dx > nameW * 1.5 + xSlack * 2) continue;
        var lo2 = Math.min(A.a, B.a), hi2 = Math.max(A.a, B.a);
        var span = hi2 - lo2;
        if (span < 5 || span > 55) continue;
        var midX = (A.word.cx + B.word.cx) / 2;
        potCands.push({
          min: lo2, max: hi2,
          score: 48 + span + (A.word.confidence + B.word.confidence) / 10 - Math.abs(midX - name.cx) / 12,
          word: A.word.cx < B.word.cx ? A.word : B.word
        });
      }
    }
    potCands.sort(function (a, b) { return b.score - a.score; });
    var potPick = potCands[0] || null;
    if (potPick) {
      out.potMin = potPick.min;
      out.potMax = potPick.max;
      out.potensial = Math.round((potPick.min + potPick.max) / 2);
      out.fields.push('pot');
      out.confidence += potPick.min !== potPick.max ? 2 : 1;
    }

    // —— Age: prefer number under «Alder»/Age label (NO UI); fallback under OVR column ——
    var ageLabelWords = words.filter(function (w) {
      return /^(alder|age|år)$/i.test(w.text.replace(/[^A-Za-zÆØÅæøå]/g, ''));
    });
    var ageCands = [];
    words.forEach(function (w) {
      var nv = numVal(w);
      if (!nv || nv.b != null) return;
      if (nv.a < 14 || nv.a > 45) return;
      if (nv.a === out.rating) return;
      if (potPick && (nv.a === potPick.min || nv.a === potPick.max)) return;
      var score = w.confidence;
      var labeled = false;
      for (var ai = 0; ai < ageLabelWords.length; ai++) {
        var lab = ageLabelWords[ai];
        var underLab = w.bbox.y0 >= lab.bbox.y0 - 4 &&
          w.cy <= lab.bbox.y1 + Math.max(lab.h, w.h) * 3.5 + ySlack;
        var nearLabX = Math.abs(w.cx - lab.cx) <= Math.max(lab.w, w.w) * 1.8 + xSlack * 1.5;
        if (underLab && nearLabX) {
          labeled = true;
          score += 55 - Math.abs(w.cx - lab.cx) / 8;
          break;
        }
      }
      if (!labeled && ratingPick) {
        if (w.bbox.y0 < ratingPick.word.bbox.y1 - 2) return;
        if (w.bbox.y0 > ratingPick.word.bbox.y1 + ratingPick.word.h * 3.2 + ySlack * 2) return;
        var sameCol = Math.abs(w.cx - ratingPick.word.cx) <= Math.max(ratingPick.word.w, w.w) * 1.35 + xSlack;
        if (!sameCol) return;
        score += 12 - Math.abs(w.cx - ratingPick.word.cx) / 10;
      } else if (!labeled) {
        return;
      }
      ageCands.push({ val: nv.a, score: score, word: w, labeled: labeled });
    });
    ageCands.sort(function (a, b) { return b.score - a.score; });
    if (ageCands.length) {
      out.alder = ageCands[0].val;
      out.fields.push('alder');
      out.confidence++;
    }

    // Height: prefer "193 CM" / "193CM"
    words.forEach(function (w) {
      if (out.hoyde != null) return;
      var hm = String(w.text).match(/^(1[5-9]\d|20\d|210)\s*cm$/i);
      if (hm) {
        out.hoyde = parseInt(hm[1], 10);
        out.fields.push('hoyde');
        out.confidence++;
        return;
      }
      hm = String(w.text).match(/^(1[5-9]\d|20\d|210)$/);
      if (!hm) return;
      var hasCm = words.some(function (o) {
        return /^cm$/i.test(o.text) &&
          Math.abs(o.cy - w.cy) < Math.max(w.h, o.h) * 1.2 + 6 &&
          o.bbox.x0 >= w.bbox.x0 - 4;
      });
      if (!hasCm) return;
      var hy = parseInt(hm[1], 10);
      if (hy >= 150 && hy <= 210) {
        out.hoyde = hy;
        out.fields.push('hoyde');
        out.confidence++;
      }
    });
    return out;
  }

  /** Prefer layout fields when present; fill gaps from text parse. Height from either. */
  function mergeLayoutWithTextParse(layout, textParsed) {
    layout = layout || emptyOcrParse();
    textParsed = textParsed || emptyOcrParse();
    var out = emptyOcrParse();
    out.navn = layout.navn || textParsed.navn || '';
    out.rating = layout.rating != null ? layout.rating : textParsed.rating;
    out.potensial = layout.potensial != null ? layout.potensial : textParsed.potensial;
    out.potMin = layout.potMin != null ? layout.potMin : textParsed.potMin;
    out.potMax = layout.potMax != null ? layout.potMax : textParsed.potMax;
    out.alder = layout.alder != null ? layout.alder : textParsed.alder;
    out.hoyde = layout.hoyde != null ? layout.hoyde : textParsed.hoyde;
    out.hoved = layout.hoved || textParsed.hoved || '';
    if (out.navn) { out.confidence++; out.fields.push('navn'); }
    if (out.rating != null) { out.confidence++; out.fields.push('ovr'); }
    if (out.potensial != null || out.potMin != null) {
      out.confidence += (out.potMin != null && out.potMax != null && out.potMin !== out.potMax) ? 2 : 1;
      out.fields.push('pot');
    }
    if (out.alder != null) { out.confidence++; out.fields.push('alder'); }
    if (out.hoyde != null) { out.confidence++; out.fields.push('hoyde'); }
    if (out.hoved) { out.confidence++; out.fields.push('pos'); }
    out.fromLayout = !!(layout.confidence);
    return out;
  }

  function describeOcrParse(parsed) {
    var bits = [];
    if (parsed.navn) bits.push(parsed.navn);
    if (parsed.rating != null) bits.push('OVR ' + parsed.rating);
    if (parsed.potMin != null && parsed.potMax != null && parsed.potMin !== parsed.potMax) {
      bits.push('POT ' + parsed.potMin + '\u2013' + parsed.potMax);
    } else if (parsed.potensial != null) {
      bits.push('POT ' + parsed.potensial);
    }
    if (parsed.alder != null) bits.push('alder ' + parsed.alder);
    if (parsed.hoyde != null) bits.push(parsed.hoyde + ' cm');
    if (parsed.hoved) bits.push(parsed.hoved);
    return bits;
  }

  function fillTroppFormFromOcr(parsed) {
    if (parsed.navn) document.getElementById('f-navn').value = parsed.navn;
    if (parsed.rating != null) document.getElementById('f-rating').value = parsed.rating;
    if (parsed.potensial != null) document.getElementById('f-pot').value = parsed.potensial;
    if (parsed.alder != null) document.getElementById('f-alder').value = parsed.alder;
    if (parsed.hoyde != null) document.getElementById('f-hoyde').value = parsed.hoyde;
    if (parsed.hoved) {
      var hoved = normalizePosCode(parsed.hoved);
      if (KARRIERE_POSITIONS.some(function (p) { return p.code === hoved; })) {
        var sel = document.getElementById('f-hoved');
        ensurePosOption(sel, hoved);
        sel.value = hoved;
        syncEkstraDisable(document.getElementById('f-ekstra'), hoved);
      }
    }
  }

  function fillAkademiFormFromOcr(parsed) {
    if (parsed.navn) document.getElementById('a-navn').value = parsed.navn;
    if (parsed.rating != null) document.getElementById('a-rating').value = parsed.rating;
    var pMin = parsed.potMin != null ? parsed.potMin : parsed.potensial;
    var pMax = parsed.potMax != null ? parsed.potMax : parsed.potensial;
    if (pMin != null) document.getElementById('a-pot-min').value = pMin;
    if (pMax != null) document.getElementById('a-pot-max').value = pMax;
    if (parsed.alder != null) document.getElementById('a-alder').value = parsed.alder;
    if (parsed.hoyde != null) document.getElementById('a-hoyde').value = parsed.hoyde;
    if (parsed.hoved) {
      var hoved = normalizePosCode(parsed.hoved);
      if (KARRIERE_POSITIONS.some(function (p) { return p.code === hoved; })) {
        var sel = document.getElementById('a-hoved');
        ensurePosOption(sel, hoved);
        sel.value = hoved;
      }
    }
  }

  function mergeOcrParses(a, b) {
    // Prefer higher confidence; fill missing fields from the other
    var primary = (a.confidence >= b.confidence) ? a : b;
    var secondary = (primary === a) ? b : a;
    var out = {
      navn: primary.navn || secondary.navn || '',
      rating: primary.rating != null ? primary.rating : secondary.rating,
      potensial: primary.potensial != null ? primary.potensial : secondary.potensial,
      potMin: primary.potMin != null ? primary.potMin : secondary.potMin,
      potMax: primary.potMax != null ? primary.potMax : secondary.potMax,
      alder: primary.alder != null ? primary.alder : secondary.alder,
      hoyde: primary.hoyde != null ? primary.hoyde : secondary.hoyde,
      hoved: primary.hoved || secondary.hoved || '',
      confidence: 0,
      fields: []
    };
    // Recompute confidence / fields
    if (out.navn) { out.confidence++; out.fields.push('navn'); }
    if (out.rating != null) { out.confidence++; out.fields.push('ovr'); }
    if (out.potensial != null || out.potMin != null) {
      out.confidence += (out.potMin != null && out.potMax != null && out.potMin !== out.potMax) ? 2 : 1;
      out.fields.push('pot');
    }
    if (out.alder != null) { out.confidence++; out.fields.push('alder'); }
    if (out.hoyde != null) { out.confidence++; out.fields.push('hoyde'); }
    if (out.hoved) { out.confidence++; out.fields.push('pos'); }
    return out;
  }

  function runOcrOnFile(target, file, options) {
    options = options || {};
    var aggressive = !!options.aggressive;
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
      setOcrStatus(target, 'Velg et bilde (jpg/png/webp).', 'warn');
      return;
    }

    // Revoke previous object URL
    if (ocrLastByTarget[target] && ocrLastByTarget[target].objectUrl) {
      try { URL.revokeObjectURL(ocrLastByTarget[target].objectUrl); } catch (e) {}
    }

    var previewUrl = URL.createObjectURL(file);
    ocrLastByTarget[target] = { file: file, objectUrl: previewUrl, aggressive: aggressive };
    showOcrPreview(target, previewUrl, true, 'Forbehandler bilde…');
    setOcrPreviewNote(target, '');
    setOcrStatus(target, 'Forbehandler bilde for bedre lesing…', null);
    setOcrRetryVisible(target, false);
    var label = document.getElementById('ocr-fields-label-' + target);
    if (label) label.hidden = false;
    var retryBtn = document.getElementById('ocr-retry-' + target);
    if (retryBtn) retryBtn.disabled = true;

    var processedInfo = null;
    var ocrSource = file;

    preprocessImageForOcr(file, { aggressive: aggressive }).then(function (info) {
      processedInfo = info;
      ocrSource = info.blob; // OCR on soft/aggressive processed image
      // Preview: keep ORIGINAL colour for soft mode (UX). Only show B&W when aggressive retry.
      if (aggressive) {
        var procUrl = URL.createObjectURL(info.blob);
        if (ocrLastByTarget[target].objectUrl) {
          try { URL.revokeObjectURL(ocrLastByTarget[target].objectUrl); } catch (e2) {}
        }
        ocrLastByTarget[target].objectUrl = procUrl;
        ocrLastByTarget[target].processed = info;
        showOcrPreview(target, procUrl, true, 'Leser tekst (0 %)…');
        setOcrPreviewNote(target, formatPreprocessNote(info, 'processed'));
      } else {
        // Keep previewUrl (original colour) already shown; just update note
        ocrLastByTarget[target].processed = info;
        showOcrPreview(target, previewUrl, true, 'Leser tekst (0 %)…');
        setOcrPreviewNote(target, formatPreprocessNote(info, 'color'));
      }
      setOcrStatus(target, 'Leser tekst…', null);
      return loadTesseract();
    }).then(function (Tesseract) {
      var lastPct = -1;
      function onProgress(m) {
        if (!m || m.status !== 'recognizing text') return;
        var pct = Math.round((m.progress || 0) * 100);
        if (pct === lastPct) return;
        lastPct = pct;
        updateOcrSpin(target, 'Leser tekst (' + pct + ' %)…');
        setOcrStatus(target, 'Leser tekst (' + pct + ' %)…', null);
      }

      // Pass 1: PSM 6 (block of text) — good for player cards
      return Tesseract.recognize(ocrSource, 'eng', {
        logger: onProgress,
        tessedit_pageseg_mode: '6'
      }).then(function (r1) {
        var text1 = (r1 && r1.data && r1.data.text) || '';
        var conf1 = r1 && r1.data && typeof r1.data.confidence === 'number' ? r1.data.confidence : 0;
        var words1 = (r1 && r1.data && r1.data.words) || [];
        var parsed1 = parseEaFcOcrText(text1);
        updateOcrSpin(target, 'Andre pass (sparse UI)…');
        setOcrStatus(target, 'Andre pass for UI-tekst…', null);

        // Pass 2: PSM 11 sparse + optional whitelist for numbers/positions
        var wl = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÆØÅæøå -–—:./\'|′″';
        return Tesseract.recognize(ocrSource, 'eng', {
          logger: function () {},
          tessedit_pageseg_mode: '11',
          tessedit_char_whitelist: wl
        }).then(function (r2) {
          var text2 = (r2 && r2.data && r2.data.text) || '';
          var conf2 = r2 && r2.data && typeof r2.data.confidence === 'number' ? r2.data.confidence : 0;
          var words2 = (r2 && r2.data && r2.data.words) || [];
          var parsed2 = parseEaFcOcrText(text2);
          var mergedText = mergeOcrParses(parsed1, parsed2);
          // Also merge raw texts for one more parse (catches split labels)
          var combined = parseEaFcOcrText(text1 + '\n' + text2);
          mergedText = mergeOcrParses(mergedText, combined);
          // Layout parse from word bounding boxes (prefer over text when present)
          var layout = parseEaFcOcrLayout(words1.concat(words2));
          var merged = mergeLayoutWithTextParse(layout, mergedText);
          return {
            parsed: merged,
            conf: Math.max(conf1, conf2),
            text: (text1 + '\n' + text2).trim(),
            pass1Hits: parsed1.confidence,
            pass2Hits: parsed2.confidence,
            layoutHits: layout.confidence || 0
          };
        }, function () {
          // Second pass failed — use first + layout from pass1 words
          var layout1 = parseEaFcOcrLayout(words1);
          var merged1 = mergeLayoutWithTextParse(layout1, parsed1);
          return { parsed: merged1, conf: conf1, text: text1, pass1Hits: parsed1.confidence, pass2Hits: 0, layoutHits: layout1.confidence || 0 };
        });
      });
    }).then(function (result) {
      clearOcrPreviewSpin(target);
      if (retryBtn) retryBtn.disabled = false;
      var parsed = result.parsed;
      var conf = result.conf;
      var weak = parsed.confidence < 2 || (!result.text) || (conf < 30 && parsed.confidence < 3);

      if (target === 'tropp') fillTroppFormFromOcr(parsed);
      else fillAkademiFormFromOcr(parsed);

      var bits = describeOcrParse(parsed);
      setOcrRetryVisible(target, true);

      if (parsed.confidence === 0 || (weak && bits.length === 0)) {
        setOcrStatus(
          target,
          'Fant nesten ingenting — prøv nærmere bilde av spillerkortet / zoom inn på OVR og POT. Bruk «sterkere kontrast» eller et in-game skjermbilde (ikke foto av TV).',
          'warn'
        );
        flashMsg('Kunne ikke lese spillerinfo — prøv beskåret skjermbilde', 'warn');
      } else if (weak) {
        setOcrStatus(
          target,
          'Fant delvis: ' + bits.join(' · ') + '. Sjekk/fyll resten manuelt — eller prøv sterkere kontrast.',
          'warn'
        );
        flashMsg('Usikker lesing — sjekk feltene', 'warn');
      } else {
        setOcrStatus(
          target,
          'Fant: ' + bits.join(' · ') + '. Sjekk før du legger til.',
          'ok'
        );
      }
    }).catch(function (err) {
      clearOcrPreviewSpin(target);
      if (retryBtn) retryBtn.disabled = false;
      setOcrRetryVisible(target, !!(ocrLastByTarget[target] && ocrLastByTarget[target].file));
      var msg = (err && err.message === 'cdn')
        ? 'Kunne ikke laste bilde-lesing (nett trengs første gang)'
        : (err && err.message === 'bilde')
          ? 'Kunne ikke åpne bildet'
          : 'Kunne ikke lese bildet — fyll inn manuelt.';
      setOcrStatus(target, msg, 'warn');
      flashMsg(msg, 'warn');
    });
  }

  function wireImageAdd(target, btnId, inputId) {
    var btn = document.getElementById(btnId);
    var input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.addEventListener('click', function () {
      setAddMode(target, 'image');
      try { input.value = ''; } catch (e) {}
      input.click();
    });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (f) runOcrOnFile(target, f, { aggressive: false });
    });
    var retry = document.getElementById('ocr-retry-' + target);
    if (retry) {
      retry.addEventListener('click', function () {
        var last = ocrLastByTarget[target];
        if (!last || !last.file) {
          setOcrStatus(target, 'Velg et bilde først.', 'warn');
          return;
        }
        runOcrOnFile(target, last.file, { aggressive: true });
      });
    }
  }

  