/* ============================================================
   ULAT PINTAR — Logic Game
   SDN 9 Metro Pusat
   ============================================================
   PENTING: Ganti nilai API_URL di bawah ini dengan URL
   deployment Web App Apps Script kamu (diakhiri "/exec").
   ============================================================ */

var CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbx07-zppRzRInC-KojvrMItwEMGDonGCWr31OcSLvdH-3t6lxtf4-IaxOYE9sNypWVd3A/exec',
  JUMLAH_SOAL: 10,
  LANGKAH_PER_REMAH: 4 // jumlah tekan "Maju" yang dibutuhkan untuk mencapai 1 remah
};

/* Tahapan pertumbuhan ulat: setiap 2 jawaban benar naik 1 tahap.
   "skala" mengatur seberapa besar gambar ulat ditampilkan (ulat yang sama,
   makin besar skalanya) — saat mencapai 10 benar, gambar berganti kupu-kupu. */
var STAGES = [
  { min: 0,  skala: 0.55, label: 'Telur Kecil' },
  { min: 2,  skala: 0.68, label: 'Ulat Mungil' },
  { min: 4,  skala: 0.82, label: 'Ulat Tumbuh' },
  { min: 6,  skala: 0.95, label: 'Ulat Besar' },
  { min: 8,  skala: 1.15, label: 'Ulat Raksasa' },
  { min: 10, skala: 1,    label: 'Kupu-kupu Ceria', kupu: true }
];

var state = {
  nama: '',
  mapel: '',
  kelas: '',
  soal: [],
  index: 0,
  benar: 0,
  salah: 0,
  skor: 0,
  stageAktifIndex: 0,

  // ---- state gerak/track ----
  posisiPercent: 4,      // posisi ulat sekarang (dalam % lebar track)
  remahPositions: [],    // posisi tiap remah (dalam % lebar track)
  langkahTersisa: 0,     // sisa tekan "Maju" untuk sampai ke remah berikutnya
  stepSize: 0,            // besar perpindahan (%) per satu tekan tombol
  modalTerbuka: false
};

/* ================= INIT ================= */

document.addEventListener('DOMContentLoaded', function () {
  renderUlat(document.getElementById('preview-ulat'), getStage_(0), false);
  pasangEvent();
});

function pasangEvent() {
  document.getElementById('btn-mulai').addEventListener('click', mulaiPermainan);
  document.getElementById('btn-main-lagi').addEventListener('click', mainLagi);
  document.getElementById('btn-main-lagi-2').addEventListener('click', mainLagi);
  document.getElementById('btn-lihat-leaderboard').addEventListener('click', function () {
    tampilkanLeaderboard();
  });
  document.getElementById('btn-maju').addEventListener('click', function () { gerakUlat(1); });
  document.getElementById('btn-mundur').addEventListener('click', function () { gerakUlat(-1); });
}

/* ================= API HELPER ================= */

function apiGet(params) {
  var url = CONFIG.API_URL + '?' + new URLSearchParams(params).toString();
  return fetch(url).then(function (res) { return res.json(); });
}

function apiPost(bodyObj) {
  // Content-Type text/plain sengaja dipakai agar browser TIDAK mengirim
  // preflight OPTIONS request (Apps Script tidak menanganinya secara native).
  return fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(bodyObj)
  }).then(function (res) { return res.json(); });
}

/* ================= LAYAR: LOGIN ================= */
/* Dropdown Mata Pelajaran & Kelas sudah statis di index.html (lihat <select>),
   jadi tidak butuh fetch apa pun untuk menampilkannya — halaman login
   langsung berfungsi begitu dibuka, tanpa tergantung status Apps Script. */

function tampilkanErrorLogin(pesan) {
  document.getElementById('login-error').textContent = pesan;
}

function mulaiPermainan() {
  var nama = document.getElementById('input-nama').value.trim();
  var mapel = document.getElementById('select-mapel').value;
  var kelas = document.getElementById('select-kelas').value;

  if (!nama) return tampilkanErrorLogin('Tulis nama kamu dulu ya!');
  if (!mapel) return tampilkanErrorLogin('Pilih mata pelajaran dulu ya!');
  if (!kelas) return tampilkanErrorLogin('Pilih kelas dulu ya!');

  tampilkanErrorLogin('');
  state.nama = nama;
  state.mapel = mapel;
  state.kelas = kelas;

  mulaiSesiBaru();
}

/* ================= SESI GAME: TRACK & GERAK ================= */

function mulaiSesiBaru() {
  apiGet({
    action: 'getSoal',
    mapel: state.mapel,
    kelas: state.kelas,
    jumlah: CONFIG.JUMLAH_SOAL
  }).then(function (data) {
    if (data.error || !data.soal || data.soal.length === 0) {
      tampilkanErrorLogin(data.error || 'Soal belum tersedia untuk pilihan ini.');
      return;
    }
    state.soal = data.soal;
    state.index = 0;
    state.benar = 0;
    state.salah = 0;
    state.skor = 0;
    state.stageAktifIndex = 0;
    state.posisiPercent = 4;
    state.modalTerbuka = false;

    // Sebar posisi remah secara merata di sepanjang track (menyisakan ruang di ujung)
    var total = state.soal.length;
    state.remahPositions = [];
    for (var i = 0; i < total; i++) {
      state.remahPositions.push(8 + (i + 1) * (86 / total));
    }

    pindahLayar('screen-game');
    tutupModalSoal();
    siapkanSegmenBerikutnya();
    gambarTrack();
    updateProgressUI();
  }).catch(function () {
    tampilkanErrorLogin('Gagal memuat soal. Periksa koneksi internet ya.');
  });
}

/** Menghitung ulang berapa % perpindahan per satu tekan tombol untuk segmen (remah) berikutnya. */
function siapkanSegmenBerikutnya() {
  var target = state.remahPositions[state.index];
  state.stepSize = (target - state.posisiPercent) / CONFIG.LANGKAH_PER_REMAH;
  state.langkahTersisa = CONFIG.LANGKAH_PER_REMAH;
  aturTombolGerak(true);
}

function aturTombolGerak(aktif) {
  document.getElementById('btn-maju').disabled = !aktif;
  document.getElementById('btn-mundur').disabled = !aktif;
}

/** Dipanggil saat siswa menekan tombol Maju (arah=1) atau Mundur (arah=-1). */
function gerakUlat(arah) {
  if (state.modalTerbuka || state.index >= state.soal.length) return;

  if (arah > 0) {
    if (state.langkahTersisa <= 0) return;
    state.posisiPercent += state.stepSize;
    state.langkahTersisa--;
  } else {
    if (state.langkahTersisa >= CONFIG.LANGKAH_PER_REMAH) return;
    state.posisiPercent -= state.stepSize;
    state.langkahTersisa++;
  }

  posisikanUlatDiTrack();

  if (arah > 0 && state.langkahTersisa === 0) {
    aturTombolGerak(false);
    setTimeout(makanRemah, 250); // beri jeda singkat agar animasi jalan terlihat dulu
  }
}

/** Ulat sampai di remah: remah "dimakan" (hilang) lalu soal muncul sebagai modal. */
function makanRemah() {
  var elRemah = document.getElementById('remah-' + state.index);
  if (elRemah) elRemah.classList.add('remah--dimakan');
  bukaModalSoal();
}

/* ================= MODAL SOAL ================= */

function bukaModalSoal() {
  var soal = state.soal[state.index];
  state.modalTerbuka = true;

  document.getElementById('teks-soal').textContent = soal.pertanyaan;

  var badge = document.getElementById('feedback-badge');
  badge.textContent = '';
  badge.className = 'feedback-badge';

  var kontainerOpsi = document.getElementById('daftar-opsi');
  kontainerOpsi.innerHTML = '';

  ['A', 'B', 'C', 'D'].forEach(function (huruf) {
    var teksOpsi = soal.opsi[huruf];
    if (!teksOpsi) return;

    var btn = document.createElement('button');
    btn.className = 'opsi-btn';
    btn.innerHTML =
      '<span class="opsi-btn__label">' + huruf + '</span><span>' + escapeHtml(teksOpsi) + '</span>';
    btn.addEventListener('click', function () { pilihJawaban(huruf, btn); });
    kontainerOpsi.appendChild(btn);
  });

  document.getElementById('modal-soal').classList.add('modal-overlay--tampil');
}

function tutupModalSoal() {
  document.getElementById('modal-soal').classList.remove('modal-overlay--tampil');
  state.modalTerbuka = false;
}

function pilihJawaban(huruf, btnDipilih) {
  var semuaBtn = document.querySelectorAll('#daftar-opsi .opsi-btn');
  semuaBtn.forEach(function (b) { b.disabled = true; });

  var soal = state.soal[state.index];

  apiGet({ action: 'checkJawaban', id: soal.id, jawaban: huruf }).then(function (hasil) {
    if (hasil.correct) {
      state.benar++;
      state.skor += hasil.poin || 0;
      btnDipilih.classList.add('benar');
      tampilkanFeedback('Benar! 🎉', true);
    } else {
      state.salah++;
      btnDipilih.classList.add('salah');
      tampilkanFeedback('Yuk coba lagi 💪', false);
    }

    perbaruiUlatJikaPerlu();

    // Penanda benar/salah muncul sebentar, lalu modal tertutup & lanjut ke remah berikutnya.
    setTimeout(function () {
      tutupModalSoal();
      state.index++;
      updateProgressUI();

      if (state.index >= state.soal.length) {
        selesaikanSesi();
      } else {
        siapkanSegmenBerikutnya();
      }
    }, 1100);
  }).catch(function () {
    tampilkanFeedback('Koneksi bermasalah, coba lagi ya.', false);
    semuaBtn.forEach(function (b) { b.disabled = false; });
  });
}

/** Menampilkan penanda benar/salah sebentar, lalu menghilangkannya secara otomatis. */
function tampilkanFeedback(teks, benar) {
  var badge = document.getElementById('feedback-badge');
  badge.textContent = teks;
  badge.className = 'feedback-badge ' + (benar ? 'benar' : 'salah');

  // reflow agar transisi CSS ter-trigger ulang setiap kali dipanggil
  void badge.offsetWidth;
  badge.classList.add('tampil');

  setTimeout(function () {
    badge.classList.remove('tampil');
  }, 850);
}

/* ================= RENDER TRACK & ULAT ================= */

function gambarTrack() {
  var track = document.getElementById('track');
  track.innerHTML = '';

  state.remahPositions.forEach(function (posisi, i) {
    var remah = document.createElement('div');
    remah.className = 'remah';
    remah.id = 'remah-' + i;
    remah.style.left = posisi + '%';
    remah.innerHTML = '<img src="assets/keju.png" alt="keju" />';
    track.appendChild(remah);
  });

  var ulatEl = document.createElement('div');
  ulatEl.className = 'ulat-pejalan';
  ulatEl.id = 'ulat-pejalan';
  track.appendChild(ulatEl);

  renderUlat(ulatEl, getStage_(state.benar), false);
  posisikanUlatDiTrack();
}

function posisikanUlatDiTrack() {
  var ulatEl = document.getElementById('ulat-pejalan');
  if (ulatEl) ulatEl.style.left = state.posisiPercent + '%';
}

function updateProgressUI() {
  var total = state.soal.length;
  var selesai = state.index;
  document.getElementById('progress-label').textContent = 'Soal ' + Math.min(selesai + 1, total) + '/' + total;
  document.getElementById('progress-isi').style.width = Math.round((selesai / total) * 100) + '%';
}

function perbaruiUlatJikaPerlu() {
  var stageBaru = getStage_(state.benar);
  var stageIndexBaru = STAGES.indexOf(stageBaru);
  if (stageIndexBaru !== state.stageAktifIndex) {
    state.stageAktifIndex = stageIndexBaru;
    var ulatEl = document.getElementById('ulat-pejalan');
    if (ulatEl) renderUlat(ulatEl, stageBaru, true);
  }
}

function selesaikanSesi() {
  var stageAkhir = getStage_(state.benar);

  apiPost({
    action: 'submitNilai',
    nama: state.nama,
    mapel: state.mapel,
    kelas: state.kelas,
    benar: state.benar,
    salah: state.salah,
    skor: state.skor,
    tahap: stageAkhir.label
  }).catch(function () { /* tetap lanjut walau pengiriman gagal, akan tetap ditampilkan ke siswa */ });

  document.getElementById('hasil-nama').textContent = state.nama + ' — ' + stageAkhir.label;
  document.getElementById('hasil-benar').textContent = state.benar;
  document.getElementById('hasil-salah').textContent = state.salah;
  document.getElementById('hasil-skor').textContent = state.skor;
  document.getElementById('hasil-judul').textContent =
    stageAkhir.kupu ? 'Ulatmu jadi kupu-kupu! 🦋' : 'Kerja bagus!';

  renderUlat(document.getElementById('hasil-ulat'), stageAkhir, true);
  pindahLayar('screen-result');
}

function mainLagi() {
  mulaiSesiBaru();
}

/* ================= LEADERBOARD ================= */

function tampilkanLeaderboard() {
  document.getElementById('leaderboard-sub').textContent =
    state.mapel + ' — ' + state.kelas;
  var kontainer = document.getElementById('daftar-leaderboard');
  kontainer.innerHTML = '<li class="leaderboard-kosong">Memuat…</li>';

  apiGet({ action: 'getLeaderboard', mapel: state.mapel, kelas: state.kelas })
    .then(function (data) {
      kontainer.innerHTML = '';
      var top = (data && data.top) || [];

      if (top.length === 0) {
        kontainer.innerHTML = '<li class="leaderboard-kosong">Belum ada skor. Jadilah yang pertama!</li>';
        return;
      }

      var medali = ['🥇', '🥈', '🥉'];
      top.forEach(function (item, i) {
        var li = document.createElement('li');
        li.className = 'leaderboard-item';
        li.innerHTML =
          '<span class="leaderboard-item__peringkat">' + medali[i] + '</span>' +
          '<span class="leaderboard-item__nama">' + escapeHtml(item.nama) + '</span>' +
          '<span class="leaderboard-item__skor">' + item.skor + '</span>';
        kontainer.appendChild(li);
      });
    })
    .catch(function () {
      kontainer.innerHTML = '<li class="leaderboard-kosong">Gagal memuat leaderboard.</li>';
    });

  pindahLayar('screen-leaderboard');
}

/* ================= UTIL LAYAR ================= */

function pindahLayar(idTujuan) {
  document.querySelectorAll('.screen').forEach(function (el) {
    el.classList.remove('screen--active');
  });
  document.getElementById(idTujuan).classList.add('screen--active');
}

function escapeHtml(teks) {
  var div = document.createElement('div');
  div.textContent = teks;
  return div.innerHTML;
}

/* ================= ULAT: LOGIC TAHAP & SVG ================= */

function getStage_(jumlahBenar) {
  var hasil = STAGES[0];
  STAGES.forEach(function (s) {
    if (jumlahBenar >= s.min) hasil = s;
  });
  return hasil;
}

function renderUlat(kontainer, stage, animasi) {
  var src = stage.kupu ? 'assets/kupu.png' : 'assets/ulat.png';
  var namaAlt = stage.kupu ? 'Kupu-kupu' : 'Ulat';

  kontainer.innerHTML =
    '<img class="ulat-svg" src="' + src + '" alt="' + namaAlt +
    '" style="width:72px; transform:scale(' + stage.skala + ');" />';

  var el = kontainer.querySelector('img');
  if (animasi && el) {
    el.classList.add(stage.kupu ? 'animasi-kupu' : 'animasi-tumbuh');
  }
}
