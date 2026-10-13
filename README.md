# KRAI IP TRACKER 1.0

Prototipe dashboard + generator link + peta geolokasi IP perkiraan. UI bertema terminal hijau. Data IP baru disimpan setelah pengunjung membaca pemberitahuan dan menekan tombol persetujuan. Jika pengunjung menolak, aplikasi tidak menambahkan kunjungan tersebut ke log tracker.

## Penting diketahui

- Ini **bukan APK Android**. Ini aplikasi web dengan backend Node.js. Dashboard bisa dibuka dari browser Android setelah server online.
- **File ZIP saja tidak membuat server online.** Untuk membuat link bisa dibuka dari internet, deploy proyek ini ke hosting Node.js.
- Tidak diperlukan API key geolokasi untuk contoh ini. Server meminta perkiraan lokasi dari `ipwho.is`; IP dikirim ke layanan tersebut hanya untuk lookup setelah pengunjung menyetujui.
- Lokasi berbasis IP bukan GPS dan tidak mengungkap alamat rumah secara akurat.
- Prototipe menyimpan link dan kunjungan di memori; maksimal 500 kunjungan dan 1.000 link. Semua data hilang saat proses server restart/deploy ulang. Jangan anggap ini sistem produksi.
- Penyedia hosting masih dapat memproses metadata koneksi sesuai kebijakan mereka.

## Cara paling mudah deploy dari Android

1. Ekstrak ZIP ini memakai pengelola file Android.
2. Buat repo baru di GitHub, lalu unggah isi folder proyek (jangan unggah folder `node_modules` atau file `.env`).
3. Di Render, pilih **New → Blueprint** dan sambungkan repo tersebut. Render membaca `render.yaml` dan menyiapkan web service.
4. Saat diminta mengisi `ADMIN_KEY`, buat sendiri password acak yang panjangnya setidaknya 24 karakter. Simpan aman; ini password untuk dashboard, **bukan API key layanan eksternal**. Jangan pernah taruh nilainya di repository.
5. Deploy dan tunggu sampai status layanan menjadi live. Buka URL `https://...onrender.com` yang diberikan Render. Masukkan `ADMIN_KEY` ke dashboard.
6. Buat link tujuan HTTP/HTTPS. Uji terlebih dahulu dengan situs milik sendiri atau perangkatmu. Penerima akan melihat pemberitahuan tujuan dan persetujuan sebelum IP dicatat.

Panduan Render resmi: https://render.com/docs/blueprint-spec dan https://render.com/docs/web-services

## Uji lokal (opsional)

Memerlukan Node.js versi 20 atau lebih baru.

1. Salin `.env.example` menjadi `.env` lalu ganti `ADMIN_KEY` menjadi string acak panjang.
2. Jalankan `npm install` lalu `npm start`.
3. Buka `http://localhost:3000`.

Alamat localhost tidak dapat dipakai teman dari internet. Untuk akses publik, deploy ke hosting.

## Konfigurasi opsional

- `ADMIN_KEY`: wajib untuk memakai API admin; minimal 24 karakter.
- `BASE_URL`: URL publik HTTPS aplikasi (opsional; isi jika alamat otomatis tidak cocok).
- `PORT`: port server (disediakan hosting secara otomatis).
- `TRUST_PROXY_HOPS`: jumlah proxy tepercaya. Nilai default 1 cocok untuk konfigurasi Render umumnya; ubah sesuai infrastruktur jika diperlukan.

## Batasan dan penggunaan aman

Gunakan hanya dengan pemberitahuan yang jelas dan persetujuan aktif. Jangan menyamarkan tujuan link, jangan mengumpulkan IP secara diam-diam, dan jangan mencoba menyimpulkan identitas/alamat rumah seseorang dari lokasi IP. Untuk penggunaan lebih dari prototipe, tambahkan database persisten, autentikasi yang lebih kuat, kebijakan retensi/penghapusan yang jelas, serta tinjau aturan privasi yang berlaku.
