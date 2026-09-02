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
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      if (this.video) {
        this.video.srcObject = this.stream;
        this.video.style.transform = (facingMode === 'user') ? 'scaleX(-1)' : 'scaleX(1)';
        await this.video.play();
      }
      return true;
    } catch (err) {
      console.error('Gagal mengakses kamera:', err);
      throw new Error('Izin kamera ditolak atau kamera sedang digunakan.');
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
   * Captures the current camera frame and burns visual timestamp & metadata overlay
   */
  captureStampedPhoto({ action = 'PINJAM', model = '-', nomorAsset = '-', picName = 'PIC', location = 'PE SOLUTION P / SEIN-P' } = {}) {
    if (!this.video || !this.stream) return null;

    const width = this.video.videoWidth || 640;
    const height = this.video.videoHeight || 480;

    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');

    // 1. Draw raw camera frame
    ctx.drawImage(this.video, 0, 0, width, height);

    // 2. Draw Bottom Translucent Security Banner
    const bannerHeight = Math.max(70, Math.floor(height * 0.18));
    const gradient = ctx.createLinearGradient(0, height - bannerHeight, 0, height);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
    gradient.addColorStop(0.3, 'rgba(10, 15, 29, 0.85)');
    gradient.addColorStop(1, 'rgba(5, 8, 16, 0.95)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, height - bannerHeight, width, bannerHeight);

    // Top border accent for banner
    const isKembali = action.toUpperCase() === 'KEMBALI';
    const isAudit = action.toUpperCase().includes('AUDIT');
    const accentColor = isKembali ? '#10b981' : (isAudit ? '#8b5cf6' : '#3b82f6');

    ctx.fillStyle = accentColor;
    ctx.fillRect(0, height - bannerHeight, width, 3);

    // 3. Format Date & Time with Timezone
    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', {
      year: 'numeric', month: 'short', day: '2-digit', weekday: 'short'
    });
    const timeStr = now.toLocaleTimeString('id-ID', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }) + ' WIB';

    // 4. Action Badge Box
    const fontSize = Math.max(12, Math.floor(height * 0.032));
    ctx.font = `bold ${fontSize}px sans-serif`;

    const badgeText = `[ ${action.toUpperCase()} ]`;
    const badgeMetrics = ctx.measureText(badgeText);
    const badgeWidth = badgeMetrics.width + 16;
    const badgeHeight = fontSize + 8;
    const badgeX = 14;
    const badgeY = height - bannerHeight + 12;

    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 4);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(badgeText, badgeX + 8, badgeY + fontSize);

    // 5. Asset & Model Text
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontSize + 1}px sans-serif`;
    const assetLine = `${nomorAsset} — ${model}`;
    ctx.fillText(assetLine, badgeX + badgeWidth + 12, badgeY + fontSize);

    // 6. PIC, Timestamp & Location Subtext
    ctx.font = `500 ${Math.max(10, Math.floor(fontSize * 0.85))}px sans-serif`;
    ctx.fillStyle = '#cbd5e1';
    const subLine1 = `👤 PIC: ${picName.toUpperCase()}   |   🕒 ${dateStr}, ${timeStr}`;
    ctx.fillText(subLine1, 14, badgeY + badgeHeight + fontSize + 2);

    const subLine2 = `📍 ${location}   |   🔒 DIGITAL WATERMARK ID: ${Date.now().toString(36).toUpperCase()}`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(subLine2, 14, badgeY + badgeHeight + (fontSize * 2) + 4);

    // Return compressed JPEG data URL
    return this.canvas.toDataURL('image/jpeg', 0.85);
  }
}
