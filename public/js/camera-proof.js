/**
 * 📷 Camera Proof & Visual Timestamp Watermark Engine
 * Handles camera capture and burns high-contrast metadata timestamp onto canvas
 */

export class CameraProofEngine {
  constructor(videoElementId) {
    this.video = document.getElementById(videoElementId);
    this.stream = null;
    this.canvas = document.createElement('canvas');
  }

  async startCamera(facingMode = 'user') {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Kamera tidak didukung pada browser ini.');
    }
    
    // Stop any active stream first to release hardware lock before requesting new stream
    this.stopCamera();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      if (this.video) {
        this.video.srcObject = this.stream;
        this.video.style.transform = (facingMode === 'user') ? 'scaleX(-1)' : 'scaleX(1)';
        await this.video.play().catch(() => {});
      }
      return true;
    } catch (err) {
      // Fallback to generic video stream if constraint is over-constrained
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
        if (this.video) {
          this.video.srcObject = this.stream;
          this.video.style.transform = (facingMode === 'user') ? 'scaleX(-1)' : 'scaleX(1)';
          await this.video.play().catch(() => {});
        }
        return true;
      } catch (fallbackErr) {
        console.error('Gagal mengakses kamera:', fallbackErr);
        throw new Error('Izin kamera ditolak atau kamera sedang digunakan.');
      }
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
  }

  /**
   * Captures current camera frame and burns clean, monochrome inline chip watermark
   */
  captureStampedPhoto({ action = 'PINJAM', model = '-', nomorAsset = '-', picName = 'PIC', location = 'PE SOLUTION' } = {}) {
    if (!this.video || !this.stream) return null;

    const width = this.video.videoWidth || 640;
    const height = this.video.videoHeight || 480;

    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');

    // 1. Draw raw camera frame
    ctx.drawImage(this.video, 0, 0, width, height);

    // 2. Format Date & Time with Jakarta WIB timezone
    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('id-ID', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }) + ' WIB';

    const cleanAction = action.toUpperCase();
    const cleanPic = picName.toUpperCase();
    const cleanAsset = nomorAsset || '-';
    const cleanModel = model || '-';

    // 3. Compact Monochrome Inline Chip Watermark
    const fontSize = Math.max(11, Math.floor(height * 0.026));
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;

    const singleLineText = `[ ${cleanAction} ]   ${cleanAsset}  •  ${cleanModel}   |   ${cleanPic}   |   ${dateStr}, ${timeStr}`;
    const singleLineWidth = ctx.measureText(singleLineText).width;
    const maxAvailableWidth = width - 28;

    const padX = Math.max(10, Math.floor(fontSize * 0.9));
    const padY = Math.max(5, Math.floor(fontSize * 0.5));
    const chipHeight = fontSize + (padY * 2);
    const radius = Math.floor(chipHeight / 2);

    if (singleLineWidth + (padX * 2) <= maxAvailableWidth) {
      // --- Single Line Inline Pill Chip ---
      const chipWidth = singleLineWidth + (padX * 2);
      const chipX = 14;
      const chipY = height - chipHeight - 14;

      // Draw frosted monochrome pill container
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.2;

      ctx.beginPath();
      ctx.roundRect(chipX, chipY, chipWidth, chipHeight, radius);
      ctx.fill();
      ctx.stroke();

      // Draw text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(singleLineText, chipX + padX, chipY + padY + fontSize - 2);
    } else {
      // --- Dual Line Stacked Compact Monochrome Chips ---
      const line1 = `[ ${cleanAction} ]   ${cleanAsset}  •  ${cleanModel}`;
      const line2 = `👤 ${cleanPic}   |   🕒 ${dateStr}, ${timeStr}`;

      const w1 = ctx.measureText(line1).width + (padX * 2);
      const w2 = ctx.measureText(line2).width + (padX * 2);
      const chipWidth = Math.min(maxAvailableWidth, Math.max(w1, w2));

      const totalH = (chipHeight * 2) + 4;
      const chipX = 14;
      const chipY = height - totalH - 12;

      // Draw frosted monochrome rounded card
      ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.2;

      ctx.beginPath();
      ctx.roundRect(chipX, chipY, chipWidth, totalH, 8);
      ctx.fill();
      ctx.stroke();

      // Line 1
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line1, chipX + padX, chipY + padY + fontSize - 1);

      // Line 2
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(line2, chipX + padX, chipY + chipHeight + padY + fontSize - 1);
    }

    // Return compressed JPEG data URL
    return this.canvas.toDataURL('image/jpeg', 0.88);
  }
}
