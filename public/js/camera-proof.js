/**
 * 📷 Camera Proof & Visual Timestamp Watermark Engine
 * Handles camera capture and burns high-contrast metadata timestamp onto canvas
 */

export class CameraProofEngine {
  constructor(videoElementId) {
    this.video = document.getElementById(videoElementId);
    this.stream = null;
    this.canvas = document.createElement('canvas');
    this.facingMode = 'user';
  }

  async startCamera(facingMode = 'user') {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Kamera tidak didukung pada browser ini.');
    }
    
    this.facingMode = facingMode;
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
   * Captures current camera frame cropped strictly to the landscape preview viewport
   * and burns clean, monochrome inline chip watermark
   */
  captureStampedPhoto({ action = 'PINJAM', model = '-', nomorAsset = '-', picName = 'PIC', location = 'PE SOLUTION' } = {}) {
    if (!this.video || !this.stream) return null;

    const rawWidth = this.video.videoWidth || 640;
    const rawHeight = this.video.videoHeight || 480;

    // Determine target aspect ratio from actual video preview element (landscape viewport)
    let targetAspect = 16 / 9; // Default landscape standard
    if (this.video && this.video.clientWidth && this.video.clientHeight && this.video.clientHeight > 0) {
      targetAspect = this.video.clientWidth / this.video.clientHeight;
    }
    // Ensure the output is strictly landscape format (>= 1.33)
    if (targetAspect < 1.33) {
      targetAspect = 16 / 9;
    }

    // Calculate source crop rectangle from raw camera frame corresponding to CSS object-fit: cover
    const videoAspect = rawWidth / rawHeight;
    let srcX = 0, srcY = 0, srcW = rawWidth, srcH = rawHeight;

    if (videoAspect > targetAspect) {
      // Video is wider than target landscape -> crop left & right
      srcW = Math.round(rawHeight * targetAspect);
      srcH = rawHeight;
      srcX = Math.round((rawWidth - srcW) / 2);
      srcY = 0;
    } else {
      // Video is taller/portrait -> crop top & bottom to exact landscape center
      srcW = rawWidth;
      srcH = Math.round(rawWidth / targetAspect);
      srcX = 0;
      srcY = Math.round((rawHeight - srcH) / 2);
    }

    // Target dimensions for high-efficiency storage (max width 960px landscape)
    const targetWidth = Math.min(960, srcW);
    const targetHeight = Math.round(targetWidth / targetAspect);

    this.canvas.width = targetWidth;
    this.canvas.height = targetHeight;
    const ctx = this.canvas.getContext('2d');

    // Handle horizontal flip if user-facing camera (Mirror mode)
    const isMirror = this.facingMode === 'user' || (this.video.style.transform && this.video.style.transform.includes('scaleX(-1)'));
    if (isMirror) {
      ctx.save();
      ctx.translate(targetWidth, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(this.video, srcX, srcY, srcW, srcH, 0, 0, targetWidth, targetHeight);
      ctx.restore();
    } else {
      ctx.drawImage(this.video, srcX, srcY, srcW, srcH, 0, 0, targetWidth, targetHeight);
    }

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

    // 3. Compact Monochrome Single-Line Pill Watermark (Auto-fit Font Scaling)
    let fontSize = Math.max(9.5, Math.floor(targetHeight * 0.034));
    const maxAvailableWidth = targetWidth - 28;

    const singleLineText = `[ ${cleanAction} ]   ${cleanAsset}  •  ${cleanModel}   |   ${cleanPic}   |   ${dateStr}, ${timeStr}`;
    
    // Dynamically auto-shrink font size if text exceeds width so it ALWAYS fits in 1 single line!
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
    let singleLineWidth = ctx.measureText(singleLineText).width;
    let padX = Math.max(7, Math.floor(fontSize * 0.8));

    while ((singleLineWidth + (padX * 2) > maxAvailableWidth) && fontSize > 7) {
      fontSize -= 0.5;
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
      singleLineWidth = ctx.measureText(singleLineText).width;
      padX = Math.max(6, Math.floor(fontSize * 0.75));
    }

    const padY = Math.max(4, Math.floor(fontSize * 0.45));
    const chipHeight = Math.round(fontSize + (padY * 2));
    const chipWidth = Math.min(maxAvailableWidth, Math.round(singleLineWidth + (padX * 2)));
    const radius = Math.floor(chipHeight / 2);

    const chipX = 14;
    const chipY = targetHeight - chipHeight - 12;

    // Draw frosted monochrome single-line pill container
    ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.roundRect(chipX, chipY, chipWidth, chipHeight, radius);
    ctx.fill();
    ctx.stroke();

    // Draw single-line crisp white watermark text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(singleLineText, chipX + padX, chipY + padY + fontSize - 1);

    // Return high-efficiency compressed JPEG data URL (~50KB per photo)
    return this.canvas.toDataURL('image/jpeg', 0.78);
  }
}
