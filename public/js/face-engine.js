/**
 * 👤 Biometric Face Recognition AI Client Engine (TensorFlow / face-api Deep Learning)
 * Extracts 128-dimensional deep neural facial embedding vectors with 68 landmark points
 */

let modelsLoaded = false;
let modelLoadPromise = null;

export class FaceEngine {
  constructor(videoElementId) {
    this.video = document.getElementById(videoElementId);
    this.stream = null;
    this.canvas = document.createElement('canvas');
  }

  /**
   * Loads Face Recognition Deep Learning weights into memory
   */
  static async loadModels() {
    if (modelsLoaded) return true;
    if (modelLoadPromise) return modelLoadPromise;

    modelLoadPromise = (async () => {
      // Ensure faceapi script is loaded
      if (typeof window.faceapi === 'undefined') {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '/vendor/face-api/face-api.min.js';
          script.onload = resolve;
          script.onerror = () => {
            // Fallback to CDN if local fails
            const cdnScript = document.createElement('script');
            cdnScript.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.min.js';
            cdnScript.onload = resolve;
            cdnScript.onerror = reject;
            document.head.appendChild(cdnScript);
          };
          document.head.appendChild(script);
        });
      }

      const MODEL_URL = '/models/face';
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        modelsLoaded = true;
        console.log('✅ Biometric Face AI Deep Learning Models loaded successfully.');
        return true;
      } catch (err) {
        console.warn('Fallback loading face models from CDN:', err);
        const CDN_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(CDN_MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(CDN_MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(CDN_MODEL_URL)
        ]);
        modelsLoaded = true;
        return true;
      }
    })();

    return modelLoadPromise;
  }

  async startCamera(facingMode = 'user') {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Kamera tidak didukung pada browser ini.');
    }

    this.stopCamera();

    // Start background model loading
    FaceEngine.loadModels().catch(e => console.warn('Model pre-load error:', e));

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 640 },
          height: { ideal: 480 }
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
      console.error('Kamera gagal diakses:', err);
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
   * Captures face frame and computes a 128-dimensional deep neural facial descriptor
   */
  async extractFaceDescriptor() {
    if (!this.video || !this.stream) {
      throw new Error('Kamera belum aktif.');
    }

    // Ensure models are loaded
    await FaceEngine.loadModels();

    if (this.video.readyState < 2) {
      await new Promise(resolve => {
        this.video.onloadeddata = resolve;
        setTimeout(resolve, 500);
      });
    }

    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
    const detection = await faceapi.detectSingleFace(this.video, options)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      throw new Error('Wajah tidak terdeteksi. Pastikan wajah berada di dalam bingkai kamera dengan pencahayaan yang cukup.');
    }

    const vw = this.video.videoWidth || 640;
    const vh = this.video.videoHeight || 480;

    // Capture high quality snapshot for preview & admin storage
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = vw;
    fullCanvas.height = vh;
    const fullCtx = fullCanvas.getContext('2d');
    fullCtx.drawImage(this.video, 0, 0, vw, vh);
    const photoDataUrl = fullCanvas.toDataURL('image/jpeg', 0.85);

    return {
      descriptor: Array.from(detection.descriptor), // 128-D Float32Array converted to standard Array
      photo: photoDataUrl
    };
  }
}
