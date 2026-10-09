# AGENT INSTRUCTIONS (`INSTRUCTIONS.md`)

Berkas ini berisi instruksi standar yang **wajib dipatuhi oleh Agent AI** dalam mengeksekusi perintah, mengelola memori proyek di Obsidian, menjaga efisiensi konteks, serta menerapkan standar keamanan dan arsitektur kode.

## 1. Aturan Memori & Log (Memory & Context Rules)

1. **Baca Konteks Awal:** Wajib membaca berkas `PRD` (jika tersedia) serta berkas Indeks/Hub (`index.md` / `hub.md`) dan Log Progres di `Obsidian Vault` sebelum memulai pekerjaan.
2. **Kerapian Pembacaan Vault:** **DILARANG KERAS** menggunakan pencarian pola `global` (*glob patterns*) pada seluruh Obsidian Vault. Hanya baca berkas yang relevan melalui tautan atau struktur navigasi.
3. **Kontinuitas Pekerjaan:** Dilarang menduplikasi pekerjaan atau membatalkan kemajuan (*rollback*) yang telah diselesaikan oleh sesi/model AI sebelumnya.
4. **Pencatatan Wajib:** Wajib mencatat perbaruan ke dalam Obsidian Vault pada berkas `Log Progres` setiap kali selesai mengubah kode, memperbaiki bug, menambah dependensi, atau menyelesaikan instruksi pengguna. 
5. **Struktur Tautan (Zero Orphan):** Setiap berkas catatan atau perbaruan progres di `Obsidian Vault` wajib memiliki minimal satu `[[wikilink]]` ke catatan relevan lainnya. Dilarang membuat catatan terisolasi (*orphan note*) agar hubungan antar-konsep dapat terbaca dengan jelas di `Graph View Obsidian`.
6. **Kepadatan Informasi:** Dilarang mencatat riwayat obrolan (*chat logs*) mentah atau menempelkan (*paste*) blok kode yang panjang. Buat catatan yang ringkas, padat, teknis, dan berbasis poin agar mudah dipahami oleh Agent AI berikutnya.

## 2. Format Standar Log Progres Obsidian
Setiap pembaruan log progres wajib mengikuti struktur ringkas berikut:

# Log Progres Proyek

- **Status Proyek:** [Aktif / Perbaikan / Refactoring / Testing]
- **Kondisi Kode:** [Misal: PDO SQL Ready, Snap Payment Integrated, Auth API Stable]
- **Update Terakhir:** [YYYY-MM-DD HH:mm] via [Nama Model AI]

## Keputusan Teknis & Arsitektur
- [Keputusan teknis atau arsitektur utama yang diambil]

## Log Tindakan
- **[YYYY-MM-DD HH:mm] [Nama Model AI]:** [Ringkasan singkat perubahan file/logika konkret]

## Isu Terbuka & Batasan
- [Bug/Error yang belum terselesaikan, peringatan, atau limitasi teknis]

## Daftar Tugas & Estafet
- [x] Tugas yang telah diselesaikan
- [ ] [Prioritas] Tugas yang perlu dilanjutkan oleh Agent berikutnya

## 3. Aturan Eksekusi & Anti-Boros Konteks

1. **Self-Check Sebelum Selesai:** Agent wajib memperbarui log progres di Obsidian Vault sebelum menyatakan tugas telah selesai kepada pengguna.
2. **Referensi Presisi:** Gunakan referensi jalur berkas dan nama fungsi/metode (contoh: `app/Core/Auth.php:requireAdmin`) daripada menampilkan blok kode secara utuh di catatan Obsidian.
3. **Prinsip Atomic Note:** Terapkan prinsip *One Idea per Note* untuk catatan berbasis konsep. Setiap catatan permanen hanya membahas 1 ide utama dengan gaya bahasa teknis yang jelas.
4. **Konfirmasi Estafet:** Jika instruksi pengguna belum selesai penuh dalam satu sesi, catat titik henti (*checkpoint*) dan langkah selanjutnya di daftar tugas log progres agar Agent berikutnya dapat melanjutkan tanpa kendala.
5. **Sinkronisasi Akhir:** Agent wajib menutup setiap respons akhir dengan konfirmasi singkat bahwa catatan log di Vault telah diperbarui dan disinkronkan.

## 4. Aturan Keamanan Kode Global (Security Directives)
Aturan ini berlaku secara universal untuk seluruh jenis proyek (Web, Mobile, Desktop, API):
1. **Anti-SQL Injection:** Gunakan *Prepared Statements / Parameterized Queries* atau ORM/Query Builder bawaan framework. Dilarang keras melakukan penggabungan string (*string concatenation*) pada query basis data.
2. **Validasi & Sanitasi:** Validasi seluruh masukan (*input validation*) di tingkat server. Terapkan sanitasi data sebelum diproses atau disimpan.
3. **XSS Prevention:** Lakukan *escaping* pada semua variabel masukan pengguna saat ditampilkan ke UI/View. Terapkan *Content Security Policy* (CSP) jika berlaku.
4. *CSRF Protection:* Terapkan token CSRF untuk seluruh metode HTTP mutasi (`POST`, `PUT`, `DELETE`, `PATCH`).
5. **Keamanan Unggah Berkas:** Wajib memeriksa MIME-type menggunakan `finfo` (atau library keamanan bawaan platform). Dilarang hanya mengandalkan ekstensi berkas. Simpan berkas unggahan di luar direktori akses langsung eksekusi web (*non-executable directory*).
6. **Kredensial & Enkripsi Password:** Gunakan fungsi hash standar industri (misal: `bcrypt`, `argon2id`). Dilarang keras menyimpan password dalam bentuk teks murni (*plaintext*).
7. **Manajemen Kredensial & Secrets:** Simpan rahasia, kunci API, dan konfigurasi sensitif di berkas `.env`. Dilarang menuliskan kredensial secara langsung (hardcode) di dalam kode. Buatkan `.env.example` sebagai panduan untuk pengguna.
8. **Webhook & Authorization:** Terapkan verifikasi tanda tangan (*signature verification*) pada penyedia webhook. Lakukan pemeriksaan otorisasi (RBAC/ABAC) pada setiap titik balik (*endpoint*) atau aksi sensitif, bukan sekadar autentikasi.

## 5. Aturan Manajemen Obsidian Vault

1. **Struktur Folder Terkontrol:*** Buat struktur direktori di Obsidian Vault yang mencerminkan komponen proyek (misal: `00-Hub`/, `01-PRD`/, `02-Architecture`/, `03-Logs`/, dll).
2. **Pembatasan Folder Baru:** **DILARANG** membuat folder baru di dalam Vault tanpa persetujuan eksplisit dari pengguna. Dapatkan konfirmasi pengguna terlebih dahulu jika memerlukan folder baru.

## 6. Aturan Khusus Proyek (Project-Specific Rules)
*(Sesuaikan bagian ini berdasarkan lingkungan proyek yang sedang dikerjakan)*
1. **Zona Waktu (Timezone):**
    - Default zona waktu proyek menggunakan Asia/Jakarta (`WIB`).
    - Agent wajib mengonfirmasikan zona waktu ini kepada pengguna saat memulai pembuatan atau inisialisasi proyek pertama kali.
2. **Penanganan Rute (Routing):**
    - Ikuti konvensi deklarasi rute terpusat sesuai direktori atau arsitektur proyek (misal: `routes/web.php` untuk Next.js / Laravel / PHP Native Router).
3. **Views & Komponen UI:**
    - Pisahkan logika bisnis dari lapisan tampilan (*presentation layer*). Gunakan sistem komponen modular yang mudah dirawat.
4. **Manajemen Dependensi:**
    - Gunakan manajer paket resmi proyek (`composer` untuk PHP, `npm`/`pnpm` untuk Node.js, dsb.).
    - Selalu simpan perubahan dependensi pada berkas *lock* (`composer.lock`, `package-lock.json`, dll).