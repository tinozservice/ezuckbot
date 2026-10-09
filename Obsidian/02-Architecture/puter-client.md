# Puter Client

- Terkait: [[hub]] · [[llm-dispatcher]] · [[image-dispatcher]] · [[vision-multimodal]] · [[config-env]] · [[log-progres]]
- File: `lib/puter-client.js: getPuterClient`

## Ide Inti
- Satu ide: singleton lazy client Puter dari `PUTER_AUTH_TOKEN`, dipakai semua 4 modalitas.

## Perilaku
- Lazy init: `import('@heyputer/puter.js/src/init.cjs')` → `init(token)`, di-cache di `puterClient`.
- Error tegas: token kosong → "PUTER_AUTH_TOKEN belum dikonfigurasi"; paket hilang → "npm install".
- Konsumen: `lib/llm.js:callPuterOnce` (chat), `lib/llm.js:callVisionOnce` (vision), `lib/images.js:callPuterImageOnce` (txt2img + img2img).
- Tidak berubah pada migrasi full-puter (sudah dipakai bersama sejak awal).
- Catatan: SDK tanpa `AbortSignal`, jadi timeout di semua konsumen memakai `Promise.race` (timeout client tidak batalkan job sisi Puter).
