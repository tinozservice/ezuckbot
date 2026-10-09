# PRD Ezuckbot

- Terkait: [[hub]] · [[log-progres]] · [[server-socket]] · [[vision-multimodal]]
- Status: Aktif — 4 modalitas full puter.js terverifikasi live.

## Tujuan
- Chat realtime ID/EN via Socket.IO dengan balasan LLM singkat berbahasa Indonesia.
- Generate gambar via perintah `/gambar` atau pola bahasa alami ID/EN.
- Vision: tanya jawab atas gambar lampiran (gambar→teks).
- Edit gambar: lampiran + `/edit` untuk transformasi (gambar→gambar).

## Ruang Lingkup
- Chat teks: history per-socket (maks 20 + 1 system), rate-limit 2 dtk, cap 2000 char.
- Gambar: rate-limit 15 dtk, cap prompt 1000 char, ingatan lintas-bot via tag history.
- Provider tunggal: puter.js (`PUTER_AUTH_TOKEN`); tanpa jalur OpenAI.
- Lampiran: JPG/PNG/WEBP/GIF, maks 4 MiB (`VISION_MAX_IMAGE_BYTES`), validasi MIME + magic-byte; data-URI tidak masuk history maupun disk.

## Non-Tujuan
- Tanpa auth user, tanpa persistensi DB.
- Tanpa CSRF token (transport Socket.IO, bukan form mutasi HTTP).
- Non-goal v1: OCR `img2txt` khusus, multi-gambar sekaligus, downscale client, streaming balasan.

## Kriteria Terima
- `npm start` hanya butuh `PUTER_AUTH_TOKEN` → UI di `public/index.html`.
- Chat kosong/panjang/cepat ditolak dengan `chat error` yang ramah.
- Gambar hanya render bila `isSafeImageUrl` lolos (`https:` / `data:image/`).
- Live-test: teks→teks OK, vision OK, teks→gambar OK, gambar→gambar sampai ke provider (402 kuota membuktikan wiring).

## Risiko
- Token Puter kedaluwarsa (401) / kuota habis (402) → lihat [[puter-client]].
- Lihat isu terbuka di [[log-progres]].
