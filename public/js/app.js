/**
 * Client Application Core Helper
 */

// Sound Synthesizer via Web Audio API
const audioCtx = typeof AudioContext !== 'undefined' ? new AudioContext() : null;

export const SoundEffects = {
  play(type) {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'KEMBALI' || type === 'SUCCESS') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880.00, now + 0.1);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'PINJAM') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      osc.frequency.setValueAtTime(783.99, now + 0.16);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.45);
    } else if (type === 'BERGANTI') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(660, now + 0.12);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(160, now + 0.15);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  }
};

/**
 * Calculate human-readable duration since timestamp
 */
export function formatDuration(timestamp) {
  if (!timestamp) return '-';
  const str = String(timestamp).trim().replace(' ', 'T');
  const start = new Date(str).getTime();
  if (isNaN(start)) return '-';

  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - start) / 1000));

  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);

  if (days > 0) return `${days}h ${hours}j`;
  if (hours > 0) return `${hours}j ${minutes}m`;
  if (minutes > 0) return `${minutes} mnt`;
  return `< 1 mnt`;
}

// Robust Theme Management
export const Theme = {
  init() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    this.updateButton(saved);
  },
  toggle() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    this.updateButton(next);
  },
  updateButton(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      btn.innerHTML = theme === 'dark' 
        ? '<i class="fas fa-sun text-warning"></i>' 
        : '<i class="fas fa-moon text-primary"></i>';
      btn.title = theme === 'dark' ? 'Ganti ke Light Mode' : 'Ganti ke Dark Mode';
    }
    const modalThemeBtn = document.getElementById('modal-nav-theme-toggle');
    if (modalThemeBtn) {
      modalThemeBtn.innerHTML = theme === 'dark'
        ? '<i class="fas fa-sun text-warning me-1"></i><span>Light Mode</span>'
        : '<i class="fas fa-moon text-primary me-1"></i><span>Dark Mode</span>';
      modalThemeBtn.title = theme === 'dark' ? 'Ganti ke Light Mode' : 'Ganti ke Dark Mode';
    }
  }
};

// Initialize theme immediately on script import
Theme.init();

// Register Service Worker for PWA & Mobile Installation
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Auth State
export const Auth = {
  currentUser: null,

  getCurrentUser() {
    if (this.currentUser) return this.currentUser;
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        this.currentUser = JSON.parse(raw);
        return this.currentUser;
      }
    } catch (e) {}
    return null;
  },

  async getUser() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          this.currentUser = data.user;
          localStorage.setItem('user', JSON.stringify(data.user));
          this.renderNavbarUser(data.user);
          return data.user;
        }
      }
    } catch (e) {}
    this.currentUser = null;
    localStorage.removeItem('user');
    this.renderNavbarUser(null);
    return null;
  },

  async checkAuth() {
    const path = window.location.pathname;
    const publicPages = ['/login', '/login.html', '/register', '/register.html', '/screensaver', '/screensaver.html'];
    const isPublic = publicPages.some(p => path === p || path.endsWith(p));

    const user = await this.getUser();
    if (!user && !isPublic) {
      const target = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/login?redirect=${target}`);
      return null;
    }
    if (user && (path === '/login' || path === '/login.html' || path === '/register' || path === '/register.html')) {
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get('redirect') || '/';
      const safeTarget = (redirect.startsWith('/') && !redirect.startsWith('//')) ? redirect : '/';
      window.location.replace(safeTarget);
      return user;
    }
    return user;
  },

  renderNavbarUser(user) {
    const isSuper = user && (user.level === 'super user' || user.level === 'admin');
    
    // Toggle Super-User-only nav links (Bulk Ingestion)
    document.querySelectorAll('.nav-super-user-only, #nav-item-import').forEach(el => {
      el.style.display = isSuper ? '' : 'none';
    });

    const userContainer = document.getElementById('nav-user-container');
    if (!userContainer) return;

    if (user) {
      const badgeLabel = isSuper ? 'Super User' : 'Member';
      const badgeClass = isSuper ? 'bg-danger text-white' : 'bg-secondary bg-opacity-50 text-light';
      userContainer.innerHTML = `
        <div class="dropdown">
          <button class="btn btn-surface dropdown-toggle py-1 px-2 d-flex align-items-center gap-1" data-bs-toggle="dropdown" style="font-size: 11px;">
            <i class="fas ${isSuper ? 'fa-user-shield text-danger' : 'fa-user-circle text-primary'}"></i>
            <span class="fw-bold d-none d-sm-inline">${user.name}</span>
            <span class="badge ${badgeClass}" style="font-size: 9px;"><i class="fas ${isSuper ? 'fa-shield-alt' : 'fa-user'} me-1"></i>${badgeLabel}</span>
          </button>
          <ul class="dropdown-menu dropdown-menu-end shadow">
            <li><h6 class="dropdown-header">${user.email}</h6></li>
            <li><a class="dropdown-item" href="/users"><i class="fas fa-id-card me-2"></i>User Profile & QR</a></li>
            ${isSuper ? '<li><a class="dropdown-item" href="/import"><i class="fas fa-file-import me-2"></i>Bulk Ingestion</a></li>' : ''}
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger" href="javascript:void(0)" id="btn-logout"><i class="fas fa-sign-out-alt me-2"></i>Logout</a></li>
          </ul>
        </div>
      `;
      document.getElementById('btn-logout')?.addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
      });
    } else {
      userContainer.innerHTML = `
        <a href="/login" class="btn btn-primary-custom py-1 px-2" style="font-size: 11px; min-height: 32px;">
          <i class="fas fa-sign-in-alt me-1"></i> Masuk
        </a>
      `;
    }
  },
};

// Giant Visual Alert Box
export function showGiantAlert({ title, message, action = 'PINJAM', duration = 3000 }) {
  SoundEffects.play(action);

  const existing = document.getElementById('giant-alert-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'giant-alert-overlay';
  overlay.className = 'giant-alert-overlay';

  let icon = 'fa-check-circle';
  let badgeColor = 'var(--accent-blue)';
  if (action === 'KEMBALI') {
    icon = 'fa-undo-alt';
    badgeColor = 'var(--accent-green)';
  } else if (action === 'BERGANTI') {
    icon = 'fa-exchange-alt';
    badgeColor = 'var(--accent-amber)';
  } else if (action === 'TIDAK_TERSEDIA') {
    icon = 'fa-times-circle';
    badgeColor = 'var(--accent-red)';
  }

  overlay.innerHTML = `
    <div class="giant-alert-box ${action}">
      <div style="font-size: 2.75rem; color: ${badgeColor}; margin-bottom: 0.5rem;">
        <i class="fas ${icon}"></i>
      </div>
      <h3 class="fw-bold mb-2 text-nowrap" style="font-size: 1.35rem; color: ${badgeColor};">${title || action}</h3>
      <div class="fs-6 text-light mb-3 d-flex flex-wrap justify-content-center align-items-center gap-1" style="line-height: 1.5;">${message}</div>
      <div class="progress" style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
        <div class="progress-bar" style="width: 100%; background: ${badgeColor}; transition: width ${duration}ms linear;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  setTimeout(() => {
    const bar = overlay.querySelector('.progress-bar');
    if (bar) bar.style.width = '0%';
  }, 50);

  setTimeout(() => overlay.remove(), duration);
  overlay.addEventListener('click', () => overlay.remove());
}

// Live WebSocket Client
export function setupWebSocket(onEvent) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  let ws;

  function connect() {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      const dot = document.getElementById('live-connection-dot');
      if (dot) dot.style.display = 'inline-block';
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'CONNECTED') return; // Ignore handshake to prevent double-refresh glitch
        if (onEvent) onEvent(data);
      } catch (e) {}
    };

    ws.onclose = () => {
      const dot = document.getElementById('live-connection-dot');
      if (dot) dot.style.display = 'none';
      setTimeout(connect, 3000);
    };
  }

  connect();
}

// Custom Professional Dialog System (Replacing Native alert/confirm)
export function showCustomAlert({ title = 'Informasi', message = '', type = 'info', confirmText = 'Mengerti' }) {
  return new Promise((resolve) => {
    const modalId = 'custom-alert-modal-' + Date.now();
    const iconHtml = type === 'danger' || type === 'error'
      ? '<i class="fas fa-times-circle text-danger fs-1"></i>'
      : type === 'success'
      ? '<i class="fas fa-check-circle text-success fs-1"></i>'
      : type === 'warning'
      ? '<i class="fas fa-exclamation-triangle text-warning fs-1"></i>'
      : '<i class="fas fa-info-circle text-info fs-1"></i>';

    const modalEl = document.createElement('div');
    modalEl.className = 'modal fade';
    modalEl.id = modalId;
    modalEl.tabIndex = -1;
    modalEl.style.zIndex = '1099';
    modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered" style="max-width: 420px;">
        <div class="modal-content glass-panel border border-${type === 'danger' || type === 'error' ? 'danger' : type === 'success' ? 'success' : 'primary'} shadow-lg" style="background: var(--bg-surface-elevated, #0f172a); border-radius: 16px;">
          <div class="modal-body p-4 text-center">
            <div class="mb-3">${iconHtml}</div>
            <h5 class="fw-bold text-light mb-2">${title}</h5>
            <div class="text-secondary small mb-4">${message}</div>
            <button type="button" class="btn btn-primary-custom px-4 fw-bold btn-ok-alert">${confirmText}</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);
    const bsModal = new bootstrap.Modal(modalEl, { backdrop: 'static' });

    modalEl.querySelector('.btn-ok-alert').addEventListener('click', () => {
      bsModal.hide();
      resolve(true);
    });
    modalEl.addEventListener('hidden.bs.modal', () => {
      modalEl.remove();
    });

    bsModal.show();
  });
}

export function showCustomConfirm({ title = 'Konfirmasi', message = '', type = 'warning', confirmText = 'Lanjutkan', cancelText = 'Batal', confirmColor = 'btn-primary-custom' }) {
  return new Promise((resolve) => {
    const modalId = 'custom-confirm-modal-' + Date.now();
    const iconHtml = type === 'danger'
      ? '<i class="fas fa-exclamation-triangle text-danger fs-1"></i>'
      : type === 'warning'
      ? '<i class="fas fa-question-circle text-warning fs-1"></i>'
      : '<i class="fas fa-info-circle text-info fs-1"></i>';

    const modalEl = document.createElement('div');
    modalEl.className = 'modal fade';
    modalEl.id = modalId;
    modalEl.tabIndex = -1;
    modalEl.style.zIndex = '1099';
    modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered" style="max-width: 440px;">
        <div class="modal-content glass-panel border border-${type === 'danger' ? 'danger' : 'primary'} shadow-lg" style="background: var(--bg-surface-elevated, #0f172a); border-radius: 16px;">
          <div class="modal-body p-4 text-center">
            <div class="mb-3">${iconHtml}</div>
            <h5 class="fw-bold text-light mb-2">${title}</h5>
            <div class="text-secondary small mb-4">${message}</div>
            <div class="d-flex justify-content-center gap-2">
              <button type="button" class="btn btn-surface px-4 btn-cancel-confirm">${cancelText}</button>
              <button type="button" class="btn ${confirmColor} px-4 fw-bold btn-ok-confirm">${confirmText}</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);
    const bsModal = new bootstrap.Modal(modalEl, { backdrop: 'static' });

    modalEl.querySelector('.btn-ok-confirm').addEventListener('click', () => {
      bsModal.hide();
      resolve(true);
    });
    modalEl.querySelector('.btn-cancel-confirm').addEventListener('click', () => {
      bsModal.hide();
      resolve(false);
    });
    modalEl.addEventListener('hidden.bs.modal', () => {
      modalEl.remove();
    });

    bsModal.show();
  });
}

// Universal Multi-Modal Stacking Manager (Guarantees top modals appear above all backdrops & parent modals)
if (typeof document !== 'undefined') {
  document.addEventListener('show.bs.modal', (event) => {
    const openModals = Array.from(document.querySelectorAll('.modal.show')).filter(m => m !== event.target);
    const zIndex = 1060 + (20 * openModals.length);
    event.target.style.setProperty('z-index', zIndex, 'important');
    setTimeout(() => {
      const backdrops = document.querySelectorAll('.modal-backdrop');
      if (backdrops.length > 0) {
        const lastBackdrop = backdrops[backdrops.length - 1];
        lastBackdrop.style.setProperty('z-index', zIndex - 5, 'important');
        if (openModals.length > 0) {
          lastBackdrop.classList.add('modal-stack');
        }
      }
    }, 10);
  });

  document.addEventListener('hidden.bs.modal', () => {
    const openModals = document.querySelectorAll('.modal.show');
    if (openModals.length > 0) {
      document.body.classList.add('modal-open');
    }
  });
}

// Inactivity Timeout & Screensaver Transition (5 Minutes = 300 seconds)
export const InactivityManager = {
  timeoutSeconds: 5 * 60, // 300 seconds
  expireAt: Date.now() + 5 * 60 * 1000,
  intervalId: null,
  lastActivityTime: Date.now(),

  init() {
    const path = window.location.pathname;
    // Do not run timer on screensaver, login, or register pages
    if (path === '/screensaver' || path === '/screensaver.html' || path === '/login' || path === '/login.html' || path === '/register' || path === '/register.html') {
      return;
    }

    this.resetTimer(false);

    // Discrete action events reset timer
    ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
      window.addEventListener(evt, () => this.handleUserActivity(false), { passive: true });
    });

    // Throttled mouse movement so countdown ticks down visibly
    window.addEventListener('mousemove', () => this.handleUserActivity(true), { passive: true });

    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this.tick(), 1000);
    this.updateUI();
  },

  handleUserActivity(isMouseMove = false) {
    const now = Date.now();
    if (isMouseMove && (now - this.lastActivityTime < 15000)) {
      return; // Ignore mouse movement jitter to allow visible countdown
    }
    this.lastActivityTime = now;
    this.resetTimer(true);
  },

  resetTimer(refreshUI = true) {
    this.expireAt = Date.now() + (this.timeoutSeconds * 1000);
    if (refreshUI) this.updateUI();
  },

  tick() {
    const remainingMs = this.expireAt - Date.now();
    if (remainingMs <= 0) {
      this.triggerScreensaver();
    } else {
      this.updateUI();
    }
  },

  updateUI() {
    const pill = document.getElementById('session-countdown-pill');
    const textEl = document.getElementById('session-countdown-text');
    const iconEl = document.getElementById('session-countdown-icon');
    if (!textEl && !pill) return;

    const remainingSec = Math.max(0, Math.ceil((this.expireAt - Date.now()) / 1000));
    const mins = Math.floor(remainingSec / 60).toString().padStart(2, '0');
    const secs = (remainingSec % 60).toString().padStart(2, '0');

    if (textEl) textEl.textContent = `${mins}:${secs}`;
    if (iconEl) iconEl.className = remainingSec <= 60 ? 'fas fa-hourglass-end text-danger' : 'fas fa-stopwatch text-info';

    if (pill) {
      if (remainingSec <= 60) {
        pill.className = 'badge bg-danger bg-opacity-25 border border-danger text-danger d-none d-sm-inline-flex align-items-center gap-1 py-1 px-2 rounded-pill animate-pulse';
        pill.title = `Sesi akan otomatis berakhir dalam ${remainingSec} detik`;
      } else {
        pill.className = 'badge bg-surface border border-secondary text-secondary d-none d-sm-inline-flex align-items-center gap-1 py-1 px-2 rounded-pill';
        pill.title = 'Sisa durasi sesi login sebelum beralih ke Screensaver';
      }
    }
  },

  async triggerScreensaver() {
    if (this.intervalId) clearInterval(this.intervalId);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/screensaver';
  }
};

// Screen WakeLock / KeepAwake Engine
export const KeepAwakeManager = {
  wakeLock: null,
  get enabled() {
    return localStorage.getItem('keepAwake') === 'true';
  },

  async init() {
    this.updateUI();
    if (this.enabled) {
      await this.requestWakeLock();
    }
    document.addEventListener('visibilitychange', async () => {
      if (this.enabled && document.visibilityState === 'visible') {
        await this.requestWakeLock();
      }
    });
    window.addEventListener('storage', (e) => {
      if (e.key === 'keepAwake') {
        this.updateUI();
        if (this.enabled) this.requestWakeLock();
        else this.releaseWakeLock();
      }
    });
  },

  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        if (!this.wakeLock) {
          this.wakeLock = await navigator.wakeLock.request('screen');
          this.wakeLock.addEventListener('release', () => {
            this.wakeLock = null;
          });
        }
      } catch (err) {
        console.warn('Screen WakeLock warning:', err.message);
      }
    }
  },

  async releaseWakeLock() {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
      } catch (err) {}
    }
  },

  async set(enable) {
    const isEnabled = Boolean(enable);
    localStorage.setItem('keepAwake', isEnabled ? 'true' : 'false');
    if (isEnabled) {
      await this.requestWakeLock();
    } else {
      await this.releaseWakeLock();
    }
    this.updateUI();
    InactivityManager.updateUI();
  },

  async toggle(enable) {
    const next = typeof enable === 'boolean' ? enable : !this.enabled;
    await this.set(next);
  },

  updateUI() {
    const active = this.enabled;
    document.querySelectorAll('.keep-awake-switch, #navbar-keep-awake-toggle, #modal-keep-awake-toggle, .keep-awake-checkbox').forEach(input => {
      input.checked = active;
    });
    InactivityManager.updateUI();
  }
};

// Auto-initialize KeepAwakeManager on module load
KeepAwakeManager.init();

// Global delegated change listener for any keep-awake switch
document.addEventListener('change', (e) => {
  if (e.target && (e.target.classList.contains('keep-awake-switch') || e.target.id === 'navbar-keep-awake-toggle' || e.target.id === 'modal-keep-awake-toggle')) {
    KeepAwakeManager.set(e.target.checked);
  }
});

// Global App Navigation Grid Modal (App Launcher)
export function initAppNavModal() {
  if (!document.getElementById('appNavModal')) {
    const currentPath = window.location.pathname;
    const modalHtml = `
      <div class="modal fade" id="appNavModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-md">
          <div class="modal-content border-primary shadow-2xl glass-panel" style="background: var(--bg-surface-elevated, #0f172a); border-radius: 20px; overflow: hidden;">
            <div class="modal-header border-0 pb-0 px-3 pt-3 d-flex justify-content-end align-items-center">
              <!-- Close Modal Button -->
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>

            <div class="modal-body p-3 p-sm-4 pt-1">
              <div class="nav-modal-grid mb-3">
                <a href="/" class="nav-grid-tile ${currentPath === '/' || currentPath === '/index.html' ? 'active' : ''}">
                  <div class="nav-tile-icon text-primary"><i class="fas fa-qrcode"></i></div>
                  <div class="nav-tile-title">Scan Pinjam</div>
                  <div class="nav-tile-desc">Scan Barcode / Transaksi</div>
                </a>
                <a href="/audit" class="nav-grid-tile ${currentPath === '/audit' || currentPath === '/audit.html' ? 'active' : ''}">
                  <div class="nav-tile-icon text-info"><i class="fas fa-clipboard-check"></i></div>
                  <div class="nav-tile-title">Audit Sample</div>
                  <div class="nav-tile-desc">Verifikasi Fisik & Kondisi</div>
                </a>
                <a href="/samples" class="nav-grid-tile ${currentPath === '/samples' || currentPath === '/samples.html' ? 'active' : ''}">
                  <div class="nav-tile-icon text-warning"><i class="fas fa-boxes"></i></div>
                  <div class="nav-tile-title">Database Unit</div>
                  <div class="nav-tile-desc">Master Data Inventaris</div>
                </a>
                <a href="/models" class="nav-grid-tile ${currentPath === '/models' || currentPath === '/models.html' ? 'active' : ''}">
                  <div class="nav-tile-icon text-success"><i class="fas fa-layer-group"></i></div>
                  <div class="nav-tile-title">Card Per-Model</div>
                  <div class="nav-tile-desc">Ringkasan Tiap Tipe Model</div>
                </a>
                <a href="/import" class="nav-grid-tile nav-super-user-only ${currentPath === '/import' || currentPath === '/import.html' ? 'active' : ''}" style="display: none;">
                  <div class="nav-tile-icon text-danger"><i class="fas fa-file-import"></i></div>
                  <div class="nav-tile-title">Bulk Ingestion</div>
                  <div class="nav-tile-desc">Import Data Excel / CSV</div>
                </a>
                <a href="/screensaver" class="nav-grid-tile ${currentPath === '/screensaver' || currentPath === '/screensaver.html' ? 'active' : ''}">
                  <div class="nav-tile-icon" style="color: #c084fc;"><i class="fas fa-tv"></i></div>
                  <div class="nav-tile-title">Screensaver</div>
                  <div class="nav-tile-desc">Display Standby Mode</div>
                </a>
              </div>

              <!-- 50:50 Keep Awake & Darkmode Toggle Below Grid -->
              <div class="row g-2 pt-3 border-top border-secondary">
                <div class="col-6">
                  <div class="keep-awake-container form-check form-switch d-flex align-items-center justify-content-center w-100 py-2 px-2 rounded border border-secondary" style="min-height: 40px; background: var(--bg-surface, #1e293b);" title="Layar Tetap Menyala (Cegah Sleep / Standby)">
                    <input class="form-check-input keep-awake-switch me-2" type="checkbox" id="modal-keep-awake-toggle" ${KeepAwakeManager.enabled ? 'checked' : ''}>
                    <label class="form-check-label user-select-none small fw-bold text-nowrap" for="modal-keep-awake-toggle" style="font-size: 11px;">
                      <i class="fas fa-bolt text-warning me-1"></i>Keep Awake
                    </label>
                  </div>
                </div>
                <div class="col-6">
                  <button type="button" class="btn btn-surface w-100 py-2 d-flex align-items-center justify-content-center gap-1 border border-secondary fw-bold" id="modal-nav-theme-toggle" style="min-height: 40px; font-size: 11px;" title="Ganti Tema">
                    <i class="fas ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'fa-sun text-warning' : 'fa-moon text-primary'} me-1"></i>
                    <span>${document.documentElement.getAttribute('data-theme') === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('modal-nav-theme-toggle')?.addEventListener('click', () => {
      Theme.toggle();
    });
  }

  // Intercept navbar toggler click on mobile/tablet or dedicated launcher buttons
  document.querySelectorAll('#btn-open-nav-modal, #btn-app-launcher, .navbar-toggler, [data-bs-target="#mainNavbar"], [data-bs-target="#appNavModal"]').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const modalEl = document.getElementById('appNavModal');
      if (modalEl) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
      }
    };
  });
}

if (typeof window !== 'undefined') {
  window.customAlert = showCustomAlert;
  window.customConfirm = showCustomConfirm;
}

function bindGlobalEvents() {
  Theme.init();
  Auth.checkAuth();
  InactivityManager.init();
  KeepAwakeManager.init();
  initAppNavModal();
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.onclick = () => Theme.toggle();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindGlobalEvents);
} else {
  bindGlobalEvents();
}

