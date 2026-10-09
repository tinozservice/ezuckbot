# ezuckbot

Chatbot realtime berbasis **Node.js + Socket.IO** dengan **full puter.js** — empat modalitas dalam satu bot: chat teks, generate gambar, vision (gambar→teks), dan edit gambar (gambar→gambar).

**Status:** Aktif — chat teks, vision, dan txt2img sudah terverifikasi live; img2img sudah ter-wiring (uji end-to-end menunggu isi ulang kuota Puter).

## Fitur

| Modalitas | Cara pakai | Batas |
| --- | --- | --- |
| 💬 Chat teks | Ketik pesan biasa | 2000 karakter, jeda 2 dtk/pesan, history 20 pesan |
| 🎨 Generate gambar | `/gambar <prompt>` atau pola bahasa alami ID/EN | prompt 1000 karakter, jeda 15 dtk/gambar |
| 👁️ Vision (gambar→teks) | Lampirkan gambar lalu tanya | gambar maks 4 MiB (JPG/PNG/WEBP/GIF) |
| 🖌️ Edit gambar (gambar→gambar) | Lampirkan gambar + `/edit <instruksi>` | sama seperti vision |

- **Fallback multi-model**: kena kuota 402 / rate-limit 429 / timeout / model tak dikenal → otomatis pindah ke model berikutnya (daftar via env).
- **Anti-XSS**: seluruh render di frontend memakai `createElement`/`textContent`, tanpa `innerHTML`.
- **Validasi input**: MIME allowlist + magic-byte; URL gambar hanya `https:` atau `data:image/`; data-URI tidak disimpan ke disk/history.

## Stack

- Node.js 18+ (diuji di Node 24)
- Express 5 · Socket.IO 4
- `@heyputer/puter.js` 2.6.3 — satu-satunya provider AI (chat, txt2img, vision)
- Frontend statis: HTML + Tailwind (CDN) + vanilla JS

## Instalasi

```bash
npm install
```

Salin template env lalu isi `PUTER_AUTH_TOKEN` (ambil dari login Puter, `getAuthToken`):

```bash
copy .env.example .env      # Windows CMD
Copy-Item .env.example .env # Windows PowerShell
cp .env.example .env        # macOS/Linux
```

Jalankan:

```bash
npm start
```

Buka http://localhost:3000.

## Konfigurasi (.env)

| Variabel | Default (kode) | Keterangan |
| --- | --- | --- |
| `PORT` | `3000` | Port HTTP server |
| `PUTER_AUTH_TOKEN` | — (wajib) | Token auth puter.js |
| `LLM_MODEL` | `gpt-5-nano` | Model chat teks; daftar fallback dipisah koma/baris |
| `VISION_MODEL` | `gpt-4o-mini` | Model vision (harus vision-capable); daftar fallback |
| `LLM_TIMEOUT_MS` | `90000` | Timeout chat/vision per percobaan |
| `SYSTEM_PROMPT` | asisten singkat Bahasa Indonesia | Prompt sistem bot |
| `IMAGE_MODEL` | `gpt-image-1-mini` | Model gambar (txt2img + img2img); daftar fallback |
| `IMAGE_TIMEOUT_MS` | `120000` | Timeout generate gambar |
| `VISION_MAX_IMAGE_BYTES` | `4194304` (4 MiB) | Batas ukuran gambar lampiran |

## Cara Pakai

1. **Chat** — `halo, jelaskan apa itu WebSocket`
2. **Generate gambar** — `/gambar kucing astronot makan bakso` atau `buatkan logo kafe minimalis`
3. **Vision** — klik 📎, pilih gambar, lalu tanya `isi gambar ini apa?`
4. **Edit gambar** — lampirkan gambar + `/edit ubah jadi gaya anime`

## Struktur Proyek

```
ezuckbot/
├─ server.js              # Express + Socket.IO: routing 4 modalitas, rate-limit, history
├─ lib/
│  ├─ puter-client.js     # Singleton client Puter dari PUTER_AUTH_TOKEN
│  ├─ llm.js              # Chat teks + vision + fallback antar-model
│  └─ images.js           # txt2img/img2img + validasi gambar + prompt enrichment
├─ public/                # Frontend statis (index.html, script.js, styles.css)
├─ Obsidian/              # Vault dokumentasi: hub, PRD, arsitektur, log progres
├─ .env.example           # Template konfigurasi (tanpa kredensial)
└─ INSTRUCTIONS.md        # Aturan kerja agent AI di repo ini
```

## Keamanan & Batasan

- `.env` **tidak** ikut ter-commit (lihat `.gitignore`); jangan pernah menulis token di kode.
- Tanpa autentikasi user & tanpa database (non-goal v1); state hilang saat server restart.
- Rate-limit masih per-koneksi socket, belum global.
- Backend butuh host Node.js **long-lived** (Socket.IO + state in-memory); serverless seperti Vercel Hobby / Cloudflare Pages tidak cocok untuk backend — hanya untuk frontend statis. Catatan audit ada di `Obsidian/02-Architecture/`.
- Timeout di sisi client tidak membatalkan job di sisi server Puter.
- Satu gambar per pesan; foto > 4 MiB ditolak (downscale otomatis non-goal v1).

## Dokumentasi

Detail arsitektur, keputusan teknis, dan riwayat progres ada di vault Obsidian — mulai dari `Obsidian/00-Hub/hub.md`.
