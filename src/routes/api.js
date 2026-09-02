import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { SampleService } from '../services/sampleService.js';
import { QRService } from '../services/qrService.js';
import { authenticate, requireSuperUser, optionalAuth } from './auth.js';
import { resetDatabase } from '../db/seed.js';
import db from '../db/database.js';

export const apiRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

// Broadcast helper (passed from server.js)
let broadcastEvent = () => {};
export function setBroadcastFn(fn) {
  broadcastEvent = fn;
}

/**
 * 1. Borrow / Return Scan
 */
apiRouter.post('/borrow-return', optionalAuth, async (req, res) => {
  try {
    const { name, nomor_asset, proof_image } = req.body;
    const borrowerName = name || req.user?.name;

    if (!borrowerName) {
      return res.status(400).json({
        success: false,
        action: 'TIDAK_TERSEDIA',
        message: 'Nama peminjam wajib diisi / discan'
      });
    }

    const result = SampleService.borrowReturnProcess({
      name: borrowerName,
      nomor_asset,
      proof_image
    });

    if (result.success) {
      broadcastEvent('SAMPLE_UPDATED', {
        action: result.action,
        sample: result.sample,
        message: result.message,
        proof_image: result.proof_image
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 2. Audit Scan
 */
apiRouter.post('/audit', optionalAuth, async (req, res) => {
  try {
    const { name, nomor_asset, proof_image } = req.body;
    const auditorName = name || req.user?.name || 'AUDITOR';

    const result = SampleService.auditProcess({
      name: auditorName,
      nomor_asset,
      proof_image
    });

    if (result.success && (result.action === 'BERHASIL' || result.action === 'SUDAH')) {
      broadcastEvent('AUDIT_UPDATED', {
        action: result.action,
        sample: result.sample,
        message: result.message,
        proof_image: result.proof_image
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 3. Reset Audit Status (Super User)
 */
apiRouter.post('/audit/reset', authenticate, requireSuperUser, async (req, res) => {
  try {
    const result = SampleService.resetAuditStatus(req.user.name);
    broadcastEvent('AUDIT_RESET', { message: result.message });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 3b. Reset Entire Database (Super User)
 */
apiRouter.post('/database/reset', authenticate, requireSuperUser, async (req, res) => {
  try {
    const result = await resetDatabase(req.body);
    broadcastEvent('DATABASE_RESET', { message: result.message, options: req.body });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 4. Sample Listing & Filters
 */
apiRouter.get('/samples', async (req, res) => {
  try {
    const result = SampleService.getSamples(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 4b. Model Cards Overview
 */
apiRouter.get('/models-overview', async (req, res) => {
  try {
    const { search } = req.query;
    const modelCards = SampleService.getModelCards(search);
    res.json({ success: true, count: modelCards.length, models: modelCards });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 5. Sample Detail
 */
apiRouter.get('/samples/:id', async (req, res) => {
  try {
    const sample = SampleService.getSample(req.params.id);
    if (!sample) return res.status(404).json({ success: false, message: 'Sample tidak ditemukan' });
    res.json({ success: true, sample });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 6. Create / Update Sample
 */
apiRouter.post('/samples', optionalAuth, async (req, res) => {
  try {
    const result = SampleService.saveSample(req.body);
    broadcastEvent('SAMPLE_UPDATED', { action: 'SAVE', sample: req.body });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.put('/samples/:id', optionalAuth, async (req, res) => {
  try {
    const sampleData = { ...req.body, id: req.params.id };
    const result = SampleService.saveSample(sampleData);
    broadcastEvent('SAMPLE_UPDATED', { action: 'UPDATE', sample: sampleData });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/samples/:id', authenticate, requireSuperUser, async (req, res) => {
  try {
    SampleService.deleteSample(req.params.id);
    broadcastEvent('SAMPLE_UPDATED', { action: 'DELETE', id: req.params.id });
    res.json({ success: true, message: 'Sample berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 7. Bulk Ingestion (JSON / Array payload)
 */
apiRouter.post('/samples/bulk-import', authenticate, async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Data baris tidak valid / kosong' });
    }

    const summary = SampleService.bulkImport(rows);
    broadcastEvent('BULK_IMPORT_COMPLETED', summary);
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 8. Excel / CSV File Upload Ingestion
 */
apiRouter.post('/samples/upload-file', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File wajib diunggah (.xlsx, .xls, .csv)' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (jsonData.length === 0) {
      return res.status(400).json({ success: false, message: 'File kosong atau tidak terbaca' });
    }

    const summary = SampleService.bulkImport(jsonData);
    broadcastEvent('BULK_IMPORT_COMPLETED', summary);
    res.json({ success: true, summary, previewCount: jsonData.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 9. Export Samples to Excel/CSV
 */
apiRouter.get('/export', async (req, res) => {
  try {
    const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
    const result = SampleService.exportSamples(format);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="database_sample_${timestamp}.csv"`);
      return res.send(result);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="database_sample_${timestamp}.xlsx"`);
    res.send(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 10. Dashboard & Live Analytics
 */
apiRouter.get('/dashboard', async (req, res) => {
  try {
    const stats = SampleService.getDashboardStats();
    res.json({ success: true, borrowers: stats.userCards, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/stats', async (req, res) => {
  try {
    const stats = SampleService.getDashboardStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/stats/dashboard', async (req, res) => {
  try {
    const stats = SampleService.getDashboardStats();
    res.json({ success: true, stats, borrowers: stats.userCards });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 11. Dynamic QR Code Image Generation
 */
apiRouter.get('/qr', async (req, res) => {
  try {
    const text = req.query.text || 'SAMPLE';
    const buffer = await QRService.generateBuffer(text, { width: parseInt(req.query.width, 10) || 300 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    res.status(500).send('QR generation failed');
  }
});

/**
 * 12. Flow & Audit History Queries
 */
apiRouter.get('/flows', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const flows = db.prepare('SELECT * FROM flow_sample ORDER BY id DESC LIMIT ?').all(limit);
    res.json({ success: true, flows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/audits', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const audits = db.prepare('SELECT * FROM audit_sample ORDER BY id DESC LIMIT ?').all(limit);
    res.json({ success: true, audits });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
