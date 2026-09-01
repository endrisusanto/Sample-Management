import db from '../db/database.js';
import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SampleService {
  /**
   * Helper to decode and save base64 image
   */
  static saveBase64Image(base64Data, subfolder = 'proofs', prefix = 'proof') {
    if (!base64Data || typeof base64Data !== 'string' || !base64Data.startsWith('data:image')) {
      return null;
    }
    try {
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) return null;
      const ext = matches[1].includes('png') ? 'png' : 'jpg';
      const buffer = Buffer.from(matches[2], 'base64');
      const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
      const targetDir = path.join(__dirname, `../../uploads/${subfolder}`);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const filePath = path.join(targetDir, filename);
      fs.writeFileSync(filePath, buffer);
      return `/uploads/${subfolder}/${filename}`;
    } catch (err) {
      console.error('Failed to save base64 image:', err.message);
      return null;
    }
  }

  /**
   * Process Borrow / Return transaction with QR or Barcode
   */
  static borrowReturnProcess({ name, nomor_asset, proof_image }) {
    if (!name || !nomor_asset) {
      throw new Error('Name and Nomor Asset / Serial are required');
    }

    const cleanAsset = nomor_asset.trim();
    const cleanName = name.trim().toUpperCase();

    // Find sample by nomor_asset, sn, imei, or un
    const sample = db.prepare(`
      SELECT * FROM database_sample 
      WHERE nomor_asset = ? OR sn = ? OR imei = ? OR un = ?
      LIMIT 1
    `).get(cleanAsset, cleanAsset, cleanAsset, cleanAsset);

    if (!sample) {
      return {
        success: false,
        action: 'TIDAK_TERSEDIA',
        message: `DATA TIDAK TERSEDIA UNTUK: ${cleanAsset}`,
        sample: null
      };
    }

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const prevName = (sample.name || '').trim().toUpperCase();
    const prevStatus = (sample.status_pinjam || '').trim().toUpperCase();
    const model = sample.model || sample.model_name || 'UNKNOWN';
    const targetAssetNo = sample.nomor_asset;

    let newStatus = 'PINJAM';
    let actionType = 'PINJAM';
    let message = '';

    if (cleanName === prevName) {
      if (prevStatus === 'PINJAM') {
        newStatus = 'KEMBALI';
        actionType = 'KEMBALI';
        message = `SAMPLE: ${model} | NO. ASSET: ${targetAssetNo} BERHASIL DIKEMBALIKAN (PIC: ${cleanName})`;
      } else {
        newStatus = 'PINJAM';
        actionType = 'PINJAM';
        message = `SAMPLE: ${model} | NO. ASSET: ${targetAssetNo} BERHASIL DIPINJAM (PIC: ${cleanName})`;
      }
    } else {
      newStatus = 'PINJAM';
      actionType = 'BERGANTI';
      message = `SAMPLE: ${model} | NO. ASSET: ${targetAssetNo} PEMINJAM BERGANTI KE: ${cleanName}`;
    }

    // Save proof image if provided
    let savedProofPath = null;
    if (proof_image) {
      savedProofPath = this.saveBase64Image(proof_image, 'proofs', `flow_${actionType}_${targetAssetNo}`);
    }

    // Execute atomic update & log
    const updateTransaction = db.transaction(() => {
      db.prepare(`
        UPDATE database_sample 
        SET name = ?, status_pinjam = ?, timestamp = ?, updated_at = CURRENT_TIMESTAMP
        WHERE nomor_asset = ?
      `).run(cleanName, newStatus, now, targetAssetNo);

      db.prepare(`
        INSERT INTO flow_sample (name, nomor_asset, status_pinjam, model, timestamp, proof_image)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(cleanName, targetAssetNo, newStatus, model, now, savedProofPath);
    });

    updateTransaction();

    const updatedSample = db.prepare('SELECT * FROM database_sample WHERE nomor_asset = ?').get(targetAssetNo);

    return {
      success: true,
      action: actionType,
      message,
      sample: updatedSample,
      timestamp: now,
      proof_image: savedProofPath
    };
  }

  /**
   * Process Sample Audit checking
   */
  static auditProcess({ name, nomor_asset, proof_image }) {
    if (!name || !nomor_asset) {
      throw new Error('Name and Nomor Asset / Serial are required');
    }

    const cleanAsset = nomor_asset.trim();
    const cleanName = name.trim().toUpperCase();

    const sample = db.prepare(`
      SELECT * FROM database_sample 
      WHERE nomor_asset = ? OR sn = ? OR imei = ? OR un = ?
      LIMIT 1
    `).get(cleanAsset, cleanAsset, cleanAsset, cleanAsset);

    if (!sample) {
      return {
        success: false,
        action: 'TIDAK_TERSEDIA',
        message: `DATA TIDAK TERSEDIA UNTUK: ${cleanAsset}`,
        sample: null
      };
    }

    const targetAssetNo = sample.nomor_asset;
    const model = sample.model || sample.model_name || 'UNKNOWN';
    const picSample = sample.pic_sample || cleanName;
    const currentAuditStatus = (sample.status_audit || 'RESET').toUpperCase();

    if (currentAuditStatus === 'SUDAH') {
      return {
        success: true,
        action: 'SUDAH',
        message: `SUDAH DICHECK: ${model} (${targetAssetNo})`,
        sample
      };
    }

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // Save proof image if provided
    let savedProofPath = null;
    if (proof_image) {
      savedProofPath = this.saveBase64Image(proof_image, 'proofs', `audit_${targetAssetNo}`);
    }

    const auditTransaction = db.transaction(() => {
      db.prepare(`
        UPDATE database_sample 
        SET status_audit = 'SUDAH', latest_check = ?, updated_at = CURRENT_TIMESTAMP
        WHERE nomor_asset = ?
      `).run(now, targetAssetNo);

      db.prepare(`
        INSERT INTO audit_sample (name, pic_sample, nomor_asset, status_audit, model, tanggal_pengecekan, proof_image)
        VALUES (?, ?, ?, 'SUDAH', ?, ?, ?)
      `).run(cleanName, picSample, targetAssetNo, model, now, savedProofPath);
    });

    auditTransaction();

    const updatedSample = db.prepare('SELECT * FROM database_sample WHERE nomor_asset = ?').get(targetAssetNo);

    return {
      success: true,
      action: 'SUDAH',
      message: `AUDIT BERHASIL: ${model} (${targetAssetNo})`,
      sample: updatedSample,
      timestamp: now,
      proof_image: savedProofPath
    };
  }

  /**
   * Reset All Sample Audit Statuses to RESET
   */
  static resetAuditStatus(userName = 'SUPER USER') {
    db.prepare(`UPDATE database_sample SET status_audit = 'RESET'`).run();
    return {
      success: true,
      message: `STATUS AUDIT BERHASIL DIRESET OLEH ${userName}`
    };
  }

  /**
   * Query samples with pagination, search, and multi-field filters
   */
  static getSamples(params = {}) {
    const page = Math.max(1, parseInt(params.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(params.limit, 10) || 25));
    const offset = (page - 1) * limit;

    const conditions = [];
    const sqlParams = [];

    if (params.search) {
      const s = `%${params.search.trim()}%`;
      conditions.push(`(
        model LIKE ? OR nomor_asset LIKE ? OR sn LIKE ? OR imei LIKE ? OR un LIKE ? OR 
        name LIKE ? OR pic_sample LIKE ? OR retention_owner LIKE ? OR Dept LIKE ?
      )`);
      sqlParams.push(s, s, s, s, s, s, s, s, s);
    }

    if (params.status_pinjam) {
      conditions.push(`status_pinjam = ?`);
      sqlParams.push(params.status_pinjam);
    }

    if (params.status_audit) {
      conditions.push(`status_audit = ?`);
      sqlParams.push(params.status_audit);
    }

    if (params.model) {
      conditions.push(`(model LIKE ? OR model_name LIKE ?)`);
      sqlParams.push(`%${params.model}%`, `%${params.model}%`);
    }

    if (params.pic_sample) {
      conditions.push(`(pic_sample LIKE ? OR retention_owner LIKE ?)`);
      sqlParams.push(`%${params.pic_sample}%`, `%${params.pic_sample}%`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) as total FROM database_sample ${whereClause}`;
    const total = db.prepare(countQuery).get(...sqlParams).total;

    // Sorting
    const validCols = ['id', 'model', 'nomor_asset', 'sn', 'name', 'status_pinjam', 'status_audit', 'latest_check', 'pic_sample', 'timestamp', 'created_at', 'updated_at', 'imei', 'un'];
    const sortBy = validCols.includes(params.sortBy) ? params.sortBy : 'id';
    const sortOrder = (params.sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const dataQuery = `
      SELECT * FROM database_sample 
      ${whereClause} 
      ORDER BY ${sortBy} ${sortOrder} 
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(dataQuery).all(...sqlParams, limit, offset);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: rows
    };
  }

  /**
   * Get single sample by ID or Asset No
   */
  static getSample(identifier) {
    return db.prepare(`
      SELECT * FROM database_sample 
      WHERE id = ? OR nomor_asset = ? OR sn = ? OR imei = ?
      LIMIT 1
    `).get(identifier, identifier, identifier, identifier);
  }

  /**
   * Save or Update Sample Item
   */
  static saveSample(data) {
    const assetNo = (data.nomor_asset || data.sn || data.serial_no || '').trim();
    if (!assetNo) {
      throw new Error('Nomor Asset or Serial is required');
    }

    const existing = db.prepare('SELECT id FROM database_sample WHERE nomor_asset = ?').get(assetNo);

    if (existing) {
      db.prepare(`
        UPDATE database_sample SET
          model = COALESCE(?, model),
          model_name = COALESCE(?, model_name),
          sn = COALESCE(?, sn),
          serial_no = COALESCE(?, serial_no),
          name = COALESCE(?, name),
          status_pinjam = COALESCE(?, status_pinjam),
          status_audit = COALESCE(?, status_audit),
          pic_sample = COALESCE(?, pic_sample),
          retention_owner = COALESCE(?, retention_owner),
          retention_department = COALESCE(?, retention_department),
          Dept = COALESCE(?, Dept),
          Location = COALESCE(?, Location),
          un = COALESCE(?, un),
          imei = COALESCE(?, imei),
          imei2 = COALESCE(?, imei2),
          hw_rev = COALESCE(?, hw_rev),
          sample_separation_status = COALESCE(?, sample_separation_status),
          octa_status = COALESCE(?, octa_status),
          defect_status = COALESCE(?, defect_status),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        data.model, data.model, data.sn || assetNo, data.sn || assetNo,
        data.name, data.status_pinjam, data.status_audit,
        data.pic_sample || data.retention_owner, data.retention_owner, data.retention_department,
        data.retention_department, data.Location,
        data.un, data.imei, data.imei2, data.hw_rev,
        data.sample_separation_status, data.octa_status, data.defect_status,
        existing.id
      );
      return { id: existing.id, updated: true };
    } else {
      const result = db.prepare(`
        INSERT INTO database_sample (
          model, model_name, nomor_asset, sn, serial_no, name, status_pinjam, status_audit,
          pic_sample, retention_owner, retention_department, Dept, Location,
          un, imei, imei2, hw_rev, sample_separation_status, octa_status, defect_status, qr, timestamp
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `).run(
        data.model || 'UNKNOWN', data.model || 'UNKNOWN', assetNo, assetNo, assetNo,
        data.name || '', data.status_pinjam || 'KEMBALI', data.status_audit || 'RESET',
        data.pic_sample || data.retention_owner || '', data.retention_owner || '', data.retention_department || '',
        data.retention_department || 'PE Solution P /SEIN-P', data.Location || 'Dynamics Building',
        data.un || '', data.imei || '', data.imei2 || '', data.hw_rev || '',
        data.sample_separation_status || 'Dev.', data.octa_status || '', data.defect_status || 'Normal',
        `qr/qr_${assetNo}.png`, new Date().toISOString().replace('T', ' ').substring(0, 19)
      );
      return { id: result.lastInsertRowid, created: true };
    }
  }

  /**
   * Delete Sample
   */
  static deleteSample(id) {
    return db.prepare('DELETE FROM database_sample WHERE id = ?').run(id);
  }

  /**
   * Bulk Ingest Samples (from parsed array of objects)
   */
  static bulkImport(rows) {
    let inserted = 0;
    let updated = 0;
    let failed = 0;

    const upsertStmt = db.prepare(`
      INSERT INTO database_sample (
        model, model_name, nomor_asset, sn, serial_no, name, status_pinjam, status_audit,
        pic_sample, retention_owner, retention_department, Dept,
        sample_separation_status, octa_status, material_no_matching_status,
        defect_status, un_confirm_necessity, un, sample_processing, defect,
        imei_confirm_necessity, imei, imei2, hw_rev, pre_result, qr, timestamp
      ) VALUES (
        @model, @model_name, @nomor_asset, @sn, @serial_no, @name, @status_pinjam, @status_audit,
        @pic_sample, @retention_owner, @retention_department, @Dept,
        @sample_separation_status, @octa_status, @material_no_matching_status,
        @defect_status, @un_confirm_necessity, @un, @sample_processing, @defect,
        @imei_confirm_necessity, @imei, @imei2, @hw_rev, @pre_result, @qr, @timestamp
      )
      ON CONFLICT(nomor_asset) DO UPDATE SET
        model = COALESCE(excluded.model, database_sample.model),
        model_name = COALESCE(excluded.model_name, database_sample.model_name),
        sn = COALESCE(excluded.sn, database_sample.sn),
        serial_no = COALESCE(excluded.serial_no, database_sample.serial_no),
        un = COALESCE(excluded.un, database_sample.un),
        imei = COALESCE(excluded.imei, database_sample.imei),
        imei2 = COALESCE(excluded.imei2, database_sample.imei2),
        hw_rev = COALESCE(excluded.hw_rev, database_sample.hw_rev),
        pre_result = COALESCE(excluded.pre_result, database_sample.pre_result),
        retention_owner = COALESCE(excluded.retention_owner, database_sample.retention_owner),
        retention_department = COALESCE(excluded.retention_department, database_sample.retention_department),
        pic_sample = CASE WHEN database_sample.pic_sample = '' OR database_sample.pic_sample IS NULL THEN excluded.pic_sample ELSE database_sample.pic_sample END,
        sample_separation_status = COALESCE(excluded.sample_separation_status, database_sample.sample_separation_status),
        octa_status = COALESCE(excluded.octa_status, database_sample.octa_status),
        material_no_matching_status = COALESCE(excluded.material_no_matching_status, database_sample.material_no_matching_status),
        defect_status = COALESCE(excluded.defect_status, database_sample.defect_status),
        un_confirm_necessity = COALESCE(excluded.un_confirm_necessity, database_sample.un_confirm_necessity),
        sample_processing = COALESCE(excluded.sample_processing, database_sample.sample_processing),
        defect = COALESCE(excluded.defect, database_sample.defect),
        imei_confirm_necessity = COALESCE(excluded.imei_confirm_necessity, database_sample.imei_confirm_necessity),
        updated_at = CURRENT_TIMESTAMP
    `);

    const transaction = db.transaction((items) => {
      for (const row of items) {
        const assetNo = (row.Serial || row.serial || row.nomor_asset || row.sn || row.serial_no || '').trim();
        const modelName = (row['Model Name'] || row.model_name || row.model || '').trim();
        if (!assetNo && !modelName) {
          failed++;
          continue;
        }

        const effectiveAsset = assetNo || `DEV_${Date.now()}_${Math.floor(Math.random()*1000)}`;
        const exists = db.prepare('SELECT id FROM database_sample WHERE nomor_asset = ?').get(effectiveAsset);

        upsertStmt.run({
          model: modelName,
          model_name: modelName,
          nomor_asset: effectiveAsset,
          sn: effectiveAsset,
          serial_no: effectiveAsset,
          name: row.name || '',
          status_pinjam: row.status_pinjam || 'KEMBALI',
          status_audit: row.status_audit || 'RESET',
          pic_sample: row['Retention Owner'] || row.retention_owner || row.pic_sample || '',
          retention_owner: row['Retention Owner'] || row.retention_owner || '',
          retention_department: row['Retention Department'] || row.retention_department || 'PE Solution P /SEIN-P',
          Dept: row['Retention Department'] || row.retention_department || 'PE Solution P /SEIN-P',
          sample_separation_status: row['Sample separation status'] || row.sample_separation_status || 'Dev.',
          octa_status: row['OCTA status'] || row.octa_status || '',
          material_no_matching_status: row['Material no matching status'] || row.material_no_matching_status || '',
          defect_status: row['Defect status Y/N'] || row.defect_status || 'Normal',
          un_confirm_necessity: row['UN confirm necessity'] || row.un_confirm_necessity || 'Normal',
          un: row['UN'] || row.un || '',
          sample_processing: row['Sample Processing'] || row.sample_processing || '',
          defect: row['Defect'] || row.defect || '',
          imei_confirm_necessity: row['IMEI confirm necessity'] || row.imei_confirm_necessity || 'Normal',
          imei: row['IMEI'] || row.imei || '',
          imei2: row['IMEI2'] || row.imei2 || '',
          hw_rev: row['HW Rev.'] || row.hw_rev || '',
          pre_result: row['Pre result'] || row.pre_result || 'N',
          qr: `qr/qr_${effectiveAsset}.png`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
        });

        if (exists) {
          updated++;
        } else {
          inserted++;
        }
      }
    });

    transaction(rows);

    return {
      total: rows.length,
      inserted,
      updated,
      failed
    };
  }

  /**
   * Get Dashboard & Screensaver live analytics
   */
  static getDashboardStats() {
    const totalSamples = db.prepare('SELECT COUNT(*) as c FROM database_sample').get().c;
    const borrowed = db.prepare(`SELECT COUNT(*) as c FROM database_sample WHERE status_pinjam = 'PINJAM'`).get().c;
    const available = db.prepare(`SELECT COUNT(*) as c FROM database_sample WHERE status_pinjam != 'PINJAM' OR status_pinjam IS NULL`).get().c;
    const audited = db.prepare(`SELECT COUNT(*) as c FROM database_sample WHERE status_audit = 'SUDAH'`).get().c;
    const unaudited = db.prepare(`SELECT COUNT(*) as c FROM database_sample WHERE status_audit != 'SUDAH' OR status_audit IS NULL`).get().c;
    const defects = db.prepare(`SELECT COUNT(*) as c FROM database_sample WHERE defect_status LIKE '%Defect%' OR defect != ''`).get().c;

    // Recent activity flows
    const recentFlows = db.prepare(`
      SELECT * FROM flow_sample 
      ORDER BY id DESC 
      LIMIT 20
    `).all();

    // Active Borrowers list & their individual borrowed items (for index.php card view)
    const borrowedItems = db.prepare(`
      SELECT id, name, nomor_asset, sn, model, model_name, timestamp, imei, hw_rev, pic_sample, Dept
      FROM database_sample 
      WHERE status_pinjam = 'PINJAM' AND name != ''
      ORDER BY timestamp DESC
    `).all();

    const borrowerCardsMap = new Map();
    for (const item of borrowedItems) {
      if (!borrowerCardsMap.has(item.name)) {
        borrowerCardsMap.set(item.name, {
          name: item.name,
          count: 0,
          items: []
        });
      }
      const b = borrowerCardsMap.get(item.name);
      b.count++;
      b.items.push(item);
    }
    const userCards = Array.from(borrowerCardsMap.values());

    const activeBorrowers = userCards.map(u => ({ name: u.name, count: u.count }));

    // Top Models
    const topModels = db.prepare(`
      SELECT model, COUNT(*) as total, 
             SUM(CASE WHEN status_pinjam = 'PINJAM' THEN 1 ELSE 0 END) as borrowed
      FROM database_sample 
      WHERE model != '' AND model IS NOT NULL
      GROUP BY model 
      ORDER BY total DESC 
      LIMIT 10
    `).all();

    return {
      totalSamples,
      borrowed,
      available,
      audited,
      unaudited,
      defects,
      recentFlows,
      activeBorrowers,
      userCards,
      topModels
    };
  }

  /**
   * Get all models grouped with items for Model Cards view
   */
  static getModelCards(search = '') {
    let query = `
      SELECT id, model, model_name, nomor_asset, sn, serial_no, imei, imei2, un,
             status_pinjam, status_audit, defect_status, octa_status, hw_rev, name, retention_owner, Dept
      FROM database_sample
      WHERE 1=1
    `;
    const params = [];

    if (search && search.trim()) {
      query += ` AND (model LIKE ? OR nomor_asset LIKE ? OR sn LIKE ? OR imei LIKE ? OR un LIKE ? OR name LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term, term);
    }

    query += ` ORDER BY model ASC, id ASC`;
    const rows = db.prepare(query).all(...params);

    const modelMap = new Map();
    for (const row of rows) {
      const modelKey = (row.model || row.model_name || 'UNKNOWN').trim() || 'UNKNOWN';
      if (!modelMap.has(modelKey)) {
        modelMap.set(modelKey, {
          model: modelKey,
          total: 0,
          borrowed: 0,
          available: 0,
          audited: 0,
          defects: 0,
          items: []
        });
      }
      const m = modelMap.get(modelKey);
      m.total++;
      if (row.status_pinjam === 'PINJAM') m.borrowed++;
      else m.available++;

      if (row.status_audit === 'SUDAH') m.audited++;
      if (row.defect_status && row.defect_status.toLowerCase().includes('defect')) m.defects++;

      m.items.push(row);
    }

    return Array.from(modelMap.values());
  }

  /**
   * Export database to Excel buffer or CSV string
   */
  static exportSamples(format = 'xlsx') {
    const samples = db.prepare('SELECT * FROM database_sample ORDER BY id ASC').all();
    
    if (format === 'csv') {
      if (samples.length === 0) return '';
      const headers = Object.keys(samples[0]);
      const csvRows = [headers.join(',')];
      for (const row of samples) {
        const values = headers.map(h => {
          const val = row[h] === null || row[h] === undefined ? '' : String(row[h]);
          return `"${val.replace(/"/g, '""')}"`;
        });
        csvRows.push(values.join(','));
      }
      return csvRows.join('\n');
    }

    // Default XLSX
    const ws = XLSX.utils.json_to_sheet(samples);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Database Sample');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
}
