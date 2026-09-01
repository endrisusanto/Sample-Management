import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { initDatabase } from './database.js';
import { rawBulkTSV } from './raw_bulk_data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function seedUsers() {
  console.log('👤 Seeding default users...');
  const salt = await bcrypt.genSalt(10);
  const defaultHashedPassword = await bcrypt.hash('password123', salt);

  const defaultUsers = [
    { name: 'ENDRI SUSANTO', email: 'endri.s@samsung.com', level: 'super user' },
    { name: 'APTA PRANA MAS ERLANGGA', email: 'apta.p@samsung.com', level: 'member' },
    { name: 'FAZLUR RAHMA', email: 'fazlur.r@samsung.com', level: 'member' },
    { name: 'LUTFI BUKHARI', email: 'lufti.b@samsung.com', level: 'member' },
    { name: 'DHANAR KURNIA PUTRA', email: 'danar.kurnia@samsung.com', level: 'member' }
  ];

  const insertUserStmt = db.prepare(`
    INSERT INTO users (name, email, password, qr, level)
    VALUES (@name, @email, @password, @qr, @level)
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      level = excluded.level
  `);

  const insertManyUsers = db.transaction((users) => {
    for (const u of users) {
      insertUserStmt.run({
        name: u.name,
        email: u.email,
        password: defaultHashedPassword,
        qr: `qr/${u.name.replace(/\s+/g, '_')}.png`,
        level: u.level
      });
    }
  });

  insertManyUsers(defaultUsers);
}

export async function seedSamples() {
  // 1. Ingest Legacy Database Dump if available
  const legacySqlPath = path.join(__dirname, '../../scan/database/scan.sql');
  if (fs.existsSync(legacySqlPath)) {
    try {
      console.log('📦 Ingesting legacy dataset from scan.sql...');
      const sqlContent = fs.readFileSync(legacySqlPath, 'utf8');

      const sampleRegex = /INSERT INTO `database_sample`[^;]+;/g;
      const sampleMatches = sqlContent.match(sampleRegex);
      if (sampleMatches) {
        let insertedCount = 0;
        const insertStmt = db.prepare(`
          INSERT OR IGNORE INTO database_sample (
            id, model, nomor_asset, sn, name, status_pinjam, status_audit, latest_check, pic_sample, qr, timestamp,
            Label, Barcode, Unrec_Asset, Type, Manufacture_Date, Asset_Class, Category, SET_PBA, Purpose, Purpose_Detail,
            Status, IMEI_Original_Serial_No, Cost_Center, Model_SKU, Model_Desc, Qty, Submitter, Controller,
            Location, Dept, Holder, Business_Area, Plant, Manufacture_Sources, Expired_Date, Abolish_Status,
            Create_By, Create_Date, Updated_By, Updated_Date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const match of sampleMatches) {
          const valuesSection = match.substring(match.indexOf('VALUES') + 6).trim().replace(/;$/, '');
          const rowRegex = /\((.*?)\)(?:,|$)/gs;
          let rowMatch;
          
          while ((rowMatch = rowRegex.exec(valuesSection)) !== null) {
            const rawRow = rowMatch[1];
            const rowValues = [];
            let inQuotes = false;
            let current = '';
            
            for (let i = 0; i < rawRow.length; i++) {
              const char = rawRow[i];
              if (char === "'" && (i === 0 || rawRow[i - 1] !== '\\')) {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                rowValues.push(cleanSqlVal(current));
                current = '';
              } else {
                current += char;
              }
            }
            if (current) rowValues.push(cleanSqlVal(current));

            if (rowValues.length >= 41) {
              try {
                insertStmt.run(...rowValues.slice(0, 41));
                insertedCount++;
              } catch (err) {}
            }
          }
        }
        console.log(`✅ Loaded ${insertedCount} samples from legacy scan.sql.`);
      }

      // Extract flow_sample
      const flowRegex = /INSERT INTO `flow_sample`[^;]+;/g;
      const flowMatches = sqlContent.match(flowRegex);
      if (flowMatches) {
        const flowStmt = db.prepare(`
          INSERT OR IGNORE INTO flow_sample (id, name, nomor_asset, model, status_pinjam, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const match of flowMatches) {
          const valuesSection = match.substring(match.indexOf('VALUES') + 6).trim().replace(/;$/, '');
          const rowRegex = /\((.*?)\)(?:,|$)/gs;
          let rowMatch;
          while ((rowMatch = rowRegex.exec(valuesSection)) !== null) {
            const rawRow = rowMatch[1];
            const cols = rawRow.split(',').map(c => cleanSqlVal(c));
            if (cols.length >= 6) {
              try { flowStmt.run(...cols.slice(0, 6)); } catch(e) {}
            }
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ Legacy SQL parse notice:', e.message);
    }
  }

  // 2. Ingest Bulk TSV Dataset
  console.log('📱 Ingesting provided bulk sample device dataset...');
  const lines = rawBulkTSV.split('\n').map(l => l.trim()).filter(Boolean);
  let headerIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Model Name\t') || lines[i].includes('Sample separation status')) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) headerIndex = 0;
  const headerCols = lines[headerIndex].split('\t').map(h => h.trim());

  const sampleRows = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = lines[i].split('\t').map(c => c.trim());
    if (cols.length < 2) continue;
    if (cols[0] === 'Model Name' && cols[1] === 'Serial') continue;

    const row = {};
    headerCols.forEach((h, idx) => {
      row[h] = cols[idx] || '';
    });
    sampleRows.push(row);
  }

  console.log(`🔍 Extracted ${sampleRows.length} raw rows from TSV prompt data.`);

  const upsertBulkStmt = db.prepare(`
    INSERT INTO database_sample (
      model, model_name, nomor_asset, sn, serial_no, name, status_pinjam, status_audit,
      pic_sample, retention_owner, retention_department, Dept,
      sample_separation_status, octa_status, material_no_matching_status,
      defect_status, un_confirm_necessity, un, sample_processing, defect,
      imei_confirm_necessity, imei, imei2, hw_rev, pre_result, qr, timestamp,
      Label, Barcode, Unrec_Asset, Type, Asset_Class, Category, SET_PBA, Purpose, Status,
      Cost_Center, Model_SKU, Model_Desc, Qty, Submitter, Controller, Location, Holder,
      Business_Area, Plant, Manufacture_Sources, Abolish_Status
    ) VALUES (
      @model, @model_name, @nomor_asset, @sn, @serial_no, @name, @status_pinjam, @status_audit,
      @pic_sample, @retention_owner, @retention_department, @Dept,
      @sample_separation_status, @octa_status, @material_no_matching_status,
      @defect_status, @un_confirm_necessity, @un, @sample_processing, @defect,
      @imei_confirm_necessity, @imei, @imei2, @hw_rev, @pre_result, @qr, @timestamp,
      @Label, @Barcode, @Unrec_Asset, @Type, @Asset_Class, @Category, @SET_PBA, @Purpose, @Status,
      @Cost_Center, @Model_SKU, @Model_Desc, @Qty, @Submitter, @Controller, @Location, @Holder,
      @Business_Area, @Plant, @Manufacture_Sources, @Abolish_Status
    )
    ON CONFLICT(nomor_asset) DO UPDATE SET
      model = excluded.model,
      model_name = excluded.model_name,
      sn = excluded.sn,
      serial_no = excluded.serial_no,
      un = excluded.un,
      imei = excluded.imei,
      imei2 = excluded.imei2,
      hw_rev = excluded.hw_rev,
      pre_result = excluded.pre_result,
      retention_owner = excluded.retention_owner,
      retention_department = excluded.retention_department,
      sample_separation_status = excluded.sample_separation_status,
      octa_status = excluded.octa_status,
      material_no_matching_status = excluded.material_no_matching_status,
      defect_status = excluded.defect_status,
      un_confirm_necessity = excluded.un_confirm_necessity,
      sample_processing = excluded.sample_processing,
      defect = excluded.defect,
      imei_confirm_necessity = excluded.imei_confirm_necessity
  `);

  const uniqueSamples = new Map();
  for (const r of sampleRows) {
    const serial = r.Serial || r.serial || '';
    if (!serial) continue;
    if (!uniqueSamples.has(serial)) {
      uniqueSamples.set(serial, {
        model: r['Model Name'] || '',
        model_name: r['Model Name'] || '',
        nomor_asset: serial,
        sn: serial,
        serial_no: serial,
        name: r['Retention Owner'] || '',
        status_pinjam: 'KEMBALI',
        status_audit: 'RESET',
        pic_sample: r['Retention Owner'] || '',
        retention_owner: r['Retention Owner'] || '',
        retention_department: r['Retention Department'] || 'PE Solution P /SEIN-P',
        Dept: r['Retention Department'] || 'PE Solution P /SEIN-P',
        sample_separation_status: r['Sample separation status'] || 'Dev.',
        octa_status: r['OCTA status'] || '',
        material_no_matching_status: r['Material no matching status'] || '',
        defect_status: r['Defect status Y/N'] || 'Normal',
        un_confirm_necessity: r['UN confirm necessity'] || 'Normal',
        un: r['UN'] || '',
        sample_processing: r['Sample Processing'] || '',
        defect: r['Defect'] || '',
        imei_confirm_necessity: r['IMEI confirm necessity'] || 'Normal',
        imei: r['IMEI'] || '',
        imei2: r['IMEI2'] || '',
        hw_rev: r['HW Rev.'] || '',
        pre_result: r['Pre result'] || 'N',
        qr: `qr/qr_${serial}.png`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        Label: serial,
        Barcode: serial,
        Unrec_Asset: serial,
        Type: 'DEVICE',
        Asset_Class: 'DEV',
        Category: 'SMARTPHONE',
        SET_PBA: 'SET',
        Purpose: 'Dev.',
        Status: 'Active',
        Cost_Center: 'C5703533',
        Model_SKU: r['Model Name'] || '',
        Model_Desc: r['Model Name'] || '',
        Qty: 1,
        Submitter: r['Retention Owner'] || 'Admin',
        Controller: r['Retention Owner'] || 'Admin',
        Location: 'Dynamics Building Lt 2 | PE 570B',
        Holder: r['Retention Owner'] || '',
        Business_Area: '570B',
        Plant: 'P529',
        Manufacture_Sources: 'SEIN',
        Abolish_Status: '0'
      });
    }
  }

  const insertBulkTransaction = db.transaction((samples) => {
    for (const s of samples) {
      upsertBulkStmt.run(s);
    }
  });

  insertBulkTransaction(Array.from(uniqueSamples.values()));
}

export async function runSeeder() {
  console.log('🔄 Initializing database schema...');
  initDatabase();
  await seedUsers();
  await seedSamples();

  const countSamples = db.prepare('SELECT COUNT(*) as count FROM database_sample').get().count;
  const countUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const countFlow = db.prepare('SELECT COUNT(*) as count FROM flow_sample').get().count;

  console.log(`🎉 Seeding complete! Database status:
  - Users: ${countUsers}
  - Total Sample Items: ${countSamples}
  - Flow / Logs: ${countFlow}
  `);
}

function cleanSqlVal(val) {
  if (!val) return '';
  val = val.trim();
  if (val.toUpperCase() === 'NULL') return null;
  if (val.startsWith("'") && val.endsWith("'")) {
    return val.slice(1, -1).replace(/\\'/g, "'");
  }
  return val;
}

export async function resetDatabase(options = {}) {
  const {
    delete_all_samples = false,
    reload_default_samples = false,
    clear_flow = false,
    reset_status = false,
    reset_users = false
  } = options;

  console.log('⚠️ RESETTING DATABASE WITH OPTIONS:', {
    delete_all_samples,
    reload_default_samples,
    clear_flow,
    reset_status,
    reset_users
  });

  const messages = [];

  if (delete_all_samples) {
    db.exec(`
      DELETE FROM flow_sample;
      DELETE FROM audit_sample;
      DELETE FROM database_sample;
    `);
    messages.push('Seluruh data master sample & riwayat transaksi berhasil dihapus bersih (database sample kosong).');
  } else if (reload_default_samples) {
    db.exec(`DELETE FROM database_sample;`);
    await seedSamples();
    messages.push('Master database sample dimuat ulang dari dataset awal (1.593 unit).');
  }

  if (clear_flow && !delete_all_samples) {
    db.exec(`
      DELETE FROM flow_sample;
      DELETE FROM audit_sample;
    `);
    messages.push('Riwayat transaksi flow & log audit dibersihkan.');
  }

  if (reset_status && !delete_all_samples) {
    db.exec(`
      UPDATE database_sample 
      SET status_pinjam = 'KEMBALI', 
          status_audit = 'RESET', 
          latest_check = '', 
          name = '';
    `);
    messages.push('Status peminjaman & status audit seluruh sample dikembalikan ke default.');
  }

  if (reset_users) {
    db.exec(`DELETE FROM users;`);
    await seedUsers();
    messages.push('Data pengguna di-reset ke 5 akun default.');
  }

  return {
    success: true,
    message: messages.join(' ') || 'Reset database berhasil dieksekusi.'
  };
}

// Run directly if invoked from CLI
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  runSeeder().catch(console.error);
}
