/**
 * 🖐️ Biometric Fingerprint Engine
 * Dual-Mode:
 * 1. Native Android BiometricPrompt (via AndroidNativeBiometric bridge in Android APK)
 * 2. WebAuthn / FIDO2 Passkey (for Desktop/Mobile Web Chrome, Edge, Safari)
 */

// Helper to convert Base64URL to ArrayBuffer and vice versa
function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuffer(base64url) {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Native Android Biometric Promise Wrapper
function promptNativeAndroidBiometric(title, subtitle) {
  return new Promise((resolve, reject) => {
    if (!window.AndroidNativeBiometric) {
      return reject(new Error('AndroidNativeBiometric tidak tersedia.'));
    }

    const callbackId = 'bio_' + Math.random().toString(36).substr(2, 9);
    
    window.__onNativeBiometricResult = (id, success, msg) => {
      if (id === callbackId) {
        if (success) {
          resolve(true);
        } else {
          reject(new Error(msg || 'Autentikasi sidik jari dibatalkan atau gagal.'));
        }
      }
    };

    window.AndroidNativeBiometric.authenticate(title, subtitle, callbackId);
  });
}

export class BiometricAuth {
  /**
   * Check if device has biometric hardware (Fingerprint / Face ID)
   */
  static async isAvailable() {
    if (window.AndroidNativeBiometric) {
      try {
        return window.AndroidNativeBiometric.isBiometricAvailable();
      } catch (e) {
        return true;
      }
    }

    if (window.PublicKeyCredential && 
        typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      try {
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  /**
   * Trigger Native Fingerprint / Passkey Registration
   */
  static async registerFingerprint({ userId, userName, userEmail }) {
    // 1. Android APK Native BiometricPrompt
    if (window.AndroidNativeBiometric) {
      await promptNativeAndroidBiometric('Registrasi Sidik Jari', `Daftarkan ${userName}`);
      
      const androidCredId = `android_bio_${userId}_${btoa(userName || 'user')}`;
      localStorage.setItem('last_biometric_cred_id', androidCredId);

      const res = await fetch('/api/auth/fingerprint/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          credentialId: androidCredId,
          deviceName: 'Android Hardware Fingerprint Sensor'
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Gagal menyimpan kredensial sidik jari');
      return data;
    }

    // 2. Web Browser WebAuthn / FIDO2
    if (!window.PublicKeyCredential) {
      throw new Error('Sensor Biometrik / WebAuthn tidak didukung pada browser ini.');
    }

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const userHandle = new TextEncoder().encode(`user_${userId}_${Date.now()}`);

    const createOptions = {
      publicKey: {
        challenge,
        rp: {
          name: 'Sample Tracker SEIN-P',
          id: window.location.hostname
        },
        user: {
          id: userHandle,
          name: userEmail || userName,
          displayName: userName
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },   // ES256
          { alg: -257, type: 'public-key' }  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Built-in Fingerprint / Face sensor
          userVerification: 'required',
          residentKey: 'preferred'
        },
        timeout: 60000,
        attestation: 'none'
      }
    };

    const credential = await navigator.credentials.create(createOptions);
    if (!credential) throw new Error('Perekaman sidik jari dibatalkan.');

    const credentialId = bufferToBase64url(credential.rawId);
    localStorage.setItem('last_biometric_cred_id', credentialId);

    // Save to Server
    const res = await fetch('/api/auth/fingerprint/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        credentialId,
        deviceName: `${navigator.platform || 'Device'} Fingerprint Sensor`
      })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal menyimpan kredensial sidik jari');
    return data;
  }

  /**
   * Trigger Native Fingerprint / Passkey Login
   */
  static async loginWithFingerprint() {
    // 1. Android APK Native BiometricPrompt
    if (window.AndroidNativeBiometric) {
      const storedCredId = localStorage.getItem('last_biometric_cred_id');
      if (!storedCredId) {
        throw new Error('Sidik jari belum didaftarkan pada perangkat ini. Silakan daftarkan di menu Pengguna.');
      }

      await promptNativeAndroidBiometric('Login Sample Tracker', 'Sentuh sensor sidik jari Anda');

      const res = await fetch('/api/auth/fingerprint/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId: storedCredId })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Sidik jari tidak cocok.');
      return data;
    }

    // 2. Web Browser WebAuthn / FIDO2
    if (!window.PublicKeyCredential) {
      throw new Error('Sensor Biometrik tidak didukung pada browser ini.');
    }

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const storedCredId = localStorage.getItem('last_biometric_cred_id');
    const allowCredentials = storedCredId ? [{
      id: base64urlToBuffer(storedCredId),
      type: 'public-key'
    }] : [];

    const getOptions = {
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        userVerification: 'required',
        timeout: 60000,
        ...(allowCredentials.length > 0 ? { allowCredentials } : {})
      }
    };

    const assertion = await navigator.credentials.get(getOptions);
    if (!assertion) throw new Error('Verifikasi sidik jari dibatalkan.');

    const credentialId = bufferToBase64url(assertion.rawId);

    // Send to server to verify & issue session
    const res = await fetch('/api/auth/fingerprint/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialId })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Sidik jari tidak cocok.');

    localStorage.setItem('last_biometric_cred_id', credentialId);
    return data;
  }
}
