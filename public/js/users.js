import { Auth, showGiantAlert, setupWebSocket, SoundEffects, showCustomAlert, showCustomConfirm } from '/js/app.js';
import { FaceEngine } from '/js/face-engine.js';
import { BiometricAuth } from '/js/biometric-auth.js';

const usersGrid = document.getElementById('users-grid');
const badgeModal = new bootstrap.Modal(document.getElementById('qrBadgeModal'));
const userModal = new bootstrap.Modal(document.getElementById('userFormModal'));
const resetDbModal = new bootstrap.Modal(document.getElementById('resetDbModal'));
const registerFaceModal = new bootstrap.Modal(document.getElementById('registerFaceModal'));
const registerFingerprintModal = new bootstrap.Modal(document.getElementById('registerFingerprintModal'));
const faceEngine = new FaceEngine('reg-face-video');
const userForm = document.getElementById('user-form');
const resetDbForm = document.getElementById('reset-db-form');
let currentUser = null;
let targetFaceUserId = null;
let targetFingerprintUser = null;

async function loadUsers() {
  try {
    currentUser = await Auth.getUser() || Auth.getCurrentUser();
    const isSuper = currentUser && (currentUser.level === 'super user' || currentUser.level === 'admin');

    // Toggle Super-User-only toolbar buttons
    const resetDbBtn = document.getElementById('btn-reset-db');
    const addUserBtn = document.getElementById('btn-add-user');
    if (resetDbBtn) resetDbBtn.style.display = isSuper ? 'inline-flex' : 'none';
    if (addUserBtn) addUserBtn.style.display = isSuper ? 'inline-flex' : 'none';

    const res = await fetch('/api/auth/users');
    const data = await res.json();

    if (!data.success) {
      usersGrid.innerHTML = `
        <div class="col-12 text-center py-5">
          <div class="glass-panel d-inline-block p-4">
            <i class="fas fa-lock text-warning fs-2 mb-2"></i>
            <h5 class="fw-bold">Akses Terbatas</h5>
            <p class="text-secondary small mb-3">Silakan login untuk melihat daftar pengguna, mengelola profil, dan mencetak badge.</p>
            <a href="/login" class="btn btn-primary-custom"><i class="fas fa-sign-in-alt me-1"></i> Menuju Halaman Login</a>
          </div>
        </div>
      `;
      return;
    }

    const users = data.users || [];
    if (users.length === 0) {
      usersGrid.innerHTML = '<div class="col-12 text-center py-5 text-muted">Belum ada data user terdaftar.</div>';
      return;
    }

    usersGrid.innerHTML = users.map(u => {
      const isMe = currentUser && currentUser.id === u.id;
      const isSuperUser = u.level === 'super user' || u.level === 'admin';
      const badgeHtml = isSuperUser
        ? `<span class="badge bg-danger bg-opacity-25 text-danger border border-danger text-uppercase px-2 py-1" style="font-size: 10px;"><i class="fas fa-shield-alt me-1"></i>Super User</span>`
        : `<span class="badge bg-secondary bg-opacity-25 text-secondary border border-secondary text-uppercase px-2 py-1" style="font-size: 10px;"><i class="fas fa-user me-1"></i>Member</span>`;
      const iconClass = isSuperUser ? 'fas fa-user-shield text-danger' : 'fas fa-user-circle text-secondary';
      const qrUrl = `/api/qr?text=${encodeURIComponent(u.name)}&width=200`;

      return `
        <div class="col-md-6 col-lg-4">
          <div class="glass-panel p-3 h-100 d-flex flex-column justify-content-between border ${isSuperUser ? 'border-danger border-opacity-50' : 'border-secondary border-opacity-25'}">
            <div>
              <div class="d-flex justify-content-between align-items-start mb-2">
                ${badgeHtml}
                <i class="${iconClass} fs-4"></i>
              </div>
              <h5 class="fw-bold text-light mb-1" style="font-size: 13px;">${u.name}</h5>
              <p class="text-secondary small mb-2"><i class="far fa-envelope me-1"></i>${u.email}</p>
            </div>

            <div class="text-center p-2 bg-white rounded my-2 d-inline-block align-self-center shadow-sm">
              <img src="${qrUrl}" alt="QR Badge" style="width: 120px; height: 120px;">
              <div class="text-dark fw-bold small mt-1" style="font-size: 11px;">${u.name}</div>
            </div>

            <div class="d-flex flex-column gap-2 mt-2">
              <div class="btn-group w-100">
                <button class="btn btn-surface btn-view-badge py-1" 
                        data-name="${u.name}" data-email="${u.email}" data-level="${u.level}" data-qr="${qrUrl}" style="font-size: 11px;">
                  <i class="fas fa-qrcode me-1 text-primary"></i> Badge
                </button>
                <button class="btn btn-surface btn-register-face py-1 ${u.face_descriptor ? 'text-success' : 'text-info'}"
                        data-id="${u.id}" data-name="${u.name}" title="Daftarkan Biometrik Wajah" style="font-size: 11px;">
                  <i class="fas fa-camera me-1"></i> ${u.face_descriptor ? 'Face ID ✅' : 'Face ID'}
                </button>
                <button class="btn btn-surface btn-register-fingerprint py-1 text-warning"
                        data-id="${u.id}" data-name="${u.name}" data-email="${u.email}" title="Daftarkan Sensor Sidik Jari / Passkey Perangkat" style="font-size: 11px;">
                  <i class="fas fa-fingerprint me-1"></i> Sidik Jari
                </button>
              </div>

              ${isSuper ? `
                <div class="btn-group w-100">
                  <button class="btn btn-surface btn-edit-user py-1" 
                          data-id="${u.id}" data-name="${u.name}" data-email="${u.email}" data-level="${u.level}">
                    <i class="fas fa-edit text-warning me-1"></i> Edit
                  </button>
                  <button class="btn btn-surface text-danger btn-delete-user py-1" 
                          data-id="${u.id}" data-name="${u.name}" ${isMe ? 'disabled title="Tidak dapat menghapus akun sendiri"' : ''}>
                    <i class="fas fa-trash me-1"></i> Hapus
                  </button>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Wire event listeners
    document.querySelectorAll('.btn-view-badge').forEach(b => {
      b.addEventListener('click', () => {
        const { name, email, level, qr } = b.dataset;
        showBadgeModal({ name, email, level }, qr);
      });
    });

    document.querySelectorAll('.btn-register-face').forEach(b => {
      b.addEventListener('click', async () => {
        const { id, name } = b.dataset;
        targetFaceUserId = id;
        document.getElementById('reg-face-user-name').textContent = name;
        registerFaceModal.show();
        
        const statusEl = document.getElementById('reg-face-status');
        statusEl.className = 'alert alert-info py-2 px-3 small mb-3';
        statusEl.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Mengaktifkan kamera...';

        try {
          await faceEngine.startCamera('user');
          statusEl.innerHTML = '<i class="fas fa-user-check text-success me-1"></i> Kamera aktif. Posisikan wajah di lingkaran lalu klik Simpan.';
        } catch (err) {
          statusEl.className = 'alert alert-danger py-2 px-3 small mb-3';
          statusEl.innerHTML = '❌ ' + err.message;
        }
      });
    });

    document.querySelectorAll('.btn-register-fingerprint').forEach(b => {
      b.addEventListener('click', () => {
        const { id, name, email } = b.dataset;
        targetFingerprintUser = { id, name, email };
        document.getElementById('reg-fingerprint-user-name').textContent = name;
        
        const statusEl = document.getElementById('reg-fingerprint-status');
        statusEl.className = 'alert alert-warning py-2 px-3 small mb-3';
        statusEl.innerHTML = '<i class="fas fa-info-circle me-1"></i> Siap merekam sidik jari. Klik tombol di bawah lalu sentuh sensor biometrik perangkat Anda.';
        
        const btnStart = document.getElementById('btn-start-fingerprint-reg');
        btnStart.disabled = false;
        btnStart.innerHTML = '<i class="fas fa-fingerprint me-1"></i> Mulai Perekaman Sidik Jari';

        registerFingerprintModal.show();
      });
    });

    document.querySelectorAll('.btn-edit-user').forEach(b => {
      b.addEventListener('click', () => {
        const { id, name, email, level } = b.dataset;
        openEditUser({ id, name, email, level });
      });
    });

    document.querySelectorAll('.btn-delete-user').forEach(b => {
      b.addEventListener('click', () => {
        const { id, name } = b.dataset;
        deleteUser(id, name);
      });
    });

  } catch (e) {
    console.error(e);
    usersGrid.innerHTML = `<div class="col-12 text-center py-5 text-danger">Gagal memuat pengguna: ${e.message}</div>`;
  }
}

document.getElementById('btn-start-fingerprint-reg').addEventListener('click', async () => {
  if (!targetFingerprintUser) return;
  const btn = document.getElementById('btn-start-fingerprint-reg');
  const statusEl = document.getElementById('reg-fingerprint-status');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Menunggu Sentuhan Sensor...';
  statusEl.className = 'alert alert-primary py-2 px-3 small mb-3';
  statusEl.innerHTML = '<i class="fas fa-hand-pointer text-warning me-1"></i> Sentuh sensor sidik jari / pemindai biometrik pada perangkat Anda sekarang.';

  try {
    const res = await BiometricAuth.registerFingerprint({
      userId: targetFingerprintUser.id,
      userName: targetFingerprintUser.name,
      userEmail: targetFingerprintUser.email
    });

    SoundEffects.play('SUCCESS');
    statusEl.className = 'alert alert-success py-2 px-3 small mb-3';
    statusEl.innerHTML = '✅ <strong>Sidik Jari Berhasil Terdaftar!</strong>';

    setTimeout(() => {
      registerFingerprintModal.hide();
      loadUsers();
    }, 1200);
  } catch (err) {
    SoundEffects.play('ERROR');
    statusEl.className = 'alert alert-danger py-2 px-3 small mb-3';
    statusEl.innerHTML = '❌ ' + err.message;
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-redo me-1"></i> Coba Rekam Ulang';
  }
});

document.getElementById('btn-close-reg-face').addEventListener('click', () => {
  faceEngine.stopCamera();
});

document.getElementById('btn-save-face-reg').addEventListener('click', async () => {
  const btn = document.getElementById('btn-save-face-reg');
  const statusEl = document.getElementById('reg-face-status');
  btn.disabled = true;
  statusEl.className = 'alert alert-primary py-2 px-3 small mb-3';
  statusEl.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Merekam biometrik wajah...';

  try {
    const result = faceEngine.extractFaceDescriptor();
    if (!result) throw new Error('Wajah tidak terdeteksi pada kamera.');

    const res = await fetch('/api/auth/register-face', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: targetFaceUserId,
        faceDescriptor: result.descriptor,
        facePhoto: result.photo
      })
    });
    const data = await res.json();

    if (data.success) {
      statusEl.className = 'alert alert-success py-2 px-3 small mb-3';
      statusEl.innerHTML = '✅ <strong>Biometrik Wajah Berhasil Disimpan!</strong>';
      setTimeout(() => {
        faceEngine.stopCamera();
        registerFaceModal.hide();
        loadUsers();
      }, 1200);
    } else {
      statusEl.className = 'alert alert-danger py-2 px-3 small mb-3';
      statusEl.innerHTML = '❌ ' + (data.message || 'Gagal menyimpan wajah');
    }
  } catch (err) {
    statusEl.className = 'alert alert-danger py-2 px-3 small mb-3';
    statusEl.innerHTML = '❌ ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

function showBadgeModal(user, qrUrl) {
  const isSuperUser = user.level === 'super user' || user.level === 'admin';
  const badgeLabel = isSuperUser ? 'SUPER USER' : 'MEMBER';
  const badgeBg = isSuperUser ? 'bg-danger' : 'bg-secondary';

  document.getElementById('badgeModalBody').innerHTML = `
    <div class="p-4 bg-white text-dark rounded-4 shadow d-inline-block border">
      <div class="text-primary fw-bold mb-1" style="font-size: 0.85rem;">PE SOLUTION / SEIN-P</div>
      <h4 class="fw-bold text-dark mb-1">${user.name}</h4>
      <div class="text-muted small mb-3">${user.email} | <span class="badge ${badgeBg}">${badgeLabel}</span></div>
      <img src="${qrUrl}" style="width: 200px; height: 200px;" class="mb-2 rounded">
      <div class="text-muted small">Scan QR ini pada form scanner peminjaman</div>
    </div>
  `;

  document.getElementById('btn-print-badge').onclick = () => {
    const win = window.open('', '_blank');
    if (!win) return alert('Pop-up terblokir. Izinkan pop-up untuk mencetak badge.');
    
    const doc = win.document;
    doc.open();
    doc.write('<html><head><title>Print Badge - ' + user.name + '</title></head>');
    doc.write('<body style="text-align:center; padding: 40px; font-family: sans-serif;">');
    doc.write('<div style="border: 2px solid #333; padding: 30px; display: inline-block; border-radius: 12px;">');
    doc.write('<h3>PE SOLUTION / SEIN-P</h3>');
    doc.write('<h2>' + user.name + '</h2>');
    doc.write('<p>' + user.email + ' - <strong>' + badgeLabel + '</strong></p>');
    doc.write('<img src="' + qrUrl + '" style="width: 220px; height: 220px;">');
    doc.write('</div></body></html>');
    doc.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  badgeModal.show();
}

function openEditUser(user) {
  document.getElementById('form-user-id').value = user.id;
  document.getElementById('form-name').value = user.name;
  document.getElementById('form-email').value = user.email;
  document.getElementById('form-password').value = '';
  document.getElementById('form-password').required = false;
  document.getElementById('password-hint').textContent = '(Kosongkan jika tidak ingin mengubah password)';
  document.getElementById('form-level').value = user.level;
  document.getElementById('userFormTitle').textContent = `Edit User: ${user.name}`;
  userModal.show();
}

async function deleteUser(id, name) {
  const ok = await showCustomConfirm({
    title: 'Hapus User',
    message: `Apakah Anda yakin ingin menghapus user <strong>"${name}"</strong> dari sistem?`,
    type: 'danger',
    confirmText: 'Ya, Hapus',
    confirmColor: 'btn-danger'
  });
  if (!ok) return;

  try {
    const res = await fetch(`/api/auth/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showGiantAlert({
        title: 'USER DIHAPUS',
        message: `User ${name} berhasil dihapus dari sistem.`,
        action: 'SUCCESS',
        duration: 3000
      });
      loadUsers();
    } else {
      await showCustomAlert({
        title: 'Gagal Menghapus',
        message: data.message || 'Gagal menghapus user',
        type: 'danger'
      });
    }
  } catch (err) {
    await showCustomAlert({
      title: 'Error',
      message: 'Gagal menghapus user: ' + err.message,
      type: 'danger'
    });
  }
}

document.getElementById('btn-add-user').addEventListener('click', () => {
  userForm.reset();
  document.getElementById('form-user-id').value = '';
  document.getElementById('form-password').required = true;
  document.getElementById('password-hint').textContent = '(Wajib untuk user baru)';
  document.getElementById('userFormTitle').textContent = 'Registrasi User Baru';
  userModal.show();
});

userForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('form-user-id').value;
  const payload = {
    name: document.getElementById('form-name').value.trim(),
    email: document.getElementById('form-email').value.trim(),
    level: document.getElementById('form-level').value
  };
  const password = document.getElementById('form-password').value;
  if (password) payload.password = password;

  try {
    const url = id ? `/api/auth/users/${id}` : '/api/auth/users';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      userModal.hide();
      showGiantAlert({
        title: 'USER DISIMPAN',
        message: `Data user ${payload.name} berhasil disimpan.`,
        action: 'SUCCESS',
        duration: 3000
      });
      loadUsers();
    } else {
      await showCustomAlert({
        title: 'Gagal Menyimpan',
        message: data.message || 'Gagal menyimpan data user',
        type: 'danger'
      });
    }
  } catch (err) {
    await showCustomAlert({
      title: 'Error',
      message: err.message,
      type: 'danger'
    });
  }
});

// Open Reset Database Modal
document.getElementById('btn-reset-db').addEventListener('click', () => {
  resetDbModal.show();
});

// Mutual exclusivity for sample options
document.getElementById('check-delete-samples').addEventListener('change', (e) => {
  if (e.target.checked) document.getElementById('check-reload-samples').checked = false;
});
document.getElementById('check-reload-samples').addEventListener('change', (e) => {
  if (e.target.checked) document.getElementById('check-delete-samples').checked = false;
});

// Execute Reset Database with Checklists
resetDbForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const delete_all_samples = document.getElementById('check-delete-samples').checked;
  const reload_default_samples = document.getElementById('check-reload-samples').checked;
  const clear_flow = document.getElementById('check-reset-history').checked;
  const reset_status = document.getElementById('check-reset-status').checked;
  const reset_users = document.getElementById('check-reset-users').checked;

  if (!delete_all_samples && !reload_default_samples && !clear_flow && !reset_status && !reset_users) {
    await showCustomAlert({
      title: 'Perhatian',
      message: 'Silakan pilih minimal 1 opsi checklist untuk di-reset!',
      type: 'warning'
    });
    return;
  }

  let warnMessage = 'Apakah Anda yakin ingin melanjutkan proses reset database sesuai checklist yang dipilih?';
  if (delete_all_samples) {
    warnMessage = '⚠️ <strong>PERINGATAN KRUSIAL:</strong><br>Anda memilih <strong>HAPUS BERSIH SELURUH DATA MASTER SAMPLE</strong>.<br>Seluruh data device akan dihapus menjadi 0.<br><br>Lanjutkan proses penghapusan?';
  }

  const ok = await showCustomConfirm({
    title: 'Konfirmasi Reset Database',
    message: warnMessage,
    type: 'danger',
    confirmText: 'Ya, Eksekusi Reset',
    confirmColor: 'btn-danger'
  });
  if (!ok) return;

  const btnExec = document.getElementById('btn-execute-reset-db');
  btnExec.disabled = true;
  btnExec.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Memproses Reset...';

  try {
    const res = await fetch('/api/database/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        delete_all_samples,
        reload_default_samples,
        clear_flow,
        reset_status,
        reset_users
      })
    });
    const result = await res.json();

    if (result.success) {
      resetDbModal.hide();
      showGiantAlert({
        title: 'RESET DATABASE BERHASIL',
        message: result.message,
        action: 'SUCCESS',
        duration: 4000
      });
      loadUsers();
    } else {
      await showCustomAlert({
        title: 'Gagal Reset Database',
        message: result.message || 'Gagal reset database (Akses Super User Diperlukan)',
        type: 'danger'
      });
    }
  } catch (err) {
    await showCustomAlert({
      title: 'Error',
      message: 'Gagal me-reset database: ' + err.message,
      type: 'danger'
    });
  } finally {
    btnExec.disabled = false;
    btnExec.innerHTML = '<i class="fas fa-trash-restore me-1"></i> Eksekusi Reset Terpilih';
  }
});

setupWebSocket((event) => {
  if (event.type === 'DATABASE_RESET') {
    loadUsers();
  }
});

loadUsers();
