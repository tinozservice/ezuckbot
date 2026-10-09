const socket = io();

const messages = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const typing = document.getElementById('typing');
const attachButton = document.getElementById('attach-button');
const imageInput = document.getElementById('image-input');
const attachPreview = document.getElementById('attach-preview');
const attachThumb = document.getElementById('attach-thumb');
const attachInfo = document.getElementById('attach-info');
const attachCancel = document.getElementById('attach-cancel');

// Batas client-side diselaraskan dengan VISION_MAX_IMAGE_BYTES server (default 4 MiB).
const MAX_ATTACH_BYTES = 4 * 1024 * 1024;
const ALLOWED_ATTACH_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Gambar terlampir saat ini: { dataUri, mime, bytes } atau null. */
let attachedImage = null;

// Abort controller untuk membatalkan FileReader lama bila pengguna ganti/pilih file lagi.
let attachReadToken = 0;

function clearAttachment() {
    attachReadToken++; // batalkan pembacaan yang sedang berjalan
    attachedImage = null;
    if (imageInput) imageInput.value = '';
    if (attachPreview) attachPreview.style.display = 'none';
    if (attachThumb) attachThumb.removeAttribute('src');
    if (attachInfo) attachInfo.textContent = '';
}

/** Bersihkan preview + tampilkan pesan error yang jelas bila thumbnail gagal dimuat. */
function failAttachment(message) {
    clearAttachment();
    if (message) addMessage(message, 'error');
}

// Dipanggil dari atribut onerror pada <img id="attach-thumb"> di index.html.
// Mencegah tampilan "gambar rusak" di atas tombol attach.
window.__attachThumbFailed = function () {
    failAttachment('Gambar lampiran tidak bisa ditampilkan. Coba pilih gambar lain (JPG/PNG/WEBP/GIF).');
};

/** Cek bahwa data URI benar-benar gambar base64 yang valid, bukan sekadar prefix. */
function isValidImageDataUri(dataUri) {
    if (typeof dataUri !== 'string' || !dataUri.startsWith('data:image/')) return false;
    const comma = dataUri.indexOf(',');
    if (comma < 0) return false;
    return dataUri.slice(comma + 1).length > 0; // ada payload
}

if (attachButton && imageInput) {
    attachButton.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', () => {
        const file = imageInput.files && imageInput.files[0];
        if (!file) return;
        if (!ALLOWED_ATTACH_MIME.includes(file.type)) {
            addMessage('Format gambar tidak didukung. Kirim JPG, PNG, WEBP, atau GIF.', 'error');
            imageInput.value = '';
            return;
        }
        if (file.size > MAX_ATTACH_BYTES) {
            addMessage(`Gambar terlalu besar (${(file.size / 1048576).toFixed(1)} MB, maks 4 MB).`, 'error');
            imageInput.value = '';
            return;
        }
        const token = ++attachReadToken; // kunci hasil baca: abaikan bila sudah dibatalkan
        const reader = new FileReader();
        reader.onload = () => {
            if (token !== attachReadToken) return; // hasil basi (file diganti/dibatalkan)
            const dataUri = String(reader.result || '');
            if (!isValidImageDataUri(dataUri)) {
                failAttachment('Gambar tidak bisa dibaca. Coba pilih gambar lain.');
                return;
            }
            attachedImage = { dataUri, mime: file.type, bytes: file.size };
            // Set thumbnail dulu; bila gagal render, onerror akan membersihkan preview.
            if (attachThumb) attachThumb.src = dataUri;
            if (attachInfo) attachInfo.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
            if (attachPreview) attachPreview.style.display = 'flex';
        };
        reader.onerror = () => {
            if (token === attachReadToken) failAttachment('Gambar tidak bisa dibaca. Coba pilih gambar lain.');
        };
        reader.readAsDataURL(file);
    });
}
if (attachCancel) {
    attachCancel.addEventListener('click', clearAttachment);
}

/**
 * Inline formatting yang aman dari XSS: hanya memakai
 * createElement + textContent/createTextNode, tanpa innerHTML.
 * Mendukung **tebal**, *miring*, __tebal__, dan `kode`.
 */
function addInline(parent, text) {
    let i = 0;
    let buf = '';
    const flush = () => {
        if (buf) {
            parent.appendChild(document.createTextNode(buf));
            buf = '';
        }
    };
    while (i < text.length) {
        // **tebal** atau __tebal__
        if (text.startsWith('**', i) || text.startsWith('__', i)) {
            const token = text.slice(i, i + 2);
            const end = text.indexOf(token, i + 2);
            if (end > i + 2) {
                flush();
                const strong = document.createElement('strong');
                addInline(strong, text.slice(i + 2, end));
                parent.appendChild(strong);
                i = end + 2;
                continue;
            }
            buf += token;
            i += 2;
            continue;
        }
        const ch = text[i];
        // `kode`
        if (ch === '`') {
            const end = text.indexOf('`', i + 1);
            if (end > i + 1) {
                flush();
                const code = document.createElement('code');
                code.textContent = text.slice(i + 1, end);
                parent.appendChild(code);
                i = end + 1;
                continue;
            }
            buf += ch;
            i++;
            continue;
        }
        // *miring* atau _miring_ (abaikan _ di dalam kata seperti snake_case)
        if (ch === '*' || ch === '_') {
            const isWordUnderscore = ch === '_' &&
                i > 0 && /\w/.test(text[i - 1]) &&
                i + 1 < text.length && /\w/.test(text[i + 1]);
            if (!isWordUnderscore) {
                const end = text.indexOf(ch, i + 1);
                if (end > i + 1) {
                    flush();
                    const em = document.createElement('em');
                    addInline(em, text.slice(i + 1, end));
                    parent.appendChild(em);
                    i = end + 1;
                    continue;
                }
            }
            buf += ch;
            i++;
            continue;
        }
        buf += ch;
        i++;
    }
    flush();
}

/**
 * Render balasan bot (markdown ringan) menjadi elemen DOM yang rapi.
 * Mendukung heading (#), list (- / 1.), quote (>), garis (---), paragraf.
 */
function renderBotMessage(el, text) {
    const norm = String(text || '')
        .replace(/\r\n?/g, '\n')
        // Pulihkan struktur yang kadang menempel dalam satu baris:
        .replace(/([^\n])\s+(#{1,4}\s)/g, '$1\n$2')        // "teks ## Judul" -> baris baru
        .replace(/(\S)\s+(\d{1,2}\.\s+\*\*)/g, '$1\n$2')    // "kalimat 1. **Item**" -> baris baru
        .replace(/([.!?:;])\s+(>\s)/g, '$1\n$2')            // "teks > kutipan" -> baris baru
        .trim();

    const lines = norm.split('\n');
    let para = [];
    let list = null; // { ordered: boolean, el: HTMLOListElement }

    const flushPara = () => {
        if (!para.length) return;
        const p = document.createElement('p');
        para.forEach((ln, idx) => {
            if (idx > 0) p.appendChild(document.createElement('br'));
            addInline(p, ln);
        });
        el.appendChild(p);
        para = [];
    };
    const closeList = () => { list = null; };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            flushPara();
            closeList();
            continue;
        }

        let m;
        // Heading: # Judul
        if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
            flushPara();
            closeList();
            const level = Math.min(m[1].length, 4);
            const h = document.createElement('h' + level);
            addInline(h, m[2]);
            el.appendChild(h);
            continue;
        }
        // Quote: > teks
        if ((m = line.match(/^>\s?(.*)$/))) {
            flushPara();
            closeList();
            const q = document.createElement('blockquote');
            addInline(q, m[1]);
            el.appendChild(q);
            continue;
        }
        // Garis: --- atau ***
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
            flushPara();
            closeList();
            el.appendChild(document.createElement('hr'));
            continue;
        }
        // List bullet: - item
        if ((m = line.match(/^[-*•]\s+(.*)$/))) {
            flushPara();
            if (!list || list.ordered) {
                list = { ordered: false, el: document.createElement('ul') };
                el.appendChild(list.el);
            }
            const li = document.createElement('li');
            addInline(li, m[1]);
            list.el.appendChild(li);
            continue;
        }
        // List bernomor: 1. item
        if ((m = line.match(/^\d{1,2}[.)]\s+(.*)$/))) {
            flushPara();
            if (!list || !list.ordered) {
                list = { ordered: true, el: document.createElement('ol') };
                el.appendChild(list.el);
            }
            const li = document.createElement('li');
            addInline(li, m[1]);
            list.el.appendChild(li);
            continue;
        }
        // Baris lanjutan dari item list (bungkus tanpa penanda) -> gabung ke <li> terakhir
        if (list && list.el.lastChild) {
            const li = list.el.lastChild;
            li.appendChild(document.createElement('br'));
            addInline(li, line);
            continue;
        }
        para.push(line);
    }
    flushPara();
}

function addMessage(text, who, opts) {
    if (who === 'user') {
        const row = document.createElement('div');
        row.className = 'flex justify-end';

        const wrap = document.createElement('div');
        wrap.className = 'flex max-w-[80%] flex-col items-end gap-2';

        if (opts && opts.imageDataUri && isSafeImageUrl(opts.imageDataUri)) {
            const thumbLink = document.createElement('a');
            thumbLink.href = opts.imageDataUri;
            thumbLink.target = '_blank';
            thumbLink.rel = 'noopener';
            const thumb = document.createElement('img');
            thumb.src = opts.imageDataUri;
            thumb.alt = 'Gambar terkirim';
            thumb.className = 'max-h-40 rounded-2xl border border-white/20 object-cover shadow';
            thumbLink.appendChild(thumb);
            wrap.appendChild(thumbLink);
        }

        if (text) {
            const bubble = document.createElement('div');
            bubble.className = 'max-w-full rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-500 to-violet-600 px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-md shadow-indigo-500/20';
            bubble.textContent = text; // teks polos, aman dari XSS
            wrap.appendChild(bubble);
        }

        row.appendChild(wrap);
        messages.appendChild(row);
    } else if (who === 'bot') {
        const row = document.createElement('div');
        row.className = 'flex items-start gap-2';

        const avatar = document.createElement('div');
        avatar.className = 'mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs text-white shadow';
        avatar.textContent = '✦';
        row.appendChild(avatar);

        const bubble = document.createElement('div');
        bubble.className = 'bot max-w-[85%] rounded-2xl rounded-tl-md border border-slate-200/70 bg-white px-4 py-2.5 text-[15px] leading-relaxed text-slate-800 shadow-sm';
        renderBotMessage(bubble, text); // markdown -> elemen rapi (tetap anti-XSS)

        row.appendChild(bubble);
        messages.appendChild(row);
    } else {
        const row = document.createElement('div');
        row.className = 'flex justify-center';

        const el = document.createElement('div');
        el.className = 'max-w-[90%] rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 shadow-sm';
        el.textContent = text;

        row.appendChild(el);
        messages.appendChild(row);
    }

    messages.scrollTop = messages.scrollHeight;
}

function setBusy(busy) {
    sendButton.disabled = busy;
    messageInput.disabled = busy;
    if (attachButton) attachButton.disabled = busy;
    if (imageInput) imageInput.disabled = busy;
}

/**
 * Validasi URL gambar di sisi client: hanya https: atau data:image/.
 */
function isSafeImageUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    if (url.startsWith('data:image/')) return true;
    try {
        return new URL(url, window.location.origin).protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Render bubble gambar dari bot: <img> + caption, semua via createElement.
 */
function addImageMessage(imageUrl, caption) {
    const row = document.createElement('div');
    row.className = 'flex items-start gap-2';

    const avatar = document.createElement('div');
    avatar.className = 'mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs text-white shadow';
    avatar.textContent = '🖼️';
    row.appendChild(avatar);

    const bubble = document.createElement('div');
    bubble.className = 'bot max-w-[85%] rounded-2xl rounded-tl-md border border-slate-200/70 bg-white px-3 py-3 text-[15px] leading-relaxed text-slate-800 shadow-sm';

    const link = document.createElement('a');
    link.href = imageUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = 'Buka gambar penuh di tab baru';

    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = caption || 'Gambar hasil AI';
    img.loading = 'lazy';
    img.className = 'bot-image';
    link.appendChild(img);
    bubble.appendChild(link);

    if (caption) {
        const cap = document.createElement('p');
        cap.className = 'mt-2 text-sm text-slate-500';
        cap.textContent = caption;
        bubble.appendChild(cap);
    }

    row.appendChild(bubble);
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
}

function sendMessage() {
    const message = messageInput.value.trim();
    if (!message && !attachedImage) return;
    // Payload: string bila tanpa lampiran (kompatibel lama), objek { text, image } bila bergambar.
    const outgoing = attachedImage
        ? { text: message, image: attachedImage.dataUri }
        : message;
    addMessage(message || '(gambar terlampir)', 'user', attachedImage ? { imageDataUri: attachedImage.dataUri } : undefined);
    socket.emit('chat message', outgoing);
    messageInput.value = '';
    clearAttachment();
    setBusy(true);
}

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
});

socket.on('bot typing', (payload) => {
    typing.hidden = false;
    const label = typing.querySelector('span:last-child');
    if (label && payload && payload.mode === 'image') {
        label.textContent = 'Bot sedang menggambar...';
    } else if (label && payload && payload.mode === 'vision') {
        label.textContent = 'Bot sedang melihat gambar...';
    } else if (label) {
        label.textContent = 'Bot sedang mengetik...';
    }
});

socket.on('bot reply', (payload) => {
    typing.hidden = true;
    setBusy(false);
    messageInput.focus();
    const text = typeof payload === 'string' ? payload : payload && payload.text;
    addMessage(text || '(balasan kosong)', 'bot');
});

socket.on('bot image', (payload) => {
    typing.hidden = true;
    setBusy(false);
    messageInput.focus();
    const imageUrl = payload && payload.imageUrl;
    const caption = (payload && payload.caption) || '';
    if (!isSafeImageUrl(imageUrl)) {
        addMessage('Bot mengembalikan URL gambar yang tidak valid.', 'error');
        return;
    }
    addImageMessage(imageUrl, caption);
});

socket.on('chat error', (payload) => {
    typing.hidden = true;
    setBusy(false);
    const msg = typeof payload === 'string' ? payload : (payload && payload.message) || 'Terjadi kesalahan.';
    addMessage(msg, 'error');
});

socket.on('connect_error', () => {
    typing.hidden = true;
    setBusy(false);
    addMessage('Tidak bisa terhubung ke server. Coba lagi...', 'error');
});
