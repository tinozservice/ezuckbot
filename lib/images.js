/**
 * Generate gambar full puter.js (puter-only):
 * teks->gambar via puter.ai.txt2img(prompt), dan
 * gambar->gambar via puter.ai.txt2img({ prompt, input_image }).
 */

const IMAGE_TIMEOUT_MS = parseInt(process.env.IMAGE_TIMEOUT_MS || '120000', 10) || 120000;
const MAX_RETRIES = 1; // total percobaan = 1 + 1 retry (generate gambar mahal, jangan agresif)
const RETRY_DELAY_MS = 3000;
const MAX_INPUT_IMAGE_BYTES = parseInt(process.env.VISION_MAX_IMAGE_BYTES || '4194304', 10) || 4194304; // 4 MiB

function getImageConfig() {
    return {
        // Multi-model fallback: "model-a, model-b, model-c" (koma) atau dipisah baris.
        // Isi NAMA MODEL, bukan nama provider (contoh salah: "gemini", "together", "xai").
        models: (process.env.IMAGE_MODEL || '')
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean),
    };
}

const { getPuterClient } = require('./puter-client');

/** Batas panjang prompt gambar (diselaraskan dengan MAX_IMG_PROMPT_LEN di server.js). */
const MAX_PROMPT_LEN = 1000;

/** MIME gambar yang diizinkan sebagai input edit (img2img / vision). */
const ALLOWED_INPUT_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Bangun prompt efektif dengan konteks percakapan (ingatan ringan, tanpa LLM call).
 * - Prompt "mandiri" (>=12 char dan tanpa kata rujukan) -> dikembalikan apa adanya.
 * - Prompt rujukan ("gambar itu", "versi malam", "ganti backgroundnya") -> diperkaya
 *   dengan hingga 2 gambar terakhir + 2 topik user terakhir dari history.
 * - Tanpa entri gambar di history -> dikembalikan apa adanya (tidak mengarang).
 * @param {string} prompt
 * @param {Array<{role: string, content: string}>} history
 * @returns {string}
 */
function buildEffectivePrompt(prompt, history) {
    const p = String(prompt || '').trim();
    if (!Array.isArray(history) || !history.length) return p;

    const looksReferential = /^(itu|itu\s+tadi|tadi|tersebut|yang\s+(tadi|sama|itu|tersebut)|versi|versi\s+\w+|lagi|ganti|ubah|jadikan|buatkan?\s+yang\s+sama|dengan\s+gaya\s+yang\s+sama|edit|it|that|the\s+(same|previous|last)|previous|same|version|again|change|make\s+it|edit)\b/i.test(p)
        || /\b(itu|tadi|tersebut|yang\s+tadi|gaya\s+yang\s+sama|backgroundnya|latarnya|versi\s+\w+|terlampir|upload)\b/i.test(p);
    if (!looksReferential && p.length >= 12) return p; // jalur cepat: prompt mandiri

    const imgTags = [];
    const userTopics = [];
    for (let i = history.length - 1; i >= 0 && (imgTags.length < 2 || userTopics.length < 2); i--) {
        const m = history[i];
        if (!m || typeof m.content !== 'string') continue;
        const made = m.content.match(/\[membuat gambar(?: dari gambar)?:\s*"([^"]+)"\]/);
        const asked = m.content.match(/\[minta gambar(?: dari gambar)?:\s*([^\]]+)\]/);
        const attached = m.content.match(/\[gambar terlampir:[^\]]+\]/);
        if (m.role === 'assistant' && made && imgTags.length < 2) {
            imgTags.unshift(made[1].trim());
        } else if (m.role === 'user' && asked && imgTags.length < 2) {
            imgTags.unshift(asked[1].trim());
        } else if (m.role === 'user' && attached && imgTags.length < 2) {
            imgTags.unshift(attached[0].slice(0, 80));
        } else if (m.role === 'user' && !m.content.startsWith('[') && userTopics.length < 2) {
            const t = m.content.trim();
            // Hanya topik "berisi" (>=8 char) agar sapaan seperti "halo" tidak mencemari konteks.
            if (t && t.length >= 8 && !/^(halo|hallo|hai|hi|hello|pagi|siang|sore|malam|oke|ok|ya|tidak|makasih|terima kasih)[.!,\s]*$/i.test(t)) {
                userTopics.unshift(t.slice(0, 120));
            }
        }
    }
    if (!imgTags.length && !userTopics.length) return p; // tidak ada konteks -> apa adanya

    const ctx = [...imgTags, ...userTopics].join('; ');
    const room = MAX_PROMPT_LEN - p.length - ' (konteks: )'.length;
    if (room <= 10) return p;
    return `${p} (konteks: ${ctx.slice(0, room)})`;
}

/** Model default puter bila IMAGE_MODEL kosong. */
const PUTER_DEFAULT_IMAGE_MODEL = 'gpt-image-1-mini';

/**
 * Validasi URL gambar agar aman dirender: hanya https: atau data:image/.
 * @returns {boolean}
 */
function isSafeImageUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    if (url.startsWith('data:image/')) return true;
    try {
        const u = new URL(url);
        return u.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Cek magic-byte gambar dari buffer: jpeg/png/webp/gif.
 * @param {Buffer} buf
 * @param {string} mime
 * @returns {boolean}
 */
function matchesMagicBytes(buf, mime) {
    if (!buf || buf.length < 12) return false;
    if (mime === 'image/jpeg') return buf[0] === 0xFF && buf[1] === 0xD8;
    if (mime === 'image/png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    if (mime === 'image/gif') return buf.toString('ascii', 0, 4) === 'GIF8';
    if (mime === 'image/webp') return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
    return false;
}

/**
 * Validasi + normalisasi gambar input untuk img2img/vision.
 * Terima data-URI (data:image/jpeg|png|webp|gif;base64,...) atau URL https:.
 * Menolak MIME di luar allowlist, ukuran decode > batas, dan magic-byte mismatch.
 * @param {string} ref
 * @returns {{ dataUri: string, mime: string, bytes: number }}
 */
function parseInputImage(ref) {
    const s = String(ref || '').trim();
    if (!s) throw new Error('Gambar kosong.');
    if (/^https:\/\//i.test(s)) {
        if (s.length > 2048) throw new Error('URL gambar terlalu panjang.');
        if (!isSafeImageUrl(s)) throw new Error('URL gambar harus https:.');
        return { dataUri: s, mime: 'image/remote', bytes: 0 };
    }
    const m = s.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new Error('Format gambar tidak didukung. Kirim JPG, PNG, WEBP, atau GIF.');
    const mime = m[1].toLowerCase();
    if (!ALLOWED_INPUT_MIME.has(mime)) throw new Error('Format gambar tidak didukung. Kirim JPG, PNG, WEBP, atau GIF.');
    let buf;
    try {
        buf = Buffer.from(m[2], 'base64');
    } catch {
        throw new Error('Data gambar rusak (base64 tidak valid).');
    }
    if (!buf.length) throw new Error('Data gambar kosong.');
    if (buf.length > MAX_INPUT_IMAGE_BYTES) {
        throw new Error(`Gambar terlalu besar (${(buf.length / 1048576).toFixed(1)} MB, maks ${(MAX_INPUT_IMAGE_BYTES / 1048576).toFixed(0)} MB).`);
    }
    if (!matchesMagicBytes(buf, mime)) throw new Error('Isi berkas bukan gambar yang valid.');
    return { dataUri: `data:${mime};base64,${buf.toString('base64')}`, mime, bytes: buf.length };
}

/**
 * Generate satu gambar dari prompt (puter-only).
 * Tanpa inputImage -> teks->gambar; dengan inputImage -> gambar->gambar
 * (diteruskan sebagai input_image ke puter.ai.txt2img).
 * Mencoba daftar IMAGE_MODEL berurutan sampai satu berhasil (fallback):
 * kuota 402 / rate-limit 429 / timeout / model tak dikenal lanjut ke model
 * berikut; auth 401 / filter konten langsung berhenti.
 * @param {string} prompt
 * @param {Array<{role: string, content: string}>} [history] - riwayat chat untuk pengayaan konteks
 * @param {{ inputImage?: string }} [opts] - data-URI/URL tervalidasi untuk img2img
 * @returns {Promise<{ imageUrl: string, revisedPrompt?: string, model: string }>}
 */
async function generateImage(prompt, history = [], opts = {}) {
    const effective = buildEffectivePrompt(prompt, history);
    if (effective !== String(prompt || '').trim()) {
        console.log(`[IMG INFO] prompt efektif: ${effective.slice(0, 200)}`);
    }
    const { models } = getImageConfig();
    const inputImage = opts && opts.inputImage ? String(opts.inputImage) : null;

    const list = models.length ? models : [PUTER_DEFAULT_IMAGE_MODEL];
    let lastErr;
    for (const model of list) {
        try {
            const imageUrl = await callPuterImageWithRetry(effective, model, inputImage);
            if (model !== list[0]) console.log(`[IMG INFO] Fallback berhasil dengan model: ${model}`);
            return { imageUrl, model };
        } catch (err) {
            lastErr = err;
            if (err.permanent) throw err; // auth/kuota/filter -> stop, jangan buang kuota
            if (model !== list[list.length - 1]) {
                console.warn(`[IMG WARN] Model ${model} gagal (${err.message}), fallback ke model berikutnya...`);
            }
        }
    }
    throw lastErr;
}

/**
 * Error Puter yang permanen (jangan retry/fallback): auth, paket hilang,
 * filter konten/refusal. Kuota 402, rate-limit 429, timeout, network/5xx,
 * dan model tak dikenal BOLEH fallback ke model berikutnya.
 */
function isPuterImagePermanent(msg) {
    return /PUTER_AUTH_TOKEN|belum terinstall|expired|invalid.*token|unauthorized|401|moderation_flagged|content[-_ ]?filter|content[-_ ]?policy|refused/i.test(msg || '');
}

/**
 * Ambil URL gambar dari hasil puter.ai.txt2img().
 * Bentuk return SDK bervariasi: string URL, atau objek dengan .src / .url / .image_url.
 * @returns {string|null}
 */
function extractPuterImageUrl(result) {
    if (typeof result === 'string' && result.trim()) return result.trim();
    if (result && typeof result === 'object') {
        const candidates = [
            result.src,
            result.url,
            result.image_url,
            result.imageUrl,
            result.data,
            result.image && result.image.src,
            result.image && result.image.url,
        ];
        for (const c of candidates) {
            if (typeof c === 'string' && c.trim()) return c.trim();
            if (c && typeof c === 'object' && typeof c.url === 'string' && c.url.trim()) return c.url.trim();
        }
    }
    return null;
}

/**
 * Petakan error mentah Puter txt2img ke pesan konsisten + flag permanent.
 * Selalu throw.
 */
function mapPuterImageError(err) {
    const body = (err && (err.error || err)) || {};
    const msg = String((body && body.message) || (err && err.message) || 'Unknown Puter error');
    const code = String((body && (body.code || body.errorCode || body.status)) || (err && (err.code || err.errorCode || err.status)) || '');
    const blob = `${code} ${msg}`;

    const permanent = (text) => {
        const e = new Error(text);
        e.permanent = true;
        throw e;
    };

    if (/PUTER_AUTH_TOKEN|belum terinstall/i.test(msg)) permanent(msg);
    if (/expired|invalid.*token|unauthorized|401/i.test(blob)) {
        permanent('PUTER_AUTH_TOKEN tidak valid/kedaluwarsa (401). Login ulang di Puter lalu perbarui .env.');
    }
    if (/insufficient_funds|402/i.test(blob)) {
        // Kuota habis (402) BUKAN fatal: coba model berikutnya (beda model =
        // beda kuota/provider). Hanya bila semua model gagal, error ini yang dilaporkan.
        throw new Error('Kuota Puter tidak cukup (402). Cek saldo/kuota akun Puter.');
    }
    if (/moderation_flagged|content[-_ ]?filter|content[-_ ]?policy|refused/i.test(blob)) {
        permanent(`Permintaan gambar ditolak filter konten Puter: ${msg.slice(0, 200)}`);
    }
    if (/429|rate[-_ ]?limit|quota/i.test(blob)) {
        throw new Error(`Rate limit Puter tercapai (429): ${msg.slice(0, 200)}`);
    }
    if (/model.*not.*found|unknown.*model|invalid.*model/i.test(blob)) {
        throw new Error(`Model gambar Puter tidak dikenal: ${msg.slice(0, 200)}`);
    }
    if (/upstream_failed|5\d\d|timeout|ECONN|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(blob)) {
        throw new Error(`Puter txt2img gagal sementara: ${msg.slice(0, 200)}`);
    }
    throw new Error(`Puter txt2img error: ${msg.slice(0, 300)}`);
}

async function callPuterImageOnce(prompt, model, inputImage) {
    let puter;
    try {
        puter = await getPuterClient();
    } catch (err) {
        if (/PUTER_AUTH_TOKEN belum/i.test(err.message)) {
            err.message += ' (puter.js txt2img)';
        }
        throw err;
    }

    let result;
    try {
        // Tanpa inputImage -> teks->gambar; dengan inputImage -> gambar->gambar.
        const call = inputImage
            ? puter.ai.txt2img({ prompt, model, input_image: inputImage })
            : puter.ai.txt2img(prompt, { model });
        // SDK tidak mendukung AbortSignal -> timeout via Promise.race.
        // Catatan: timeout client tidak membatalkan job di sisi Puter.
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error(`Generate gambar timeout (>${Math.round(IMAGE_TIMEOUT_MS / 1000)} detik), coba lagi.`));
            }, IMAGE_TIMEOUT_MS);
        });
        try {
            result = await Promise.race([call, timeout]);
        } finally {
            clearTimeout(timer);
        }
    } catch (err) {
        if (/Generate gambar timeout/i.test(err.message)) throw err;
        mapPuterImageError(err); // selalu throw
    }

    const imageUrl = extractPuterImageUrl(result);
    if (!isSafeImageUrl(imageUrl)) {
        let preview = '';
        try {
            preview = JSON.stringify(result).slice(0, 300);
        } catch {
            preview = String(result).slice(0, 300);
        }
        console.error(`[IMG DEBUG] Hasil txt2img tak terduga: ${preview}`);
        throw new Error('Puter txt2img mengembalikan hasil yang tidak bisa dipakai. Lihat log server.');
    }
    return imageUrl;
}

async function callPuterImageWithRetry(prompt, model, inputImage) {
    let lastErr;
    for (let attempt = 1; attempt <= 1 + MAX_RETRIES; attempt++) {
        try {
            return await callPuterImageOnce(prompt, model, inputImage);
        } catch (err) {
            lastErr = err;
            if (err.permanent || isPuterImagePermanent(err.message) || attempt > MAX_RETRIES) {
                if (!err.permanent && isPuterImagePermanent(err.message)) err.permanent = true;
                break;
            }
            console.warn(`[IMG WARN] Percobaan ${attempt} gagal (${err.message}), retry setelah ${RETRY_DELAY_MS}ms...`);
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
    }
    throw lastErr;
}

module.exports = { generateImage, isSafeImageUrl, buildEffectivePrompt, parseInputImage, MAX_INPUT_IMAGE_BYTES };
