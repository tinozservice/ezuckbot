# Config Env

- Terkait: [[hub]] · [[llm-dispatcher]] · [[image-dispatcher]] · [[vision-multimodal]] · [[puter-client]] · [[log-progres]]
- File: `.env`, `.env.example`, `package.json`, `server.js` (loader .env)

## Ide Inti
- Satu ide: konfigurasi puter-only tanpa dependency — loader `.env` minimal + secrets tidak di-hardcode.

## Perilaku
- Loader `server.js`: buang BOM, dukung `export KEY=val`, lepas kutip pembungkus, tidak menimpa env bawaan; hitung variabel termuat di log `[INFO]`.
- Kunci aktif: `PORT`, `PUTER_AUTH_TOKEN`, `LLM_MODEL` (daftar koma), `VISION_MODEL` (daftar koma), `LLM_TIMEOUT_MS`, `SYSTEM_PROMPT`, `IMAGE_MODEL` (daftar koma), `IMAGE_TIMEOUT_MS`, `VISION_MAX_IMAGE_BYTES`.
- Fallback: ketiga daftar model dicoba berurutan; 402/429/timeout lanjut, 401/filter stop.
- Dihapus: `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, `IMAGE_PROVIDER`, `IMAGE_BASE_URL`, `IMAGE_SIZE`.
- Dependensi (`package.json`): `express`, `socket.io`, `@heyputer/puter.js` (tanpa dependensi baru); start via `npm start` → `node server.js`.
- Warning start: hanya bila `PUTER_AUTH_TOKEN` kosong; info default bila `IMAGE_MODEL`/`VISION_MODEL` kosong.
