# FC Karriere-tropp

Norsk EA FC karriere-tropp / akademi-planner for Mathias.

- Åpne: https://mathiashav123.github.io/fc-karriere-tropp/
- Lokal fil: `fc-karriere-tropp.html` (fungerer offline; sky-synk krever https)
- **Sky:** bruk eget brukernavn (f.eks. `mathias-fc`) — ikke samme som familiebudsjett-appen
- Budsjett-appen er separat og skal ikke endres herfra

localStorage-nøkkel: `fc-karriere-tropp-v1`

## OCR
See [OCR-LAB.md](OCR-LAB.md). Manual entry is recommended for TV photos; soft OCR keeps colour preview.

## Backup / Lagre fil
- Always saves as **`fc-tropp-backup.json`** (fixed name — overwrite the same file).
- Uses File System Access when the browser supports it; otherwise a normal download with that basename.
- Chrome may still add ` (1)` if you decline Replace — still never timestamped names.
- App HTML offline copy: keep one **`fc-karriere-tropp.html`** (overwrite, no dated copies).
