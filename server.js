const fs = require('fs');
const path = require('path');

// Loader .env minimal tanpa dependency (hindari perlu install dotenv).
try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        let loaded = 0;
        const raw = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, ''); // buang BOM Notepad
        for (const line of raw.split(/\r?\n/)) {
            let t = line.trim();
            if (!t || t.startsWith('#')) continue;
            if (t.startsWith('export ')) t = t.slice(7).trim(); // dukung "export KEY=val"
            const i = t.indexOf('=');
            if (i > 0) {
                const key = t.slice(0, i).trim();
                let val = t.slice(i + 1).trim();
                // Lepas tanda kutip pembungkus bila ada: KEY="val" / KEY='val'
                if (val.length >= 2 && ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))) {
                    val = val.slice(1, -1);
                }
                if (!(key in process.env)) {
                    process.env[key] = val;
                    loaded++;
                }
            }
        }
        console.log(`[INFO] .env dimuat (${loaded} variabel).`);
    } else {
        console.warn('[WARN] File .env tidak ditemukan, memakai environment bawaan.');
    }
} catch (e) {
    console.warn('[WARN] Gagal membaca .env:', e.message);
}
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { getBotReply, describeImage } = require('./lib/llm');
const { generateImage, parseInputImage } = require('./lib/images');

const app = express();
const server = http.createServer(app);
// Buffer socket dinaikkan agar payload data-URI gambar (maks ~4 MiB + teks) lolos.
const io = socketIo(server, { maxHttpBufferSize: 8 * 1024 * 1024 });

const PORT = process.env.PORT || 3000;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || 'Kamu asisten berbahasa Indonesia yang singkat dan membantu.';
const MAX_HISTORY = 20;
const MAX_MSG_LEN = 2000;
const MIN_INTERVAL_MS = 2000;
const IMAGE_MIN_INTERVAL_MS = 15000; // rate-limit khusus gambar, lebih ketat
const MAX_IMG_PROMPT_LEN = 1000;

// Full puter.js: satu-satunya prasyarat adalah PUTER_AUTH_TOKEN.
if (!process.env.PUTER_AUTH_TOKEN) {
    console.warn('[WARN] PUTER_AUTH_TOKEN belum diisi di .env — bot akan membalas pesan error konfigurasi.');
} else {
    console.log('[INFO] Provider: puter.js (chat, txt2img, vision).');
}
if (!process.env.IMAGE_MODEL) {
    console.log('[INFO] IMAGE_MODEL kosong — dipakai default gpt-image-1-mini.');
} else {
    console.log(`[INFO] Image fallback: ${process.env.IMAGE_MODEL.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).join(' -> ')}`);
}
if (!process.env.VISION_MODEL) {
    console.log('[INFO] VISION_MODEL kosong — dipakai default gpt-4o-mini.');
} else {
    console.log(`[INFO] Vision fallback: ${process.env.VISION_MODEL.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).join(' -> ')}`);
}
if (process.env.LLM_MODEL) {
    console.log(`[INFO] Chat fallback: ${process.env.LLM_MODEL.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).join(' -> ')}`);
}

/**
 * Deteksi intent generate gambar. Mengembalikan prompt gambar atau null.
 * Mendukung prefix "/gambar ..." dan "/edit ..." (edit = gambar->gambar bila
 * ada lampiran, teks->gambar bila tanpa lampiran), plus pola bahasa ID/EN.
 */
function detectImageIntent(text) {
    const cmd = text.match(/^\/(?:gambar|edit)\s+([\s\S]+)$/i);
    if (cmd && cmd[1].trim()) return cmd[1].trim();

    const patterns = [
        // ID: "buatkan [saya/kan/dong/gambar] ... kucing orange" — kata kerja + opsional pengisi + objek bebas
        /^(?:tolong\s+)?(?:buatkan|buatin|buat|gambar|gambarkan|lukis|lukiskan|desain|desainkan|ciptakan)\s+(?:saya\s+|kan\s+|dong\s+|ya\s+|tolong\s+)?(?:sebuah\s+|satu\s+|satu\s+buah\s+)?(?:gambar|ilustrasi|foto|lukisan|logo|sketsa|desain|gambar\s+tentang|ilustrasi\s+tentang)?\s*(?:tentang\s+|berupa\s+|berisi\s+|bertema\s+|dengan\s+tema\s+)?([\s\S]+)$/i,
        /^(?:tolong\s+)?(?:generate|draw|create|make|paint|design)\s+(?:me\s+|please\s+)?(?:an?\s+|some\s+)?(?:image|picture|illustration|logo|photo|painting|sketch)\s+(?:of\s+|about\s+|featuring\s+)?([\s\S]+)$/i,
    ];
    for (const re of patterns) {
        const m = text.match(re);
        if (m && m[1].trim()) {
            const obj = m[1].trim();
            // Hindari false positive: pertanyaan tentang gambar ("gambar apa itu...", "apa itu gambar...")
            if (/^(apa|apakah|bagaimana|kenapa|mengapa|kapan|dimana|siapa|jelaskan|apa\s+itu)\b/i.test(obj)) return null;
            return obj;
        }
    }
    return null;
}

app.use(express.static(path.join(__dirname, 'public')));

// History per-socket: socket.id -> [{ role, content }]
const histories = new Map();
const lastMsgAt = new Map();
const lastImageAt = new Map();

function getHistory(socketId) {
    if (!histories.has(socketId)) {
        histories.set(socketId, [{ role: 'system', content: SYSTEM_PROMPT }]);
    }
    return histories.get(socketId);
}

function trimHistory(history) {
    // Pertahankan pesan system pertama, potong pesan lama bila melebihi batas.
    if (history.length <= MAX_HISTORY + 1) return history;
    const system = history[0];
    const rest = history.slice(1).slice(-MAX_HISTORY);
    return [system, ...rest];
}

/**
 * Validasi panjang prompt gambar + rate-limit bucket gambar.
 * @returns {string|null} pesan error atau null bila lolos
 */
function checkImageGate(socketId, prompt) {
    if (prompt.length < 3) {
        return 'Prompt gambar terlalu pendek. Contoh: /gambar kucing astronot';
    }
    if (prompt.length > MAX_IMG_PROMPT_LEN) {
        return `Prompt gambar terlalu panjang (maks ${MAX_IMG_PROMPT_LEN} karakter).`;
    }
    const imgNow = Date.now();
    if (imgNow - (lastImageAt.get(socketId) || 0) < IMAGE_MIN_INTERVAL_MS) {
        return 'Generate gambar dibatasi, tunggu sebentar sebelum mencoba lagi...';
    }
    lastImageAt.set(socketId, imgNow);
    return null;
}

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    getHistory(socket.id);

    socket.on('chat message', async (payload) => {
        // Payload: string lama (kompatibel mundur) atau { text, image? }.
        const text = (typeof payload === 'string' ? payload : payload && payload.text || '').trim();
        const rawImage = (payload && typeof payload === 'object' && payload.image) ? String(payload.image) : null;

        if (!text && !rawImage) {
            socket.emit('chat error', { message: 'Pesan kosong.' });
            return;
        }
        if (text.length > MAX_MSG_LEN) {
            socket.emit('chat error', { message: `Pesan terlalu panjang (maks ${MAX_MSG_LEN} karakter).` });
            return;
        }

        const now = Date.now();
        if (now - (lastMsgAt.get(socket.id) || 0) < MIN_INTERVAL_MS) {
            socket.emit('chat error', { message: 'Terlalu cepat, tunggu sebentar...' });
            return;
        }
        lastMsgAt.set(socket.id, now);

        // --- Validasi gambar lampiran (bila ada) ---
        let attached = null;
        if (rawImage) {
            try {
                attached = parseInputImage(rawImage);
            } catch (err) {
                socket.emit('chat error', { message: err.message });
                return;
            }
        }

        let history = getHistory(socket.id);
        const imagePrompt = detectImageIntent(text);

        // --- Jalur gambar->gambar: lampiran + intent gambar (/edit, /gambar, pola ID/EN) ---
        if (attached && imagePrompt) {
            const gateErr = checkImageGate(socket.id, imagePrompt);
            if (gateErr) {
                socket.emit('chat error', { message: gateErr });
                return;
            }
            history.push({ role: 'user', content: `[minta gambar dari gambar (${attached.mime}): ${imagePrompt.slice(0, 120)}]` });
            histories.set(socket.id, trimHistory(history));

            socket.emit('bot typing', { mode: 'image' });

            try {
                const { imageUrl, revisedPrompt, model } = await generateImage(imagePrompt, history, { inputImage: attached.dataUri });
                // Ingatan lintas bot: catat hasil sebagai entri assistant (tanpa data-URI).
                history.push({ role: 'assistant', content: `[membuat gambar dari gambar: "${imagePrompt}" (model: ${model})]` });
                histories.set(socket.id, trimHistory(history));
                socket.emit('bot image', { imageUrl, caption: revisedPrompt || `${imagePrompt} (model: ${model})` });
            } catch (err) {
                console.error('Image edit error:', err.message);
                socket.emit('chat error', { message: `Gagal mengedit gambar: ${err.message}` });
            }
            return;
        }

        // --- Jalur gambar->teks: lampiran + teks biasa (vision Q&A) ---
        if (attached) {
            const question = text || 'Jelaskan isi gambar ini secara singkat dalam Bahasa Indonesia.';
            const imgNow = Date.now();
            if (imgNow - (lastImageAt.get(socket.id) || 0) < IMAGE_MIN_INTERVAL_MS) {
                socket.emit('chat error', { message: 'Analisis gambar dibatasi, tunggu sebentar sebelum mencoba lagi...' });
                return;
            }
            lastImageAt.set(socket.id, imgNow);

            const kb = attached.bytes ? `, ${(attached.bytes / 1024).toFixed(0)}KB` : '';
            history.push({ role: 'user', content: `[gambar terlampir: ${attached.mime}${kb}] ${question.slice(0, 200)}` });
            histories.set(socket.id, trimHistory(history));

            socket.emit('bot typing', { mode: 'vision' });

            try {
                const reply = await describeImage(`${SYSTEM_PROMPT}\n\nPertanyaan user atas gambar terlampir: ${question}`, attached.dataUri);
                history.push({ role: 'assistant', content: reply });
                histories.set(socket.id, trimHistory(history));
                socket.emit('bot reply', { text: reply }); // hanya ke pengirim, bukan broadcast
            } catch (err) {
                console.error('Vision error:', err.message);
                socket.emit('chat error', { message: `Bot gagal menganalisis gambar: ${err.message}` });
            }
            return;
        }

        // --- Jalur teks->gambar (tanpa lampiran, tidak berubah) ---
        if (imagePrompt) {
            const gateErr = checkImageGate(socket.id, imagePrompt);
            if (gateErr) {
                socket.emit('chat error', { message: gateErr });
                return;
            }

            history.push({ role: 'user', content: `[minta gambar: ${imagePrompt.slice(0, 120)}]` });
            histories.set(socket.id, trimHistory(history));

            socket.emit('bot typing', { mode: 'image' });

            try {
                const { imageUrl, revisedPrompt, model } = await generateImage(imagePrompt, history);
                // Ingatan lintas bot: catat hasil gambar sebagai entri assistant agar
                // chat teks berikutnya bisa merujuknya ("gambar kucing tadi").
                history.push({ role: 'assistant', content: `[membuat gambar: "${imagePrompt}" (model: ${model})]` });
                histories.set(socket.id, trimHistory(history));
                socket.emit('bot image', { imageUrl, caption: revisedPrompt || `${imagePrompt} (model: ${model})` });
            } catch (err) {
                console.error('Image error:', err.message);
                socket.emit('chat error', { message: `Gagal membuat gambar: ${err.message}` });
            }
            return;
        }

        // --- Jalur teks->teks (tidak berubah) ---
        history.push({ role: 'user', content: text });
        history = trimHistory(history);
        histories.set(socket.id, history);

        socket.emit('bot typing');

        try {
            const reply = await getBotReply(history);
            history.push({ role: 'assistant', content: reply });
            histories.set(socket.id, trimHistory(history));
            socket.emit('bot reply', { text: reply }); // hanya ke pengirim, bukan broadcast
        } catch (err) {
            console.error('LLM error:', err.message);
            socket.emit('chat error', { message: `Bot gagal menjawab: ${err.message}` });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        histories.delete(socket.id);
        lastMsgAt.delete(socket.id);
        lastImageAt.delete(socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
