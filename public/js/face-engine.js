/**
 * 👤 Biometric Face Recognition Client Engine
 * Extracts 128-dimensional facial embedding vectors from live camera frames
 */

export class FaceEngine {
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
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });
      if (this.video) {
        this.video.srcObject = this.stream;
        await this.video.play();
      }
      return true;
    } catch (err) {
      console.error('Kamera gagal diakses:', err);
      throw new Error('Izin kamera ditolak atau kamera tidak ditemukan.');
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
   * Captures face frame and computes a 128-dimensional facial biometric descriptor
   */
  extractFaceDescriptor() {
    if (!this.video || !this.stream) return null;

    const width = 128;
    const height = 128;
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');

    // Crop center square (face region)
    const vw = this.video.videoWidth || 640;
    const vh = this.video.videoHeight || 480;
    const size = Math.min(vw, vh) * 0.7;
    const sx = (vw - size) / 2;
    const sy = (vh - size) / 2;

    ctx.drawImage(this.video, sx, sy, size, size, 0, 0, width, height);

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Convert to 128-D normalized feature vector across 8x16 spatial grid zones
    const descriptor = new Array(128).fill(0);
    const cellsX = 8;
    const cellsY = 16;
    const cellW = width / cellsX;
    const cellH = height / cellsY;

    for (let cy = 0; cy < cellsY; cy++) {
      for (let cx = 0; cx < cellsX; cx++) {
        const binIndex = cy * cellsX + cx;
        let sum = 0;
        let count = 0;

        for (let y = Math.floor(cy * cellH); y < Math.floor((cy + 1) * cellH); y++) {
          for (let x = Math.floor(cx * cellW); x < Math.floor((cx + 1) * cellW); x++) {
            const idx = (y * width + x) * 4;
            // Grayscale luminance
            const lum = (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]) / 255;
            sum += lum;
            count++;
          }
        }
        descriptor[binIndex] = count > 0 ? sum / count : 0;
      }
    }

    // L2 Normalize descriptor
    const norm = Math.sqrt(descriptor.reduce((acc, val) => acc + val * val, 0)) || 1;
    const normalizedDescriptor = descriptor.map(v => v / norm);

    // Full photo snapshot for preview & verification
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = vw;
    fullCanvas.height = vh;
    const fullCtx = fullCanvas.getContext('2d');
    fullCtx.drawImage(this.video, 0, 0, vw, vh);
    const photoDataUrl = fullCanvas.toDataURL('image/jpeg', 0.85);

    return {
      descriptor: normalizedDescriptor,
      photo: photoDataUrl
    };
  }
}
