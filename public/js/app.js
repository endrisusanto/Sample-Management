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
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    this.updateButton(saved);
  },
  toggle() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
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
  async getUser() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.success && data.user) {
        this.currentUser = data.user;
        this.renderNavbarUser(data.user);
        return data.user;
      }
    } catch (e) {}
    this.currentUser = null;
    this.renderNavbarUser(null);
    return null;
  },
  renderNavbarUser(user) {
    const userContainer = document.getElementById('nav-user-container');
    if (!userContainer) return;

    if (user) {
      const isSuper = user.level === 'super user';
      userContainer.innerHTML = `
        <div class="dropdown">
          <button class="btn btn-surface dropdown-toggle py-1 px-2 d-flex align-items-center gap-1" data-bs-toggle="dropdown" style="font-size: 11px;">
            <i class="fas fa-user-circle text-primary"></i>
            <span class="fw-bold d-none d-sm-inline">${user.name}</span>
            <span class="badge ${isSuper ? 'bg-danger' : 'bg-secondary'}" style="font-size: 9px;">${user.level}</span>
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
          <i class="fas fa-sign-in-alt"></i> Login
        </a>
      `;
    }
  }
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
      <div style="font-size: 3rem; color: ${badgeColor}; margin-bottom: 0.75rem;">
        <i class="fas ${icon}"></i>
      </div>
      <h3 class="fw-bold mb-2" style="font-size: 1.5rem; color: ${badgeColor};">${title || action}</h3>
      <div class="fs-5 text-light mb-3" style="line-height: 1.5;">${message}</div>
      <div class="progress" style="height: 5px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
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

if (typeof window !== 'undefined') {
  window.customAlert = showCustomAlert;
  window.customConfirm = showCustomConfirm;
}

function bindGlobalEvents() {
  Theme.init();
  Auth.getUser();
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

