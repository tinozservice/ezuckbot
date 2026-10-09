# Hosting AnymHost Newbie Assessment

- Terkait: [[hub]] · [[log-progres]] · [[prd-ezuckbot]] · [[server-socket]] · [[config-env]] · [[vercel-hobby]] · [[cloudflare-pages]]
- Status: Jawaban atas pertanyaan user 2026-09-16 (WIB) — bukan perubahan kode.

## Ide Inti
- Satu ide: hosting berbayar **bukan kewajiban** — yang wajib adalah proses Node long-lived untuk Socket.IO; paket shared Node (tipe Newbie) hanya layak bila lolos checklist WebSocket + proses persisten.

## Kebutuhan Ezuckbot
- Proses Node persisten: `server.js` (`http.createServer` + `socketIo` + `server.listen`) — lihat [[server-socket]].
- Ringan: Express 5 + Socket.IO 4 + `@heyputer/puter.js`, tanpa DB; RAM ratusan MB cukup, satu proses.
- Wajib: Node 18+, env `PORT` + `PUTER_AUTH_TOKEN` (lihat [[config-env]]), outbound HTTPS ke Puter, upgrade WebSocket lolos proxy.
- Timeout app panjang: 90 dtk chat, 120 dtk gambar — host tidak boleh membunuh request/proses jauh di bawah itu.

## Penilaian Paket Newbie (AnymHost Developer Hosting)
- Spesifikasi paket **belum terverifikasi** (halaman produk gagal diambil penuh saat audit — hanya judul yang terbaca) — jangan asumsikan angka RAM/CPU/disk dari halaman depan.
- Pola umum shared hosting Node (cPanel Application Manager / Passenger): BISA jalan untuk demo pribadi, TETAPI titik gagal klasiknya:
  1. WebSocket di-proxy/block atau fallback long-polling saja → Socket.IO tidak stabil.
  2. Proses di-suspend/kill saat idle atau melampaui batas RAM/CPU paket kecil.
  3. Port harus pakai yang ditetapkan panel (tidak bebas `3000`), dan restart manual via panel tiap deploy/env berubah.
  4. Node version terkunci tua; tanpa SSH sulit debug `npm start`.
  5. Outbound firewall memblokir API eksternal (Puter) — wajib dites.
- Jadi: Newbie plan **bukan jawaban otomatis ya/tidak** — layak untuk bot pribadi/beban kecil HANYA bila 5 checklist di bawah lolos; untuk publik/komersial pilih VPS.

## Checklist Konfirmasi ke Support (sebelum bayar)
1. Apakah WebSocket (upgrade `ws`) didukung penuh di paket Newbie, bukan hanya HTTP?
2. Apakah aplikasi Node boleh jalan persisten 24/7, atau di-kill saat idle? Berapa batas RAM/CPU/proses?
3. Bagaimana binding port (apakah `process.env.PORT` dari panel?) dan cara restart + baca log?
4. Versi Node tersedia (butuh 18+) dan apakah ada SSH + `npm install`?
5. Apakah outbound HTTPS ke API eksternal (Puter) diizinkan? Apakah ada batasan timeout request 30/60 dtk?

## Alternatif Tanpa Bayar
- Render Free / Railway trial / Fly.io allowance: cocok untuk pola long-lived, konsekuensinya cold-start/sleep di tier gratis.
- Oracle Cloud Free Tier / VPS murah: kontrol penuh, terbaik untuk Socket.IO bila nyaman kelola server.
- Lokal + `ngrok.exe` (sudah ada di repo, di-`gitignore`): cukup untuk demo, bukan hosting publik permanen.

## Rekomendasi
- Pribadi + mau simpel: uji Newbie HANYA setelah support jawab Ya untuk 5 checklist; mulai dari bulanan, bukan tahunan.
- Publik/komersial atau butuh stabil: VPS kecil (1 vCPU / 1 GB) lebih aman daripada shared Node sekecil apa pun.
- Jangan buka ke publik sebelum: auth minimal, rate-limit global, kuota Puter terisi (isu 402 terbuka di [[log-progres]]), dan secrets via env panel — bukan file `.env` di repo.
