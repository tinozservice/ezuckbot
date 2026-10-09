# Server Socket

- Terkait: [[hub]] · [[prd-ezuckbot]] · [[llm-dispatcher]] · [[image-dispatcher]] · [[vision-multimodal]] · [[log-progres]]
- File: `server.js`

## Ide Inti
- Satu ide: orkestrasi Socket.IO — routing 4 modalitas + state per-socket.

## Perilaku
- State: `histories`, `lastMsgAt`, `lastImageAt` (Map per `socket.id`, dibersihkan saat `disconnect`).
- Socket: `maxHttpBufferSize` 8 MiB agar payload data-URI lolos.
- Payload `chat message`: string (kompatibel mundur) atau `{ text, image? }`.
- Validasi: tolak kosong, `> MAX_MSG_LEN` (2000), rate-limit `MIN_INTERVAL_MS` (2000).
- Tabel routing: lampiran+intent gambar → img2img; lampiran+teks biasa → vision; tanpa lampiran+intent → txt2img; tanpa lampiran+teks → chat teks.
- `detectImageIntent` dukung `/gambar`, `/edit`, + regex ID/EN; false-positive pertanyaan dikembalikan null.
- Jalur teks: push user → `trimHistory` → emit `bot typing` → `getBotReply` → emit `bot reply`.
- Jalur gambar: catat tag `[minta gambar: ...]` → emit `bot typing(mode:image)` → `generateImage` → catat `[membuat gambar: ...]` → emit `bot image`.
- `checkImageGate`: validasi panjang + rate-limit bucket gambar dipakai bersama ketiga jalur gambar.
- Startup: hanya wajib `PUTER_AUTH_TOKEN`; cetak rantai fallback chat/vision/image (`a -> b`) bila env terisi; info default bila kosong.

## Event
- In: `chat message`. Out: `bot reply`, `bot image`, `bot typing` (mode `image`/`vision`), `chat error`.
