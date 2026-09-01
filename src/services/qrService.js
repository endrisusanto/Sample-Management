import QRCode from 'qrcode';

export class QRService {
  /**
   * Generates a Data URL (base64 PNG) for a given text
   */
  static async generateDataURL(text, options = {}) {
    try {
      const opts = {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        margin: 2,
        width: options.width || 300,
        color: {
          dark: '#000000',
          light: '#ffffff'
        },
        ...options
      };
      return await QRCode.toDataURL(text, opts);
    } catch (err) {
      console.error('QR Generation error:', err);
      throw err;
    }
  }

  /**
   * Generates a Buffer (PNG) for direct HTTP streaming
   */
  static async generateBuffer(text, options = {}) {
    try {
      const opts = {
        errorCorrectionLevel: 'H',
        type: 'png',
        margin: 2,
        width: options.width || 300,
        ...options
      };
      return await QRCode.toBuffer(text, opts);
    } catch (err) {
      console.error('QR Buffer error:', err);
      throw err;
    }
  }
}
