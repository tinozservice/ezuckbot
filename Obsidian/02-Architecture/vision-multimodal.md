# Vision Multimodal

- Terkait: [[hub]] · [[prd-ezuckbot]] · [[server-socket]] · [[llm-dispatcher]] · [[image-dispatcher]] · [[frontend-rendering]] · [[log-progres]]
- File: `server.js` (routing), `lib/llm.js:describeImage`, `lib/images.js:parseInputImage`

## Ide Inti
- Satu ide: routing + validasi multimodal — satu gambar per pesan, data-URI tak pernah masuk history.

## Perilaku
- Alur: file → data-URI (browser `FileReader`) → socket → `parseInputImage` (MIME allowlist, batas bytes, magic-byte) → Puter (`chat` vision / `txt2img input_image`) → URL aman → render.
- Vision Q&A: single-turn (`SYSTEM_PROMPT` + pertanyaan, tanpa history penuh) agar gambar tak membengkakkan konteks; jawaban teks dicatat ke history.
- History hanya menyimpan tag: `[gambar terlampir: <mime>, <KB>KB] <prompt>` dan `[membuat gambar dari gambar: "<prompt>" (model)]`.
- Event: `bot typing {mode:'vision'}` ("Bot sedang melihat gambar..."); respons tetap `bot reply` / `bot image` / `chat error`.
- Live-test 2026-09-16: teks→teks OK, vision OK, teks→gambar OK (model `grok-imagine-image-quality`), img2img request sampai provider (gagal 402 kuota = wiring terbukti).
- Fallback-test 2026-09-16 23:17: model pertama bogus → text lanjut ke `gpt-4o-mini` (OK), vision lanjut ke `gpt-4o-mini` (OK), image lanjut ke `gpt-image-1-mini` (OK, hasil base64). Kuota 402 kini fallbackable di ketiga jalur.
