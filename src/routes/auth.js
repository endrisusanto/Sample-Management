import { Router } from 'express';
import { AuthService } from '../services/authService.js';

export const authRouter = Router();

// Middleware to extract authenticated user
export function authenticate(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const user = AuthService.verifyToken(token);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  req.user = user;
  next();
}

// Optional Auth (for public or pre-login flows)
export function optionalAuth(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const user = AuthService.verifyToken(token);
    if (user) req.user = user;
  }
  next();
}

// Super user check
export function requireSuperUser(req, res, next) {
  if (!req.user || req.user.level !== 'super user') {
    return res.status(403).json({ success: false, message: 'Akses khusus Super User diperlukan' });
  }
  next();
}

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { token, user } = await AuthService.login(email, password);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({ success: true, token, user });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

authRouter.post('/register', optionalAuth, async (req, res) => {
  try {
    const isSuperUserReq = req.user && req.user.level === 'super user';
    const newUser = await AuthService.register(req.body, isSuperUserReq);

    let token = null;
    if (!req.user) {
      const authResult = await AuthService.login(req.body.email, req.body.password);
      token = authResult.token;
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
    }

    res.status(201).json({ success: true, user: newUser, token });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

authRouter.get('/me', authenticate, (req, res) => {
  const user = AuthService.getUserById(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, user });
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
});

authRouter.get('/users', (req, res) => {
  try {
    const users = AuthService.getAllUsers();
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

authRouter.put('/users/:id', authenticate, requireSuperUser, (req, res) => {
  try {
    const updated = AuthService.updateUser(req.params.id, req.body);
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

authRouter.delete('/users/:id', authenticate, requireSuperUser, (req, res) => {
  try {
    AuthService.deleteUser(req.params.id);
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Register User Face
 */
authRouter.post('/register-face', (req, res) => {
  try {
    const userId = req.body.userId || (req.user && req.user.id);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID wajib disertakan' });
    }
    const { faceDescriptor, facePhoto } = req.body;

    if (!faceDescriptor && !facePhoto) {
      return res.status(400).json({ success: false, message: 'Data foto / biometrik wajah wajib diisi' });
    }

    const updatedUser = AuthService.registerFace(userId, faceDescriptor, facePhoto);
    res.json({ success: true, message: 'Wajah berhasil didaftarkan!', user: updatedUser });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

authRouter.post('/face-login', async (req, res) => {
  try {
    const { faceDescriptor } = req.body;
    const { token, user, distance } = AuthService.faceLogin(faceDescriptor);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true, token, user, distance, message: `Face ID diverifikasi! Selamat datang, ${user.name}` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * Register Fingerprint / Passkey Credential
 */
authRouter.post('/fingerprint/register', (req, res) => {
  try {
    const userId = req.body.userId || (req.user && req.user.id);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID wajib disertakan' });
    }
    const { credentialId, publicKey, deviceName } = req.body;

    if (!credentialId) {
      return res.status(400).json({ success: false, message: 'Credential ID sidik jari wajib ada' });
    }

    const result = AuthService.saveBiometricCredential({
      userId,
      credentialId,
      publicKey,
      deviceName: deviceName || 'Android / PC Biometric Key'
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * Biometric Fingerprint / Passkey Login
 */
authRouter.post('/fingerprint/login', async (req, res) => {
  try {
    const { credentialId } = req.body;
    const result = AuthService.verifyBiometricLogin({ credentialId });

    res.cookie('token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true, token: result.token, user: result.user, message: result.message });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * List User Registered Fingerprint Credentials
 */
authRouter.get('/fingerprint/list', authenticate, (req, res) => {
  try {
    const credentials = AuthService.getUserBiometrics(req.user.id);
    res.json({ success: true, credentials });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
