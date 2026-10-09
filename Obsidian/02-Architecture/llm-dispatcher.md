# LLM Dispatcher

- Terkait: [[hub]] · [[server-socket]] · [[vision-multimodal]] · [[puter-client]] · [[config-env]] · [[log-progres]]
- File: `lib/llm.js: getBotReply`, `describeImage`, `callPuterOnce`, `callVisionOnce`

## Ide Inti
- Satu ide: chat puter-only dengan fallback model berurutan — teks→teks dan gambar→teks lewat satu client.

## Perilaku
- Tanpa jalur OpenAI: tidak ada fetch, SSE-parse, `LLM_API_KEY`, maupun `LLM_PROVIDER`.
- `getBotReply(messages)`: loop daftar `LLM_MODEL` (dedupe, koma/baris); tiap model retry 2x untuk timeout/429/5xx; gagal → model berikut.
- `describeImage(prompt, imageRef)`: loop daftar `VISION_MODEL` dengan pola sama; overload vision `puter.ai.chat(prompt, imageRef, {model})`.
- Fallbackable: kuota 402, 429, timeout, network/5xx, model tak dikenal → lanjut. Fatal (stop): auth 401, paket hilang, filter konten/refusal (`isChatFallbackable`).
- `callPuterOnce`/`callVisionOnce` menerima model sebagai parameter; `getPuterModel`/`getVisionModel` dipertahankan sebagai kompatibel mundur (model pertama).
- `extractPuterText` dipakai ulang untuk kedua jalur; `mapPuterError` (402 kini non-permanent agar bisa fallback).

## Konfig
- `LLM_MODEL` (daftar koma; default `gpt-5-nano`; env lokal `gpt-4o-mini -> gpt-5-nano`), `VISION_MODEL` (daftar koma; default `gpt-4o-mini`; env lokal `deepseek-v4-flash-vision-exp -> gpt-4o-mini`), `LLM_TIMEOUT_MS`, `PUTER_AUTH_TOKEN`.
