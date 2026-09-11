# remark-relgeo Development Plan

Status dokumen: `Active Package Plan`

Tanggal: `2026-07-21`

Dokumen terkait:

1. `README.md`
2. [Markdown Surfaces](https://relgeo.github.io/docs/markdown-surfaces/)
3. [Language Spec](https://relgeo.github.io/docs/language-spec/)

---

## 1. Peran Package

`remark-relgeo` adalah adapter markdown untuk mengubah fenced code `relgeo` menjadi preview atau embed RelGeo.

Package ini menjadi bukti penting dari visi RelGeo:

1. source RelGeo bisa hidup di markdown
2. markdown bisa menampilkan hasil gambar tanpa menampilkan source kedua
3. satu dokumen dapat berisi gambar yang tetap terhubung dengan aturan deklaratifnya

Package ini bukan renderer umum, bukan playground, dan bukan language service.

Ia adalah jembatan dari markdown AST ke runtime RelGeo.

---

## 2. Gambaran Kematangan Yang Ditargetkan

Package ini dianggap matang bila:

1. fenced code `relgeo` konsisten menghasilkan preview-only output
2. integrasi ke site generator umum cukup stabil dan mudah dipakai
3. kegagalan parse atau render tidak merusak seluruh dokumen
4. opsi plugin cukup kecil namun ekspresif
5. boundary terhadap `remark-relgeo-hl` tetap tegas
6. package siap dipublikasikan sendiri sebagai modul ekosistem markdown RelGeo

---

## 3. Boundary Yang Harus Dijaga

### 3.1 Tanggung Jawab

1. mendeteksi fenced code `relgeo`
2. membaca source block dan meta block yang relevan
3. menjalankan compile and render yang dibutuhkan
4. membentuk output AST yang stabil bagi consumer markdown
5. menyediakan fallback aman saat render gagal

### 3.2 Bukan Tanggung Jawab

1. menampilkan source code untuk block `relgeo`
2. menggantikan `remark-relgeo-hl`
3. menyediakan editor interaktif
4. menangani seluruh export production format
5. menentukan semantics bahasa RelGeo

---

## 4. Nilai Produk Yang Harus Dijaga

Paket ini harus menjaga empat hal:

1. preview harus terasa natural di markdown
2. preview harus tetap dekat dengan hasil renderer aktif RelGeo
3. source dan hasil harus dipisah secara niat author
4. consumer luar tidak dipaksa memahami internals runtime untuk memakainya

---

## 5. Sasaran Fungsi

### 5.1 Sasaran Minimum

1. dukung fenced code `relgeo`
2. hasilkan preview SVG atau hasil render setara
3. sertakan wrapper dengan metadata stabil
4. tampilkan placeholder aman saat gagal

### 5.2 Sasaran Menengah

1. dukung meta block yang memang dibutuhkan oleh markdown embed
2. dukung injection renderer atau render hook khusus consumer
3. sediakan opsi output yang cukup lintas framework
4. sediakan error shape yang dapat dibaca consumer

### 5.3 Sasaran Lanjut

1. siap untuk mode embed lebih kaya bila dibutuhkan
2. siap untuk pengendalian asset strategy selain data URI
3. siap menjadi package terpisah yang didokumentasikan publik

---

## 6. Arah Arsitektur

### 6.1 Pipeline Dasar

Pipeline target:

1. detect block `relgeo`
2. parse meta options
3. compile source RelGeo
4. render preview
5. ubah ke AST output yang stabil
6. fallback aman bila ada error

### 6.2 Dependency Shape

Dependency inti saat ini:

1. `relgeo-core`
2. `relgeo-renderer-svg`
3. `unist-util-visit`

Arah yang sehat:

1. runtime compile tetap berasal dari package inti RelGeo
2. plugin ini tidak menyalin logic parser atau renderer
3. kemungkinan dependency ke language service tetap opsional, bukan default

### 6.3 Output Shape

Output jangka dekat yang sehat:

1. output success minimum sesederhana mungkin agar menyatu dengan dokumen consumer
2. bentuk minimum yang sehat untuk success case adalah `div.relgeo-preview__canvas > img.relgeo-preview__image`
3. metadata `data-relgeo-*` tetap minimal
4. fallback error tetap jelas namun tidak memaksakan pola presentasional yang berat

Output jangka menengah:

1. kontrak output bisa disesuaikan tanpa merusak default
2. consumer dapat memilih strategi asset tertentu
3. semantik HTML tetap masuk akal bagi screen reader dan styling
4. setiap layering dekoratif tambahan tetap berada di sisi consumer, bukan dipaksakan sebagai output minimum plugin

---

## 7. Area Kerja Utama

### 7.1 Input Contract

Yang perlu dimatangkan:

1. grammar meta options untuk block `relgeo`
2. daftar opsi yang benar-benar relevan
3. perilaku default jika opsi tidak diisi
4. perilaku saat opsi tidak valid

Contoh opsi yang wajar:

1. `sheet=...`
2. `unit=...`
3. `padding=...`
4. opsi render hook ringan yang memang berguna bagi consumer

### 7.2 Render Strategy

Yang perlu diputuskan lebih tegas:

1. default render tetap SVG
2. default asset strategy awal adalah inline data URI atau AST raw SVG
3. kapan consumer boleh mengambil alih render sepenuhnya
4. bagaimana menangani render yang mahal atau besar

### 7.3 Error Strategy

Yang perlu dimatangkan:

1. bentuk placeholder error
2. informasi error minimum yang aman ditampilkan
3. perbedaan error authoring vs error system
4. mode strict vs lenient bila nanti dibutuhkan

### 7.4 Accessibility and Semantics

Yang perlu dipikirkan:

1. `alt` text default
2. kemungkinan caption atau label dari meta
3. struktur node yang tidak menyalahgunakan `pre` atau `code`
4. perilaku jika preview tidak bisa dirender

### 7.5 Consumer Flexibility

Yang perlu dibuka dengan hati-hati:

1. custom class prefix
2. custom render hook
3. custom asset output mode
4. custom fallback renderer

Tetap perlu dijaga agar API tidak membengkak terlalu cepat.

---

## 8. Rencana Tahapan

### Tahap 1. Contract Closure

Fokus:

1. menegaskan bahwa `relgeo` adalah preview-only
2. menutup tumpang tindih dengan `remark-relgeo-hl`
3. membakukan output wrapper minimal
4. membakukan fallback dasar

Acceptance:

1. tidak ada source code kedua di output
2. docs-site sebagai consumer awal lolos
3. struktur output bisa diuji snapshot

### Tahap 2. Input and Error Hardening

Fokus:

1. mematangkan parser meta options
2. memperjelas error messages
3. membedakan fallback author error vs system failure
4. menguji kombinasi option umum

Acceptance:

1. opsi invalid tidak merusak seluruh halaman
2. output fallback konsisten
3. consumer tahu apa yang gagal tanpa noise berlebihan

### Tahap 3. Output Strategy Hardening

Fokus:

1. putuskan kontrak default output AST
2. siapkan opsi asset strategy yang lebih matang
3. evaluasi kapan inline image cukup dan kapan raw SVG lebih baik
4. pertimbangkan kompatibilitas lintas pipeline remark

Acceptance:

1. output default stabil
2. consumer dapat styling output dengan aman
3. strategi asset tidak terkunci secara prematur

### Tahap 4. Publishable Package Readiness

Fokus:

1. README publik yang akurat
2. contoh penggunaan consumer nyata
3. test matrix dasar
4. package metadata dan export surface yang rapi

Acceptance:

1. package bisa dipahami orang luar tanpa membaca source runtime
2. docs-site bukan satu-satunya referensi penggunaan

---

## 9. Backlog Mendalam

### 9.1 Kontrak API

1. audit ulang nama opsi plugin agar tidak bocor dari kebutuhan internal docs-site
2. tentukan opsi mana yang benar-benar stabil dan mana yang masih experimental
3. dokumentasikan nilai default secara eksplisit
4. jaga agar override tidak mematikan kontrak dasar preview-only

### 9.2 Kontrak HTML or AST

1. tetapkan shape output final yang mudah dibaca consumer
2. pastikan tidak ada wrapper HTML yang semantik-nya menyesatkan
3. tetapkan data attribute yang berguna bagi CSS dan test
4. hindari class naming yang terlalu docs-site specific

### 9.3 Integrasi Runtime

1. audit apakah compile pipeline perlu mode khusus markdown
2. audit biaya render per block
3. pikirkan caching ringan di level consumer bila kelak perlu
4. pertimbangkan dampak render multiple blocks pada build time

### 9.4 Integrasi Ecosystem

1. siapkan jalur ke `rehype` bila nanti dibutuhkan
2. siapkan contoh integrasi Astro, Next MDX, dan unified umum
3. siapkan posisi package ini dalam migrasi multi-repo

---

## 10. Strategy Pengujian

Minimal yang dibutuhkan:

1. unit test deteksi fenced code
2. snapshot test output AST untuk success case
3. snapshot test output AST untuk error case
4. test meta options parsing
5. integration test ringan dengan consumer nyata

Kasus yang harus ditutup:

1. source valid dengan preview sukses
2. source invalid dengan fallback aman
3. custom render hook
4. meta options umum
5. boundary bahwa source tidak ikut tampil

---

## 11. Risiko Yang Harus Diwaspadai

1. package ikut memikul terlalu banyak logika renderer
2. output default docs-site dianggap kontrak universal padahal cuma kebetulan
3. error fallback terlalu miskin atau terlalu bocor
4. API plugin cepat membesar sebelum kebutuhan stabil
5. preview markdown drift dari renderer utama RelGeo

---

## 12. Kriteria Matang

`remark-relgeo` dapat disebut matang bila:

1. niat author `relgeo` selalu terbaca jelas sebagai preview/embed
2. output stabil dan tidak mencampur source dengan hasil
3. package aman dipakai di consumer markdown umum
4. error tidak menjatuhkan keseluruhan dokumen
5. API kecil, jelas, dan cukup

---

## 13. Keputusan Final Saat Ini

Keputusan yang sekarang dianggap cukup stabil untuk package ini:

1. fence aktif tetap `relgeo`
2. package ini bersifat preview-only
3. package ini tidak menampilkan source kedua
4. default runtime tetap bertumpu pada compiler dan renderer RelGeo aktif
5. docs-site adalah consumer awal penting, tetapi bukan penentu tunggal kontrak output
6. output minimum plugin harus cukup ringan agar embed benar-benar menyatu dengan dokumen consumer
7. layering presentasional tambahan bukan bagian dari kontrak minimum plugin

---

## 14. Backlog Dekat

### Sudah Ditutup

1. membakukan output AST atau HTML shape minimum tahap awal sebagai `div.relgeo-preview__canvas > img.relgeo-preview__image`
2. menutup assertion test untuk success, custom render hook, boundary, dan fallback case
3. menguji meta options dasar termasuk default padding `0`
4. merapikan fallback error agar menghasilkan placeholder yang aman
5. merapikan README publik dan menambahkan contoh consumer dasar

### Masih Terbuka

1. memutuskan apakah assertion test perlu dinaikkan menjadi snapshot test setelah output AST stabil lintas consumer

---

## 15. Backlog Nanti

Hal penting yang layak dijaga di radar, tetapi tidak perlu menghambat tahap awal:

1. opsi asset strategy selain inline data URI
2. opsi custom output mode yang lebih kaya
3. accessibility metadata yang lebih lengkap seperti caption atau label dari meta
4. integrasi consumer tambahan selain docs-site
5. perluasan ke companion surface lain bila kebutuhan nyata muncul

---

## 16. Keputusan Praktis Saat Ini

1. fence aktif tetap `relgeo`
2. default fungsi package adalah preview-only
3. source display tetap menjadi tanggung jawab `remark-relgeo-hl`
4. runtime default tetap memanfaatkan compile dan renderer RelGeo aktif
5. docs-site adalah consumer awal, bukan satu-satunya target akhir

---

## 17. Yang Belum Perlu Dipaksakan Sekarang

1. semua format output selain SVG
2. interaktivitas penuh di dalam markdown
3. syntax authoring baru khusus plugin ini
4. opsi plugin yang terlalu kaya sebelum consumer lebih dari satu

Dokumen ini adalah peta pematangan package, bukan komitmen bahwa seluruh backlog harus langsung diimplementasikan.
