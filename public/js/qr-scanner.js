/**
 * 📷 Responsive QR & Barcode Camera Scanner Engine
 * Uses html5-qrcode library for real-time 1D Barcode & 2D QR decoding
 */

import { SoundEffects } from '/js/app.js';

let html5QrCode = null;
let currentModal = null;

async function ensureLibraryLoaded() {
  if (window.Html5Qrcode) return;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Gagal memuat library scanner kamera'));
    document.head.appendChild(script);
  });
}

export class QRScannerModal {
  /**
   * Open the responsive scanner modal
   * @param {Object} options
   * @param {Function} options.onScan Callback when a code is recognized
   * @param {string} [options.title] Title for the modal
   */
  static async open({ onScan, title = 'Pindai QR Code / Barcode' }) {
    await ensureLibraryLoaded();

    let modalEl = document.getElementById('cameraQRScannerModal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'cameraQRScannerModal';
      modalEl.className = 'modal fade';
      modalEl.tabIndex = -1;
      modalEl.setAttribute('aria-hidden', 'true');
      modalEl.setAttribute('data-bs-backdrop', 'static');

      modalEl.innerHTML = `
        <div class="modal-dialog modal-dialog-centered" style="max-width: 480px;">
          <div class="modal-content border-info shadow-lg" style="background: var(--bg-surface-elevated, #0f172a); border-radius: 16px;">
            <div class="modal-header border-0 pb-1">
              <h5 class="modal-title text-info fw-bold fs-6" id="qrScannerTitle">
                <i class="fas fa-qrcode me-2"></i> ${title}
              </h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" id="btn-close-qr-scanner"></button>
            </div>
            <div class="modal-body p-3">
              <div class="scanner-viewport-wrapper position-relative mx-auto rounded overflow-hidden mb-2" style="background: #000; min-height: 280px;">
                <div id="qr-reader-viewport" style="width: 100%;"></div>
                
                <!-- Laser Scanning Animation Line -->
                <div class="laser-scanner-line" style="
                  position: absolute;
                  left: 5%;
                  right: 5%;
                  height: 2px;
                  background: #00f0ff;
                  box-shadow: 0 0 12px #00f0ff, 0 0 24px #00f0ff;
                  pointer-events: none;
                  animation: laserScan 2s infinite ease-in-out;
                  z-index: 10;
                "></div>
              </div>

              <!-- Scanner Helper Info (Responsive, Non-centered, legible) -->
              <div class="d-flex justify-content-between align-items-center bg-dark bg-opacity-50 p-2 rounded border border-secondary mb-2 small" style="font-size: 11px;">
                <span class="text-secondary text-start">
                  <i class="fas fa-bullseye text-info me-1"></i> Arahkan kamera ke QR / Barcode Asset
                </span>
                <span class="badge bg-success bg-opacity-25 text-success border border-success" id="qr-scanner-live-badge">
                  <i class="fas fa-circle fa-xs me-1"></i> LIVE
                </span>
              </div>

              <div id="qr-scanner-result-hint" class="text-start small text-warning py-1 font-monospace" style="font-size: 12px; min-height: 22px;"></div>
            </div>
            <div class="modal-footer border-0 pt-0">
              <button type="button" class="btn btn-surface w-100 py-2" data-bs-dismiss="modal">
                <i class="fas fa-times me-1"></i> Tutup Scanner
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modalEl);

      // Inject Laser Animation Style if not present
      if (!document.getElementById('scanner-laser-style')) {
        const style = document.createElement('style');
        style.id = 'scanner-laser-style';
        style.textContent = `
          @keyframes laserScan {
            0% { top: 15%; opacity: 0.9; }
            50% { top: 85%; opacity: 1; }
            100% { top: 15%; opacity: 0.9; }
          }
          #qr-reader-viewport video {
            border-radius: 8px;
            object-fit: cover !important;
            width: 100% !important;
          }
        `;
        document.head.appendChild(style);
      }
    }

    document.getElementById('qrScannerTitle').innerHTML = `<i class="fas fa-qrcode me-2"></i> ${title}`;
    const resultHint = document.getElementById('qr-scanner-result-hint');
    resultHint.textContent = '';

    currentModal = new bootstrap.Modal(modalEl);
    currentModal.show();

    // Start Camera Scanner
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode('qr-reader-viewport');
    }

    const config = {
      fps: 15,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        return {
          width: Math.floor(minEdge * 0.85),
          height: Math.floor(minEdge * 0.65)
        };
      },
      aspectRatio: 1.333334,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    };

    let isHandled = false;

    try {
      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          if (isHandled) return;
          isHandled = true;

          SoundEffects.play('SUCCESS');
          resultHint.innerHTML = `✅ Terbaca: <strong>${decodedText}</strong>`;

          setTimeout(async () => {
            await QRScannerModal.close();
            if (typeof onScan === 'function') {
              onScan(decodedText.trim());
            }
          }, 350);
        },
        (error) => {
          // ignore scan frame misses
        }
      );
    } catch (err) {
      resultHint.innerHTML = `❌ Gagal membuka kamera: ${err.message || err}`;
    }

    modalEl.addEventListener('hidden.bs.modal', async () => {
      await QRScannerModal.close();
    }, { once: true });
  }

  static async close() {
    if (html5QrCode && html5QrCode.isScanning) {
      try {
        await html5QrCode.stop();
      } catch (e) {}
    }
    if (currentModal) {
      try {
        currentModal.hide();
      } catch (e) {}
      currentModal = null;
    }
  }
}
