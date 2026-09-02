import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'sample_management.db');
const db = new Database(dbPath);

// Enable WAL mode for high concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  // 1. Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      qr TEXT,
      level TEXT NOT NULL DEFAULT 'member',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Database Sample Table (Master Samples & Assets)
  db.exec(`
    CREATE TABLE IF NOT EXISTS database_sample (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model TEXT,
      nomor_asset TEXT UNIQUE,
      sn TEXT,
      name TEXT DEFAULT '',
      status_pinjam TEXT DEFAULT 'KEMBALI',
      status_audit TEXT DEFAULT 'RESET',
      latest_check TEXT DEFAULT '',
      pic_sample TEXT DEFAULT '',
      qr TEXT,
      timestamp TEXT DEFAULT '',
      
      -- Standard asset fields
      Label TEXT,
      Barcode TEXT,
      Unrec_Asset TEXT,
      Type TEXT,
      Manufacture_Date TEXT,
      Asset_Class TEXT,
      Category TEXT,
      SET_PBA TEXT,
      Purpose TEXT,
      Purpose_Detail TEXT,
      Status TEXT,
      IMEI_Original_Serial_No TEXT,
      Cost_Center TEXT,
      Model_SKU TEXT,
      Model_Desc TEXT,
      Qty INTEGER DEFAULT 1,
      Submitter TEXT,
      Controller TEXT,
      Location TEXT,
      Dept TEXT,
      Holder TEXT,
      Business_Area TEXT,
      Plant TEXT,
      Manufacture_Sources TEXT,
      Expired_Date TEXT,
      Abolish_Status TEXT,
      Create_By TEXT,
      Create_Date TEXT,
      Updated_By TEXT,
      Updated_Date TEXT,

      -- Bulk device fields
      model_name TEXT,
      serial_no TEXT,
      sample_separation_status TEXT,
      octa_status TEXT,
      material_no_matching_status TEXT,
      defect_status TEXT,
      un_confirm_necessity TEXT,
      un TEXT,
      sample_processing TEXT,
      defect TEXT,
      imei_confirm_necessity TEXT,
      imei TEXT,
      imei2 TEXT,
      hw_rev TEXT,
      pre_result TEXT,
      retention_owner TEXT,
      retention_department TEXT,
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sample_nomor_asset ON database_sample(nomor_asset);
    CREATE INDEX IF NOT EXISTS idx_sample_sn ON database_sample(sn);
    CREATE INDEX IF NOT EXISTS idx_sample_imei ON database_sample(imei);
    CREATE INDEX IF NOT EXISTS idx_sample_un ON database_sample(un);
    CREATE INDEX IF NOT EXISTS idx_sample_model ON database_sample(model);
    CREATE INDEX IF NOT EXISTS idx_sample_status_pinjam ON database_sample(status_pinjam);
    CREATE INDEX IF NOT EXISTS idx_sample_status_audit ON database_sample(status_audit);
  `);

  // 3. Flow Sample Table (Borrow/Return Logs)
  db.exec(`
    CREATE TABLE IF NOT EXISTS flow_sample (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      nomor_asset TEXT NOT NULL,
      model TEXT,
      status_pinjam TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_flow_nomor_asset ON flow_sample(nomor_asset);
    CREATE INDEX IF NOT EXISTS idx_flow_name ON flow_sample(name);
    CREATE INDEX IF NOT EXISTS idx_flow_timestamp ON flow_sample(timestamp);
  `);

  // 4. Audit Sample Table (Audit History Logs)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_sample (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pic_sample TEXT,
      nomor_asset TEXT NOT NULL,
      status_audit TEXT NOT NULL,
      model TEXT,
      tanggal_pengecekan TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_audit_nomor_asset ON audit_sample(nomor_asset);
    CREATE INDEX IF NOT EXISTS idx_audit_name ON audit_sample(name);
  `);

  // Safe migrations for Face Recognition & Photo Proof with Timestamp
  try { db.exec("ALTER TABLE users ADD COLUMN face_descriptor TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE users ADD COLUMN face_photo TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE flow_sample ADD COLUMN proof_image TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE audit_sample ADD COLUMN proof_image TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE database_sample ADD COLUMN proof_image TEXT;"); } catch (e) {}

  // 5. User Biometric & Fingerprint Credentials
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT,
      device_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_cred_user_id ON user_credentials(user_id);
    CREATE INDEX IF NOT EXISTS idx_cred_id ON user_credentials(credential_id);
  `);

  // Auto-normalize legacy UTC timestamps (< 07:00 from initial seed) to Asia/Jakarta WIB
  try {
    db.prepare(`
      UPDATE database_sample 
      SET timestamp = datetime(timestamp, '+7 hours'),
          updated_at = datetime(updated_at, '+7 hours')
      WHERE timestamp LIKE '2026-09-02 0%'
    `).run();

    db.prepare(`
      UPDATE flow_sample 
      SET timestamp = datetime(timestamp, '+7 hours'),
          created_at = datetime(created_at, '+7 hours')
      WHERE timestamp LIKE '2026-09-02 0%'
    `).run();
  } catch (e) {}

  return db;
}

export default db;
