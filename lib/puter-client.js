/**
 * Helper shared: singleton client Puter dari PUTER_AUTH_TOKEN.
 * Dipakai lib/llm.js (chat teks) dan lib/images.js (txt2img).
 */

// Singleton client Puter (lazy init agar start server tetap ringan).
let puterClient = null;

async function getPuterClient() {
    if (puterClient) return puterClient;
    const token = (process.env.PUTER_AUTH_TOKEN || '').trim();
    if (!token) {
        throw new Error('PUTER_AUTH_TOKEN belum dikonfigurasi di .env.');
    }
    let init;
    try {
        ({ init } = await import('@heyputer/puter.js/src/init.cjs'));
    } catch {
        throw new Error('Paket @heyputer/puter.js belum terinstall. Jalankan: npm install');
    }
    puterClient = init(token);
    return puterClient;
}

module.exports = { getPuterClient };
