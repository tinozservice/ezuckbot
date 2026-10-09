# Hub Ezuckbot

- **Proyek:** ezuckbot — chatbot realtime Node.js + Socket.IO, full puter.js 4 modalitas.
- **Stack:** Express 5, Socket.IO 4, `@heyputer/puter.js` (satu-satunya provider model).
- **Remote Git (tujuan):** https://github.com/tinozservice/ezuckbot.git — lihat [[log-progres]].
- **Zona waktu:** Asia/Jakarta (WIB).

## Navigasi
- PRD: [[prd-ezuckbot]]
- Arsitektur:
  - [[server-socket]]
  - [[llm-dispatcher]]
  - [[image-dispatcher]]
  - [[vision-multimodal]]
  - [[puter-client]]
  - [[frontend-rendering]]
  - [[config-env]]
  - [[vercel-hobby]] (audit deploy Vercel Hobby)
  - [[cloudflare-pages]] (audit deploy Cloudflare Pages)
  - [[hosting-anymhost-newbie]] (audit paket AnymHost Newbie)
- Log: [[log-progres]]

## Peta Kode
- `server.js` → [[server-socket]] + [[vision-multimodal]]
- `lib/llm.js` → [[llm-dispatcher]] (teks + vision)
- `lib/images.js` → [[image-dispatcher]] (txt2img + img2img + validasi input)
- `lib/puter-client.js` → [[puter-client]]
- `public/script.js` + `public/index.html` → [[frontend-rendering]]
- `.env` + `package.json` → [[config-env]]
- `README.md` → ringkasan publik repo (fitur, instalasi, env, batasan)
