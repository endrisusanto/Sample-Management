import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/database.js';
import { SampleService } from './sampleService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'sample-mgmt-super-secret-key-2026';

export class AuthService {
  static async login(email, password) {
    if (!email || !password) {
      throw new Error('Email dan password wajib diisi');
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email.trim());
    if (!user) {
      throw new Error('Akun dengan email ini belum terdaftar. Silakan lakukan registrasi akun terlebih dahulu.');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new Error('Password salah. Silakan coba lagi atau gunakan menu Lupa Password di registrasi.');
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, level: user.level },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password: _, ...userSafe } = user;
    return { token, user: userSafe };
  }

  static async register({ name, email, password, level = 'member', pin }, isSuperUserReq = false) {
    if (!name || !email || !password) {
      throw new Error('Nama, email, dan password wajib diisi');
    }

    const PRESET_PIN = process.env.ADMIN_PIN || '112233';

    if (level === 'super user' && !isSuperUserReq) {
      if (!pin || pin.trim() !== PRESET_PIN) {
        throw new Error('PIN Super User tidak valid! Masukkan PIN otorisasi administrator yang benar.');
      }
    }

    const existing = db.prepare('SELECT id, email, name, level FROM users WHERE email = ? COLLATE NOCASE').get(email.trim());
    if (existing) {
      // If PIN is provided and valid, allow password reset / update for existing email
      if (pin && pin.trim() === PRESET_PIN) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        db.prepare(`
          UPDATE users 
          SET name = ?, password = ?, level = ? 
          WHERE id = ?
        `).run(name.trim().toUpperCase(), hashedPassword, level, existing.id);
        
        return db.prepare('SELECT id, name, email, qr, level, created_at FROM users WHERE id = ?').get(existing.id);
      }
      throw new Error('Email sudah terdaftar. Jika ingin mereset password akun ini, pilih Super User dan masukkan PIN Otorisasi.');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const qrPath = `qr/${name.replace(/\s+/g, '_')}.png`;

    const result = db.prepare(`
      INSERT INTO users (name, email, password, qr, level)
      VALUES (?, ?, ?, ?, ?)
    `).run(name.trim().toUpperCase(), email.trim().toLowerCase(), hashedPassword, qrPath, level);

    const newUser = db.prepare('SELECT id, name, email, qr, level, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    return newUser;
  }

  static getAllUsers() {
    return db.prepare('SELECT id, name, email, qr, level, created_at FROM users ORDER BY id ASC').all();
  }

  static getUserById(id) {
    return db.prepare('SELECT id, name, email, qr, level, created_at FROM users WHERE id = ?').get(id);
  }

  static deleteUser(id) {
    return db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  static updateUser(id, { name, email, password, level }) {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) throw new Error('User not found');

    let passHash = existing.password;
    if (password && password.trim()) {
      passHash = bcrypt.hashSync(password, 10);
    }

    const qrPath = name ? `qr/user_${encodeURIComponent(name)}.png` : existing.qr;

    db.prepare(`
      UPDATE users 
      SET name = COALESCE(?, name),
          email = COALESCE(?, email),
          password = ?,
          level = COALESCE(?, level),
          qr = ?
      WHERE id = ?
    `).run(name || null, email || null, passHash, level || null, qrPath, id);

    return this.getUserById(id);
  }

  static registerFace(userId, faceDescriptor, facePhoto) {
    const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(userId);
    if (!user) throw new Error('User tidak ditemukan');

    let savedPhotoPath = null;
    if (facePhoto) {
      savedPhotoPath = SampleService.saveBase64Image(facePhoto, 'faces', `user_${userId}_face`);
    }

    const descriptorStr = Array.isArray(faceDescriptor) ? JSON.stringify(faceDescriptor) : faceDescriptor;

    db.prepare(`
      UPDATE users 
      SET face_descriptor = ?, 
          face_photo = COALESCE(?, face_photo),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(descriptorStr, savedPhotoPath, userId);

    return db.prepare('SELECT id, name, email, qr, level, face_photo, created_at FROM users WHERE id = ?').get(userId);
  }

  static faceLogin(clientDescriptor) {
    if (!clientDescriptor || !Array.isArray(clientDescriptor)) {
      throw new Error('Data biometrik wajah tidak valid');
    }

    const usersWithFace = db.prepare(`
      SELECT id, name, email, level, face_descriptor, face_photo 
      FROM users 
      WHERE face_descriptor IS NOT NULL AND face_descriptor != ''
    `).all();

    if (usersWithFace.length === 0) {
      throw new Error('Belum ada data wajah terdaftar pada sistem. Silakan login dengan password dan daftarkan wajah di menu Users.');
    }

    let bestMatch = null;
    let minDistance = Infinity;

    for (const u of usersWithFace) {
      try {
        const storedDesc = JSON.parse(u.face_descriptor);
        if (!Array.isArray(storedDesc) || storedDesc.length !== clientDescriptor.length) continue;

        let sum = 0;
        for (let i = 0; i < clientDescriptor.length; i++) {
          const diff = clientDescriptor[i] - storedDesc[i];
          sum += diff * diff;
        }
        const distance = Math.sqrt(sum);

        if (distance < minDistance) {
          minDistance = distance;
          bestMatch = u;
        }
      } catch (err) {
        console.error('Error parsing face descriptor for user:', u.id, err);
      }
    }

    // Threshold for face descriptor Euclidean distance
    if (!bestMatch || minDistance > 0.58) {
      throw new Error(`Wajah tidak cocok dengan pengguna terdaftar (Kemiripan: ${minDistance.toFixed(2)}).`);
    }

    const token = jwt.sign(
      { id: bestMatch.id, name: bestMatch.name, email: bestMatch.email, level: bestMatch.level },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      token,
      user: {
        id: bestMatch.id,
        name: bestMatch.name,
        email: bestMatch.email,
        level: bestMatch.level,
        face_photo: bestMatch.face_photo
      },
      distance: minDistance
    };
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return null;
    }
  }
}
