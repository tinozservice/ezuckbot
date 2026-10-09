# Image Dispatcher

- Terkait: [[hub]] · [[server-socket]] · [[vision-multimodal]] · [[puter-client]] · [[frontend-rendering]] · [[log-progres]]
- File: `lib/images.js: generateImage`, `buildEffectivePrompt`, `parseInputImage`, `isSafeImageUrl`

## Ide Inti
- Satu ide: generate gambar puter-only dengan fallback multi-model yang hemat kuota.

## Perilaku
- Tanpa jalur OpenAI: tidak ada `POST /images/generations`, `IMAGE_SIZE`, `IMAGE_BASE_URL`.
- `generateImage(prompt, history, {inputImage})`: tanpa input → teks→gambar; dengan input → gambar→gambar via `puter.ai.txt2img({prompt, model, input_image})`.
- `parseInputImage`: terima data-URI JPG/PNG/WEBP/GIF atau URL `https:`; tolak MIME asing, decode > `VISION_MAX_IMAGE_BYTES`, magic-byte mismatch (JPEG/PNG/WEBP/GIF).
- `buildEffectivePrompt`: pola tag diperluas (`membuat/minta gambar dari gambar`, `[gambar terlampir]`, kata `edit/upload/terlampir`).
- Kebijakan gagal: auth 401 / filter konten = permanen (stop, tanpa fallback); kuota 402 / 429 / timeout / network-5xx / model tak dikenal = fallback model berikut + maks 1 retry (`isPuterImagePermanent`).
- Output `isSafeImageUrl` hanya loloskan `https:` / `data:image/` — dikonsumsi juga oleh [[frontend-rendering]].

## Konfig
- `IMAGE_MODEL` (koma, berurutan; dipakai txt2img DAN img2img; default `gpt-image-1-mini`), `IMAGE_TIMEOUT_MS`, `VISION_MAX_IMAGE_BYTES`.
