/**
 * Chat teks + vision gambar->teks, full puter.js (puter-only).
 * Dipakai server.js (teks->teks via getBotReply, gambar->teks via describeImage).
 */

const TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '90000', 10) || 90000;
const MAX_RETRIES = 2; // total percobaan = 1 + 2 retry
const RETRY_DELAY_MS = 2000;

/**
 * Daftar model fallback berurutan dari env (koma/baris). Model pertama =
 * prioritas utama; sisanya cadangan bila kena 402/429/timeout/model tak dikenal.
 */
function parseModelList(raw, def) {
    const list = String(raw || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    return list.length ? [...new Set(list)] : [def];
}

function getPuterModels() {
    // Chat teks->teks. Default dok Puter: gpt-5-nano.
    return parseModelList(process.env.LLM_MODEL, 'gpt-5-nano');
}

function getVisionModels() {
    // Vision gambar->teks. Harus vision-capable.
    return parseModelList(process.env.VISION_MODEL, 'gpt-4o-mini');
}

function getPuterModel() {
    return getPuterModels()[0]; // kompatibel mundur
}

function getVisionModel() {
    return getVisionModels()[0]; // kompatibel mundur
}

function isRetryableMessage(msg) {
    return /timeout|429|5\d\d|ECONN|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(msg || '');
}

const { getPuterClient } = require('./puter-client');

/**
 * Ambil string teks dari respons puter.ai.chat().
 * normalize:true membuat content string, tapi tetap ada fallback
 * untuk format native array-of-blocks (model lama).
 */
function extractPuterText(response) {
    const msg = response && response.message;
    const content = msg && msg.content;
    if (typeof content === 'string' && content.trim()) return content.trim();
    if (Array.isArray(content)) {
        const joined = content
            .map((b) => (typeof b === 'string' ? b : b && b.text))
            .filter((s) => typeof s === 'string' && s.trim())
            .join('')
            .trim();
        if (joined) return joined;
    }
    if (typeof response === 'string' && response.trim()) return response.trim();
    return null;
}

/**
 * Petakan error Puter ({message, code} + errorCode) ke pesan ramah
 * agar frontend tidak perlu berubah.
 */
function mapPuterError(err) {
    const body = (err && (err.error || err)) || {};
    const msg = String((body && body.message) || (err && err.message) || 'Unknown Puter error');
    const code = String((body && (body.code || body.errorCode || body.status)) || (err && (err.code || err.errorCode || err.status)) || '');
    const blob = `${code} ${msg}`;

    if (/expired|invalid.*token|unauthorized|401/i.test(blob)) {
        const e = new Error('PUTER_AUTH_TOKEN tidak valid/kedaluwarsa (401). Login ulang di Puter lalu perbarui .env.');
        e.permanent = true;
        throw e;
    }
    if (/insufficient_funds|402/i.test(blob)) {
        // Kuota habis (402) BUKAN fatal: coba model berikutnya (beda model =
        // beda kuota/provider). Hanya bila semua model gagal, error ini yang dilaporkan.
        throw new Error('Kuota Puter tidak cukup (402). Cek saldo/kuota akun Puter.');
    }
    if (/moderation_flagged|content[-_ ]?filter|content[-_ ]?policy|refused/i.test(blob)) {
        const e = new Error(`Permintaan ditolak filter konten Puter: ${msg.slice(0, 200)}`);
        e.permanent = true;
        throw e;
    }
    if (/429|rate[-_ ]?limit|quota/i.test(blob)) {
        throw new Error(`Rate limit Puter tercapai (429): ${msg.slice(0, 200)}`);
    }
    if (/model.*not.*found|unknown.*model|invalid.*model/i.test(blob)) {
        const e = new Error(`Model Puter tidak dikenal: ${msg.slice(0, 200)}`);
        e.permanent = true;
        throw e;
    }
    if (/puter\.js belum terinstall/i.test(msg)) {
        const e = new Error(msg);
        e.permanent = true;
        throw e;
    }
    throw new Error(`Puter error: ${msg.slice(0, 300)}`);
}

async function callPuterOnce(messages, model) {
    let puter;
    try {
        puter = await getPuterClient();
    } catch (err) {
        if (/PUTER_AUTH_TOKEN belum/i.test(err.message)) {
            err.message += ' (puter.js)';
        }
        throw err;
    }
    model = (model || '').trim() || getPuterModels()[0];

    let result;
    try {
        const call = puter.ai.chat(messages, {
            model,
            temperature: 0.7,
            max_tokens: 800,
            normalize: true, // paksa format OpenAI: message.content string
        });
        // SDK tidak mendukung AbortSignal -> timeout via Promise.race.
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
                const e = new Error(`LLM timeout (>${Math.round(TIMEOUT_MS / 1000)} detik), coba lagi.`);
                reject(e);
            }, TIMEOUT_MS);
        });
        try {
            result = await Promise.race([call, timeout]);
        } finally {
            clearTimeout(timer);
        }
    } catch (err) {
        if (/LLM timeout/i.test(err.message)) throw err; // sudah format final, jangan di-map ulang
        mapPuterError(err); // selalu throw
    }

    const text = extractPuterText(result);
    if (!text) {
        console.error(`[PUTER DEBUG] respons tanpa teks: ${JSON.stringify(result).slice(0, 500)}`);
        throw new Error('Puter mengembalikan respons kosong. Lihat log server untuk detail.');
    }
    return text;
}

/**
 * Vision satu panggilan: tanya jawab atas satu gambar (gambar->teks).
 * Memakai overload puter.ai.chat(prompt, imageRef, options) yang membangun
 * request vision ({ image_url: { url } } + vision:true) di dalam SDK.
 * @param {string} prompt - pertanyaan + konteks sistem (sudah digabung server)
 * @param {string} imageRef - data-URI (data:image/...;base64,...) atau URL https:
 * @returns {Promise<string>}
 */
async function callVisionOnce(prompt, imageRef, model) {
    let puter;
    try {
        puter = await getPuterClient();
    } catch (err) {
        if (/PUTER_AUTH_TOKEN belum/i.test(err.message)) {
            err.message += ' (puter.js vision)';
        }
        throw err;
    }
    model = (model || '').trim() || getVisionModels()[0];

    let result;
    try {
        const call = puter.ai.chat(prompt, imageRef, {
            model,
            temperature: 0.7,
            max_tokens: 800,
            normalize: true,
        });
        // SDK tidak mendukung AbortSignal -> timeout via Promise.race.
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
                const e = new Error(`Vision timeout (>${Math.round(TIMEOUT_MS / 1000)} detik), coba lagi.`);
                reject(e);
            }, TIMEOUT_MS);
        });
        try {
            result = await Promise.race([call, timeout]);
        } finally {
            clearTimeout(timer);
        }
    } catch (err) {
        if (/Vision timeout/i.test(err.message)) throw err; // sudah format final
        mapPuterError(err); // selalu throw
    }

    const text = extractPuterText(result);
    if (!text) {
        console.error(`[PUTER DEBUG] respons vision tanpa teks: ${JSON.stringify(result).slice(0, 500)}`);
        throw new Error('Puter vision mengembalikan respons kosong. Lihat log server untuk detail.');
    }
    return text;
}

/**
 * Error yang BOLEH memicu fallback ke model berikutnya:
 * kuota habis (402 — beda model bisa beda kuota/provider),
 * rate-limit (429), timeout, network/server error, model tak dikenal.
 * Yang TIDAK boleh: auth (401), paket hilang, filter konten/refusal.
 */
function isChatFallbackable(msg) {
    if (/PUTER_AUTH_TOKEN|belum terinstall|expired|invalid.*token|unauthorized|401/i.test(msg || '')) return false;
    if (/moderation_flagged|content[-_ ]?filter|content[-_ ]?policy|refused/i.test(msg || '')) return false;
    return true;
}

/**
 * Memanggil LLM teks dan mengembalikan teks balasan (puter-only).
 * Mencoba daftar LLM_MODEL berurutan sampai satu berhasil (fallback).
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Promise<string>}
 */
async function getBotReply(messages) {
    const list = getPuterModels();
    let lastErr;
    for (const model of list) {
        try {
            for (let attempt = 1; attempt <= 1 + MAX_RETRIES; attempt++) {
                try {
                    const out = await callPuterOnce(messages, model);
                    if (model !== list[0]) console.log(`[PUTER INFO] Fallback chat berhasil dengan model: ${model}`);
                    return out;
                } catch (err) {
                    lastErr = err;
                    if (err.permanent || !isRetryableMessage(err.message) || attempt > MAX_RETRIES) break;
                    console.warn(`[PUTER WARN] ${model} percobaan ${attempt} gagal (${err.message}), retry ${attempt + 1}/${1 + MAX_RETRIES} setelah ${RETRY_DELAY_MS}ms...`);
                    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
                }
            }
        } catch (err) {
            lastErr = err;
        }
        // Gagal di model ini -> coba model berikutnya, kecuali fatal.
        if (lastErr && !isChatFallbackable(lastErr.message)) throw lastErr;
        if (model !== list[list.length - 1]) {
            console.warn(`[PUTER WARN] Model ${model} gagal (${lastErr && lastErr.message}), fallback ke model berikutnya...`);
        }
    }
    throw lastErr;
}

/**
 * Menjawab pertanyaan atas satu gambar terlampir (gambar->teks, puter-only).
 * Mencoba daftar VISION_MODEL berurutan sampai satu berhasil (fallback).
 * @param {string} prompt - pertanyaan user (sudah digabung konteks sistem oleh server)
 * @param {string} imageRef - data-URI tervalidasi atau URL https:
 * @returns {Promise<string>}
 */
async function describeImage(prompt, imageRef) {
    if (!imageRef) throw new Error('Referensi gambar kosong.');
    const list = getVisionModels();
    let lastErr;
    for (const model of list) {
        try {
            for (let attempt = 1; attempt <= 1 + MAX_RETRIES; attempt++) {
                try {
                    const out = await callVisionOnce(prompt, imageRef, model);
                    if (model !== list[0]) console.log(`[VISION INFO] Fallback vision berhasil dengan model: ${model}`);
                    return out;
                } catch (err) {
                    lastErr = err;
                    if (err.permanent || !isRetryableMessage(err.message) || attempt > MAX_RETRIES) break;
                    console.warn(`[VISION WARN] ${model} percobaan ${attempt} gagal (${err.message}), retry ${attempt + 1}/${1 + MAX_RETRIES} setelah ${RETRY_DELAY_MS}ms...`);
                    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
                }
            }
        } catch (err) {
            lastErr = err;
        }
        if (lastErr && !isChatFallbackable(lastErr.message)) throw lastErr;
        if (model !== list[list.length - 1]) {
            console.warn(`[VISION WARN] Model ${model} gagal (${lastErr && lastErr.message}), fallback ke model berikutnya...`);
        }
    }
    throw lastErr;
}

module.exports = { getBotReply, describeImage, getVisionModel, getVisionModels, getPuterModels };
