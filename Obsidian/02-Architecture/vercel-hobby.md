# Vercel Hobby Assessment

- Terkait: [[hub]] · [[log-progres]] · [[prd-ezuckbot]] · [[server-socket]] · [[puter-client]] · [[config-env]]
- Status: Jawaban atas pertanyaan user 2026-09-16 (WIB) — bukan perubahan kode.

## Ide Inti
- Satu ide: ezuckbot **boleh secara TOS** di Vercel Hobby untuk pemakaian pribadi, tetapi **tidak cocok secara teknis** karena arsitektur Socket.IO stateful + timeout panjang.

## Temuan
- `server.js` = server Node long-lived (`http.createServer` + `socketIo` + `server.listen`) dengan state in-memory (`histories`, `lastMsgAt`, `lastImageAt` per-socket).
- Vercel Hobby = serverless function short-lived tanpa koneksi WebSocket persisten/sticky-session; Socket.IO (WebSocket + long-polling fallback) tidak andal di atasnya.
- Timeout app > batas fungsi Hobby: `LLM_TIMEOUT_MS=90000` (`lib/llm.js`), `IMAGE_TIMEOUT_MS=120000` (`lib/images.js`); request gambar hampir pasti dibunuh platform sebelum selesai, dan timeout client (`Promise.race`) tidak membatalkan job di sisi Puter → kuota terbakar tanpa hasil.
- State in-memory tidak terbagi antar instance serverless (history/rate-limit per-socket rusak saat scale-out atau cold-start).
- Payload `maxHttpBufferSize` 8 MiB + lampiran maks 4 MiB (`VISION_MAX_IMAGE_BYTES`, lihat [[vision-multimodal]]) berisiko menabrak limit body serverless; bandwidth data-URI gambar menggerus kuota Hobby dengan cepat.
- Token tunggal `PUTER_AUTH_TOKEN` (lihat [[puter-client]] + [[config-env]]) diproxy untuk semua pengunjung → semua pemakaian membebani satu akun/kuota; verifikasi ToS Puter sebelum membuka akses publik (token login personal ≠ server-side key).
- `.gitignore` sudah mengecualikan `.env`, `ngrok.exe`, `ngrok.zip` — aman untuk push; secrets wajib diisi via Environment Variables dashboard Vercel, bukan file.

## TOS (Vercel)
- Tidak ada workload terlarang di proyek ini (no mining, spam, malware, konten ilegal).
- Hobby plan ekspektasinya proyek pribadi/non-komersial; bot untuk klien/komersial publik → gunakan Pro atau host lain. Cek Terms + Fair Use terbaru sebelum deploy komersial.
- Risiko kepatuhan nyata ada di sisi **penyalahgunaan terbuka**: tanpa auth/rate-limit global, orang bisa memakai kuota Puter pemilik dan memicu filter konten — pasang auth + rate-limit + logging sebelum dibuka ke publik.

## Rekomendasi
- Opsi A (disarankan, tanpa refactor): deploy backend Socket.IO apa adanya ke Render / Railway / Fly.io / VPS; Vercel hanya bila perlu untuk frontend statis (split hosting).
- Opsi B (tetap Vercel): refactor besar — ganti Socket.IO dengan HTTP route (`POST /api/chat`, `/api/image`), state ke KV/Upstash, pangkas timeout di bawah limit fungsi; estimasi usaha besar, non-goal v1 (lihat [[prd-ezuckbot]]).
- Jangan deploy publik sebelum: auth minimal, rate-limit global, rotasi/cadangan kuota Puter, dan keputusan tertulis target hosting.
