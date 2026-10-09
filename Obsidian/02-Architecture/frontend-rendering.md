# Frontend Rendering

- Terkait: [[hub]] · [[server-socket]] · [[vision-multimodal]] · [[image-dispatcher]] · [[log-progres]]
- File: `public/script.js`, `public/index.html`

## Ide Inti
- Satu ide: render markdown ringan + lampiran gambar, anti-XSS murni via DOM API.

## Perilaku
- `addInline`: `**/__` tebal, `*/_` miring (kecuali `_` dalam `snake_case`), `` ` `` kode — hanya `createElement` + `textContent`, tanpa `innerHTML`.
- `renderBotMessage`: heading `#–####`, list `-/*/•` dan `1./1)`, quote `>`, `hr`, paragraf + normalisasi baris menempel.
- Lampiran: tombol 📎 + `input[type=file]` (accept JPG/PNG/WEBP/GIF) → cek tipe + ≤4 MiB → `FileReader.readAsDataURL` → validasi `isValidImageDataUri` (ada payload) → preview thumbnail + tombol Batal.
- Preview anti-rusak: `index.html` bungkus thumbnail di kotak `overflow-hidden` + atribut `onerror`; `script.js` `__attachThumbFailed` → `failAttachment` (reset + bubble error), token `attachReadToken` abaikan hasil baca basi saat file diganti/dibatalkan.
- `sendMessage`: tanpa lampiran kirim string (kompatibel lama); bergambar kirim `{text, image}` lalu `clearAttachment`.
- Bubble user: thumbnail milik sendiri (data-URI, via `createElement('img')`) + teks; `addMessage(text, who, {imageDataUri})`.
- `bot typing` dukung `mode:'vision'`; `setBusy` juga menonaktifkan tombol lampir.
- `addImageMessage`: `<a target=_blank rel=noopener>` + `<img loading=lazy class=bot-image>` + caption `textContent`.
- `isSafeImageUrl` ganda dengan backend: tolak non-`https:`/`data:image/` sebelum render; URL tak valid → bubble `error`.
- Socket: `chat message` keluar; `bot reply` / `bot image` / `chat error` / `connect_error` atur `typing.hidden` + `setBusy`.
