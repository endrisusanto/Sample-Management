/**
 * 📷 Responsive QR & Barcode Camera Scanner Engine
 * Defaults to Front Camera (Mirrored) with 1-tap Camera Switcher (Front/Back/USB)
 */

import { SoundEffects } from '/js/app.js';

let html5QrCode = null;
let currentModal = null;
let currentFacingMode = localStorage.getItem('preferred_scanner_camera') || 'user'; // 'user' (front) or 'environment' (back)
let availableCameras = [];
let activeCameraId = null;

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
            <div class="modal-header border-0 pb-1 d-flex justify-content-between align-items-center">
              <h5 class="modal-title text-info fw-bold fs-6 mb-0" id="qrScannerTitle">
                <i class="fas fa-qrcode me-2"></i> ${title}
              </h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" id="btn-close-qr-scanner"></button>
            </div>

            <!-- Camera Switch & Options Bar -->
            <div class="px-3 pt-2 pb-1 d-flex justify-content-between align-items-center gap-2">
              <div class="d-flex align-items-center gap-1">
                <button type="button" class="btn btn-surface btn-sm py-1 px-2 text-info" id="btn-toggle-camera-facing" title="Ganti Kamera Depan / Belakang">
                  <i class="fas fa-camera-rotate me-1"></i>
                  <span id="label-camera-facing" style="font-size: 11px;">Kamera Depan (Mirror)</span>
                </button>
              </div>

              <!-- Camera Select Dropdown (for devices with multiple lenses) -->
              <select id="select-camera-device" class="form-select form-select-sm bg-dark text-light border-secondary py-1" style="max-width: 170px; font-size: 11px;">
                <option value="user">Kamera Depan</option>
                <option value="environment">Kamera Belakang</option>
              </select>
            </div>

            <div class="modal-body p-3 pt-2">
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

              <!-- Scanner Helper Info -->
              <div class="d-flex justify-content-between align-items-center bg-dark bg-opacity-50 p-2 rounded border border-secondary mb-2 small" style="font-size: 11px;">
                <span class="text-secondary text-start" id="qr-scan-guide-text">
                  <i class="fas fa-bullseye text-info me-1"></i> Arahkan barcode / QR ke kamera depan
                </span>
                <span class="badge bg-success bg-opacity-25 text-success border border-success" id="qr-scanner-live-badge">
                  <i class="fas fa-circle fa-xs me-1"></i> LIVE
                </span>
              </div>

              <div id="qr-scanner-result-hint" class="text-start small text-warning py-1 font-monospace" style="font-size: 12px; min-height: 22px;"></div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modalEl);

      // Inject Laser Animation and Mirror Styles
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
            transition: transform 0.2s ease;
          }
          /* Front camera mirror mode */
          .camera-mode-front #qr-reader-viewport video {
            transform: scaleX(-1) !important;
          }
          /* Back camera normal mode */
          .camera-mode-back #qr-reader-viewport video {
            transform: scaleX(1) !important;
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

    // Enumerate Available Camera Devices
    try {
      availableCameras = await Html5Qrcode.getCameras();
      const selectEl = document.getElementById('select-camera-device');
      if (availableCameras && availableCameras.length > 0) {
        selectEl.innerHTML = availableCameras.map((cam, idx) => {
          const isFront = cam.label.toLowerCase().includes('front') || cam.label.toLowerCase().includes('user') || cam.label.toLowerCase().includes('depan');
          const isBack = cam.label.toLowerCase().includes('back') || cam.label.toLowerCase().includes('rear') || cam.label.toLowerCase().includes('belakang');
          const name = cam.label || `Kamera ${idx + 1}`;
          const label = isFront ? `📷 Depan: ${name}` : (isBack ? `📷 Belakang: ${name}` : `📷 ${name}`);
          return `<option value="${cam.id}">${label}</option>`;
        }).join('');
      }
    } catch (e) {
      console.warn('Could not list cameras:', e);
    }

    // Function to start camera scanning with specified camera or facingMode
    const startScanner = async (cameraConfig) => {
      if (html5QrCode && html5QrCode.isScanning) {
        try {
          await html5QrCode.stop();
        } catch (e) {}
      }

      if (!html5QrCode) {
        html5QrCode = new Html5Qrcode('qr-reader-viewport');
      }

      // Update Mirror CSS Class on viewport wrapper
      const isFront = (typeof cameraConfig === 'object' && cameraConfig.facingMode === 'user') ||
                      (typeof cameraConfig === 'string' && currentFacingMode === 'user');
      
      modalEl.classList.toggle('camera-mode-front', isFront);
      modalEl.classList.toggle('camera-mode-back', !isFront);

      const labelFacing = document.getElementById('label-camera-facing');
      if (labelFacing) {
        labelFacing.textContent = isFront ? 'Kamera Depan (Mirror)' : 'Kamera Belakang';
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
          cameraConfig,
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
            // ignore frame misses
          }
        );
      } catch (err) {
        resultHint.innerHTML = `❌ Gagal membuka kamera: ${err.message || err}`;
      }
    };

    // 1-Tap Toggle Camera Button Handler
    const btnToggleFacing = document.getElementById('btn-toggle-camera-facing');
    btnToggleFacing.onclick = async () => {
      currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
      localStorage.setItem('preferred_scanner_camera', currentFacingMode);
      await startScanner({ facingMode: currentFacingMode });
    };

    // Camera Dropdown Selection Handler
    const selectCameraEl = document.getElementById('select-camera-device');
    selectCameraEl.onchange = async (e) => {
      const val = e.target.value;
      if (val === 'user' || val === 'environment') {
        currentFacingMode = val;
        localStorage.setItem('preferred_scanner_camera', currentFacingMode);
        await startScanner({ facingMode: val });
      } else {
        activeCameraId = val;
        await startScanner(val);
      }
    };

    // Start with preferred facing mode (default: 'user' / Front Camera Mirror)
    await startScanner({ facingMode: currentFacingMode });

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
