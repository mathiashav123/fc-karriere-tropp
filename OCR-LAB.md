# OCR lab notes (Marković TV photo)

## Crop that worked
- Full photo 3024×4032 → info overlay crop `2400×1100+300+2100` → `screenshots/markovic.jpg`
- Tight name-only crops lost Alder/height; full-frame OCR drowned in bezel/wood/moiré

## Preprocess
- **Best for this TV shot:** raw **color** on the overlay crop (Tesseract reads `Z.MARKOVIC`, `193 CM/84 KG`, `alder`, hex labels)
- Soft grayscale made name/height worse (moiré)
- White-luminance + blur reconnect (aggressive retry) can surface `MS` intermittently; age `17` (orange) and OVR `63` (busy jersey behind) stay unreliable

## Fasit vs Tesseract 5.5 on real crop
| Field | Fasit | Real OCR |
|-------|-------|----------|
| Name | Z. MARKOVIĆ | ✓ (as MARKOVIC) |
| Height | 193 | ✓ |
| OVR | 63 | ✗ (moiré / jersey pattern) |
| Pot | 72–94 | partial (`2`+`94` / `-94`) |
| Age | 17 | ✗ (orange; often `9`) |
| Pos | MS | intermittent |

**Recommendation:** manual entry for OVR/age/pot/pos on TV photos; OCR still fills name + height when the card is cropped. Parser accepts Norwegian layout (OVR left of name, Alder label, TMP/SKU/FOR/FYS ignored) when words are correct — see `test-markovic-fasit.js`.

Storage key remains `fc-karriere-tropp-v1`. Never touch familie-budsjett.
