/* ============================================================
   ULAT PINTAR — Logic Game
   SDN 9 Metro Pusat
   ============================================================
   PENTING: Ganti nilai API_URL di bawah ini dengan URL
   deployment Web App Apps Script kamu (diakhiri "/exec").
   ============================================================ */

var CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbx07-zppRzRInC-KojvrMItwEMGDonGCWr31OcSLvdH-3t6lxtf4-IaxOYE9sNypWVd3A/exec',
  JUMLAH_SOAL: 10
};

/* Tahapan pertumbuhan ulat: setiap 2 jawaban benar naik 1 tahap. */
var STAGES = [
  { min: 0,  n: 2, warna: '#BFE3A0', label: 'Telur Kecil' },
  { min: 2,  n: 3, warna: '#9ED27A', label: 'Ulat Mungil' },
  { min: 4,  n: 4, warna: '#7CC46B', label: 'Ulat Tumbuh' },
  { min: 6,  n: 5, warna: '#5AA34C', label: 'Ulat Besar' },
  { min: 8,  n: 6, warna: '#4CAF6D', label: 'Ulat Raksasa' },
  { min: 10, n: 0, warna: '',        label: 'Kupu-kupu Ceria', kupu: true }
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
  stageAktifIndex: 0
};

/* ================= INIT ================= */

document.addEventListener('DOMContentLoaded', function () {
  renderUlat(document.getElementById('preview-ulat'), getStage_(0), false);
  muatFilter();
  pasangEvent();
});

function pasangEvent() {
  document.getElementById('btn-mulai').addEventListener('click', mulaiPermainan);
  document.getElementById('btn-main-lagi').addEventListener('click', mainLagi);
  document.getElementById('btn-main-lagi-2').addEventListener('click', mainLagi);
  document.getElementById('btn-lihat-leaderboard').addEventListener('click', function () {
    tampilkanLeaderboard();
  });
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

function muatFilter() {
  apiGet({ action: 'getFilters' }).then(function (data) {
    isiDropdown('select-mapel', data.mapel, 'Pilih mata pelajaran');
    isiDropdown('select-kelas', data.kelas, 'Pilih kelas');
  }).catch(function () {
    tampilkanErrorLogin('Gagal memuat data. Periksa koneksi internet ya.');
  });
}

function isiDropdown(id, daftar, placeholder) {
  var el = document.getElementById(id);
  el.innerHTML = '';
  var opsiKosong = document.createElement('option');
  opsiKosong.value = '';
  opsiKosong.textContent = placeholder;
  el.appendChild(opsiKosong);

  (daftar || []).forEach(function (item) {
    var opt = document.createElement('option');
    opt.value = item;
    opt.textContent = item;
    el.appendChild(opt);
  });
}

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

/* ================= SESI GAME ================= */

function mulaiSesiBaru() {
  document.getElementById('teks-soal').textContent = 'Menyiapkan soal…';
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

    pindahLayar('screen-game');
    renderUlat(document.getElementById('stage-ulat'), getStage_(0), false);
    renderSoal();
  }).catch(function () {
    tampilkanErrorLogin('Gagal memuat soal. Periksa koneksi internet ya.');
  });
}

function renderSoal() {
  if (state.index >= state.soal.length) {
    selesaikanSesi();
    return;
  }

  var soal = state.soal[state.index];
  var totalSoal = state.soal.length;

  document.getElementById('progress-label').textContent =
    'Soal ' + (state.index + 1) + '/' + totalSoal;
  document.getElementById('progress-isi').style.width =
    Math.round((state.index / totalSoal) * 100) + '%';

  document.getElementById('teks-soal').textContent = soal.pertanyaan;

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
      tampilkanFeedback('Benar! 🎉');
    } else {
      state.salah++;
      btnDipilih.classList.add('salah');
      tampilkanFeedback('Yuk coba lagi 💪');
    }

    perbaruiUlatJikaPerlu();

    setTimeout(function () {
      state.index++;
      renderSoal();
    }, 1100);
  }).catch(function () {
    tampilkanFeedback('Koneksi bermasalah, coba lagi ya.');
    semuaBtn.forEach(function (b) { b.disabled = false; });
  });
}

function tampilkanFeedback(teks) {
  var overlay = document.getElementById('feedback-overlay');
  overlay.textContent = teks;
  overlay.classList.remove('feedback-overlay--show');
  // reflow agar animasi bisa diulang
  void overlay.offsetWidth;
  overlay.classList.add('feedback-overlay--show');
}

function perbaruiUlatJikaPerlu() {
  var stageBaru = getStage_(state.benar);
  var stageIndexBaru = STAGES.indexOf(stageBaru);
  if (stageIndexBaru !== state.stageAktifIndex) {
    state.stageAktifIndex = stageIndexBaru;
    renderUlat(document.getElementById('stage-ulat'), stageBaru, true);
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
  kontainer.innerHTML = stage.kupu ? svgKupu_() : svgUlat_(stage.n, stage.warna);
  var svgEl = kontainer.querySelector('svg');
  if (animasi && svgEl) {
    svgEl.classList.add(stage.kupu ? 'animasi-kupu' : 'animasi-tumbuh');
  }
}

/** Membuat SVG ulat sederhana dari beberapa lingkaran (kepala di kanan). */
function svgUlat_(jumlahSegmen, warnaBadan) {
  var r = 17;
  var overlap = 11;
  var lebar = jumlahSegmen * (r * 2 - overlap) + r * 2 + 10;
  var tinggi = r * 2 + 40;
  var lingkaran = '';

  for (var i = 0; i < jumlahSegmen; i++) {
    var radius = Math.max(9, r - i * 1.5);
    var cx = lebar - r - 6 - i * (r * 2 - overlap);
    var cy = tinggi / 2 + (i % 2 === 0 ? 5 : -3);
    lingkaran +=
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius +
      '" fill="' + warnaBadan + '" stroke="#2E4034" stroke-width="1.5" stroke-opacity="0.25"/>';

    // kaki kecil di beberapa segmen tengah
    if (i > 0 && i < jumlahSegmen - 1) {
      lingkaran +=
        '<line x1="' + (cx - 4) + '" y1="' + (cy + radius - 2) + '" x2="' + (cx - 4) +
        '" y2="' + (cy + radius + 6) + '" stroke="#2E4034" stroke-width="2" stroke-linecap="round" stroke-opacity="0.4"/>';
    }
  }

  var headCx = lebar - r - 6;
  var headCy = tinggi / 2 + 5;

  var wajah =
    // antena
    '<line x1="' + (headCx - 6) + '" y1="' + (headCy - r) + '" x2="' + (headCx - 12) + '" y2="' + (headCy - r - 12) +
    '" stroke="#2E4034" stroke-width="2" stroke-linecap="round"/>' +
    '<line x1="' + (headCx + 4) + '" y1="' + (headCy - r) + '" x2="' + (headCx + 10) + '" y2="' + (headCy - r - 12) +
    '" stroke="#2E4034" stroke-width="2" stroke-linecap="round"/>' +
    '<circle cx="' + (headCx - 12) + '" cy="' + (headCy - r - 12) + '" r="3" fill="#FF6F59"/>' +
    '<circle cx="' + (headCx + 10) + '" cy="' + (headCy - r - 12) + '" r="3" fill="#FF6F59"/>' +
    // mata
    '<circle cx="' + (headCx - 5) + '" cy="' + (headCy - 4) + '" r="3.4" fill="#2E4034"/>' +
    '<circle cx="' + (headCx + 6) + '" cy="' + (headCy - 4) + '" r="3.4" fill="#2E4034"/>' +
    // senyum
    '<path d="M ' + (headCx - 5) + ' ' + (headCy + 5) + ' Q ' + headCx + ' ' + (headCy + 10) + ' ' + (headCx + 6) + ' ' + (headCy + 5) +
    '" stroke="#2E4034" stroke-width="2" fill="none" stroke-linecap="round"/>';

  return (
    '<svg class="ulat-svg" width="' + Math.min(lebar, 240) + '" viewBox="0 0 ' + lebar + ' ' + tinggi + '" xmlns="http://www.w3.org/2000/svg">' +
    lingkaran + wajah +
    '</svg>'
  );
}

/** Membuat SVG kupu-kupu sederhana untuk tahap akhir (10/10 benar). */
function svgKupu_() {
  return (
    '<svg class="ulat-svg" width="180" viewBox="0 0 180 140" xmlns="http://www.w3.org/2000/svg">' +
      '<ellipse cx="90" cy="70" rx="4.5" ry="34" fill="#2E4034"/>' +
      '<path d="M90 45 Q40 20 30 55 Q35 85 90 68 Z" fill="#FFC94D" stroke="#2E4034" stroke-width="1.5"/>' +
      '<path d="M90 45 Q140 20 150 55 Q145 85 90 68 Z" fill="#FF9F5A" stroke="#2E4034" stroke-width="1.5"/>' +
      '<path d="M90 70 Q45 60 38 90 Q48 112 90 92 Z" fill="#FF6F59" stroke="#2E4034" stroke-width="1.5"/>' +
      '<path d="M90 70 Q135 60 142 90 Q132 112 90 92 Z" fill="#4CAF6D" stroke="#2E4034" stroke-width="1.5"/>' +
      '<circle cx="90" cy="40" r="7" fill="#2E4034"/>' +
      '<line x1="87" y1="34" x2="80" y2="22" stroke="#2E4034" stroke-width="2" stroke-linecap="round"/>' +
      '<line x1="93" y1="34" x2="100" y2="22" stroke="#2E4034" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>'
  );
}
