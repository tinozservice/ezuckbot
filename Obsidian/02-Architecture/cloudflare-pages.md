# Cloudflare Pages Assessment

- Terkait: [[hub]] · [[log-progres]] · [[prd-ezuckbot]] · [[server-socket]] · [[frontend-rendering]] · [[puter-client]] · [[config-env]] · [[vercel-hobby]]
- Status: Jawaban atas pertanyaan user 2026-09-16 (WIB) — bukan perubahan kode.

## Ide Inti
- Satu ide: Cloudflare Pages **hanya untuk frontend statis** (`public/`); backend Socket.IO `server.js` **tetap butuh host long-lived** terpisah.

## Temuan
- Pages = hosting statis + Functions (Workers, runtime edge isolate, tanpa `node server.js` long-lived, tanpa WebSocket persisten ala Socket.IO per-socket).
- `server.js` butuh proses Node persisten: `http.createServer` + `socketIo` + `server.listen` + state in-memory (`histories`, `lastMsgAt`, `lastImageAt`) — lihat [[server-socket]]. Tidak bisa jalan di Pages.
- Fungsi edge juga punya batas durasi/CPU jauh di bawah timeout app (90 dtk chat di `lib/llm.js`, 120 dtk gambar di `lib/images.js`) → request gambar/vision hampir pasti terpotong.
- Secret `PUTER_AUTH_TOKEN` (lihat [[puter-client]]) tidak boleh dibundel ke bundle Pages publik; Pages Functions pun tidak menyelesaikan masalah WebSocket.
- Yang BISA di Pages: `public/index.html` + `public/script.js` (lihat [[frontend-rendering]]) — tetapi Socket.IO client butuh URL backend absolut (mis. `io("https://api…")`) + CORS di `server.js` (saat ini belum ada header CORS karena asumsi same-origin).

## TOS (Cloudflare)
- Tidak ada workload terlarang di proyek ini (no mining, spam, malware, konten ilegal) — aman secara konten baik di Pages maupun host backend.
- Free plan ekspektasinya pemakaian wajar; bot publik tanpa auth/rate-limit global berisiko menabrak batas bandwidth/request dan ToS anti-abuse bila disalahgunakan — pasang auth + rate-limit + logging sebelum dibuka ke publik.
- Verifikasi ToS Puter sebelum membuka akses publik: satu `PUTER_AUTH_TOKEN` diproxy untuk semua pengunjung (lihat [[vercel-hobby]]).

## Rekomendasi
- Opsi A (disarankan, tanpa refactor): frontend `public/` tetap bisa di Pages bila mau, backend `server.js` apa adanya ke Render / Railway / Fly.io / VPS; sambungkan via URL Socket.IO absolut + tambah CORS.
- Opsi B (tanpa split): hosting tunggal long-lived (Render/Railway/Fly/VPS) layani backend + statis sekaligus — tanpa perubahan kode.
- Opsi C (full-Cloudflare): refactor besar ke Workers + Durable Objects (pengganti state per-socket) + ganti Socket.IO dengan WebSocket native/SSE — usaha besar, non-goal v1 (lihat [[prd-ezuckbot]]).
- Jangan buka ke publik sebelum: auth minimal, rate-limit global, rotasi/cadangan kuota Puter, dan keputusan tertulis target hosting.
