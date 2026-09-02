import { Auth, showGiantAlert, SoundEffects } from '/js/app.js';

let allParsedRows = [];
let previewCurrentPage = 1;
let previewPageSize = 100;

const tsvInput = document.getElementById('raw-tsv-input');
const previewContainer = document.getElementById('preview-container');
const previewTbody = document.getElementById('preview-tbody');
const previewSummary = document.getElementById('preview-summary');
const previewTotalBadge = document.getElementById('preview-total-badge');
const previewPageSizeSelect = document.getElementById('preview-page-size');
const previewPaginationInfo = document.getElementById('preview-pagination-info');
const btnPreviewPrev = document.getElementById('btn-preview-prev');
const btnPreviewNext = document.getElementById('btn-preview-next');

const btnCommit = document.getElementById('btn-commit-import');
const fileInput = document.getElementById('file-input');
const dropzone = document.getElementById('dropzone');

const progressContainer = document.getElementById('import-progress-container');
const progressBar = document.getElementById('import-progress-bar');
const progressStatusTitle = document.getElementById('progress-status-title');
const progressPercentageBadge = document.getElementById('progress-percentage-badge');
const progressBatchDetail = document.getElementById('progress-batch-detail');
const progressStatsDetail = document.getElementById('progress-stats-detail');

// Helper: Normalize Row Object Keys (Handles variations of Excel column headers)
function normalizeRowObject(raw) {
  const normalized = {};
  for (const [key, val] of Object.entries(raw)) {
    const k = key.trim();
    const v = String(val !== undefined && val !== null ? val : '').trim();

    if (/^model(\s*name)?$/i.test(k)) normalized['Model Name'] = v;
    else if (/^(serial|sn|no\.?\s*asset|nomor\s*asset)$/i.test(k)) normalized['Serial'] = v;
    else if (/^octa/i.test(k)) normalized['OCTA status'] = v;
    else if (/^un$/i.test(k) || /^un\s*code/i.test(k)) normalized['UN'] = v;
    else if (/^imei2$/i.test(k)) normalized['IMEI2'] = v;
    else if (/^imei$/i.test(k) || /^imei1$/i.test(k)) normalized['IMEI'] = v;
    else if (/^hw(\s*rev)?/i.test(k)) normalized['HW Rev.'] = v;
    else if (/^(retention\s*owner|pic(\s*sample)?|owner)$/i.test(k)) normalized['Retention Owner'] = v;
    else if (/^(retention\s*dept|retention\s*department|dept|departemen)$/i.test(k)) normalized['Retention Department'] = v;
    else normalized[k] = v;
  }
  return normalized;
}

// Parse pasted TSV / CSV text
function parseTextData(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  let headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
  const hasHeader = headers.some(h => /model|serial|asset|imei/i.test(h));

  const rows = [];
  const startIndex = hasHeader ? 1 : 0;

  if (!hasHeader) {
    headers = ['Model Name', 'Serial', 'Sample separation status', 'OCTA status', 'Material no matching status', 'Defect status Y/N', 'UN confirm necessity', 'UN', 'Sample Processing', 'Defect', 'IMEI confirm necessity', 'IMEI', 'IMEI2', 'HW Rev.', 'Pre result', 'Retention Owner', 'Retention Department'];
  }

  for (let i = startIndex; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length < 2) continue;
    if (cols[0] === 'Model Name' && cols[1] === 'Serial') continue;

    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] || '';
    });
    rows.push(normalizeRowObject(obj));
  }

  return rows;
}

// Render Paginated Preview Table
function renderPreviewTable() {
  const total = allParsedRows.length;
  if (total === 0) {
    previewContainer.classList.add('d-none');
    return;
  }

  previewTotalBadge.textContent = `Total: ${total.toLocaleString('id-ID')} Sample`;
  previewSummary.textContent = `${total.toLocaleString('id-ID')} data sample terdeteksi, siap dikirim dalam batch 100 baris.`;

  let startIdx = 0;
  let endIdx = total;
  let totalPages = 1;

  if (previewPageSize !== 'all') {
    const size = parseInt(previewPageSize, 10);
    totalPages = Math.ceil(total / size) || 1;
    if (previewCurrentPage > totalPages) previewCurrentPage = totalPages;
    if (previewCurrentPage < 1) previewCurrentPage = 1;

    startIdx = (previewCurrentPage - 1) * size;
    endIdx = Math.min(startIdx + size, total);
    previewPaginationInfo.textContent = `Menampilkan ${startIdx + 1} - ${endIdx} dari ${total.toLocaleString('id-ID')} data (Halaman ${previewCurrentPage} / ${totalPages})`;
    btnPreviewPrev.disabled = previewCurrentPage <= 1;
    btnPreviewNext.disabled = previewCurrentPage >= totalPages;
    document.getElementById('preview-pagination-container').classList.remove('d-none');
  } else {
    previewPaginationInfo.textContent = `Menampilkan seluruh ${total.toLocaleString('id-ID')} baris data`;
    document.getElementById('preview-pagination-container').classList.add('d-none');
  }

  const rowsToDisplay = allParsedRows.slice(startIdx, endIdx);

  previewTbody.innerHTML = rowsToDisplay.map((r, i) => {
    const rowNum = startIdx + i + 1;
    const model = r['Model Name'] || r.model_name || r.model || '-';
    const serial = r.Serial || r.serial || r.nomor_asset || r.sn || '-';
    const octa = r['OCTA status'] || r.octa_status || '-';
    const un = r.UN || r.un || '-';
    const imei = r.IMEI || r.imei || '-';
    const imei2 = r.IMEI2 || r.imei2 || '-';
    const hwRev = r['HW Rev.'] || r.hw_rev || '-';
    const owner = r['Retention Owner'] || r.retention_owner || '-';
    const dept = r['Retention Department'] || r.retention_department || '-';

    return `
      <tr>
        <td class="text-secondary font-monospace">${rowNum}</td>
        <td class="fw-bold text-primary">${model}</td>
        <td><span class="badge bg-dark border border-secondary">${serial}</span></td>
        <td>${octa}</td>
        <td class="font-monospace small">${un}</td>
        <td class="font-monospace small">${imei}</td>
        <td class="font-monospace small">${imei2}</td>
        <td>${hwRev}</td>
        <td class="fw-semibold">${owner}</td>
        <td class="small text-secondary">${dept}</td>
      </tr>
    `;
  }).join('');

  previewContainer.classList.remove('d-none');
}

function setParsedData(rows) {
  allParsedRows = rows;
  previewCurrentPage = 1;
  renderPreviewTable();
  previewContainer.scrollIntoView({ behavior: 'smooth' });
}

if (previewPageSizeSelect) {
  previewPageSizeSelect.addEventListener('change', (e) => {
    previewPageSize = e.target.value;
    previewCurrentPage = 1;
    renderPreviewTable();
  });
}

if (btnPreviewPrev) {
  btnPreviewPrev.addEventListener('click', () => {
    if (previewCurrentPage > 1) {
      previewCurrentPage--;
      renderPreviewTable();
    }
  });
}

if (btnPreviewNext) {
  btnPreviewNext.addEventListener('click', () => {
    const size = parseInt(previewPageSize, 10) || 100;
    const totalPages = Math.ceil(allParsedRows.length / size);
    if (previewCurrentPage < totalPages) {
      previewCurrentPage++;
      renderPreviewTable();
    }
  });
}

const btnParsePaste = document.getElementById('btn-parse-paste');
if (btnParsePaste) {
  btnParsePaste.addEventListener('click', () => {
    const text = tsvInput.value.trim();
    if (!text) {
      alert('Silakan paste data tabel terlebih dahulu');
      return;
    }
    const rows = parseTextData(text);
    if (rows.length === 0) {
      alert('Tidak ada data valid yang dapat diproses dari teks yang dimasukkan.');
      return;
    }
    setParsedData(rows);
  });
}

const btnLoadSample = document.getElementById('btn-load-sample-data');
if (btnLoadSample) {
  btnLoadSample.addEventListener('click', () => {
    tsvInput.value = `Model Name\tSerial\tSample separation status\tOCTA status\tMaterial no matching status\tDefect status Y/N\tUN confirm necessity\tUN\tSample Processing\tDefect\tIMEI confirm necessity\tIMEI\tIMEI2\tHW Rev.\tPre result\tRetention Owner\tRetention Department
SM-A013G_SEA_XTC\tTFN0310M\tDev.\t\t\t\tNormal\tCQX00BD71D47F57\t\t\tNormal\t353211760041026\t\tUNKNOWN\tN\tLutfi Bukhari\tPE Solution P /SEIN-P
SM-A022F_SEA_XXV\tTLQ1186M\tDev.\t\t\t\tNormal\tCGX0043716889B7\t\t\tNormal\t351389220012951\t\tREV0.2\tN\tEndri Susanto\tPE Solution P /SEIN-P
SM-S928BE_SEA_DX\tWJD3587M\tDev.\tU\t\t\tNormal\tCE08237854219562107E\t\t\tNormal\t358366880012623\t\tREV0.5A\tN\tEndri Susanto\tPE Solution P /SEIN-P
SM-S942BE_SEA_DX\tYKE0215M\tDev.\tU\t\t\tNormal\t98A25B4C473355583437\t\t\tNormal\t352259840015503\t353144250015509\tUNKNOWN\tN\tLutfi Bukhari\tPE Solution P /SEIN-P
SM-X846B_EUR_XX\tZES1079M\tDev.\t\t\t\tNormal\tCE0426A43ADACDE9407E\t\t\tNormal\t350332310077675\t352438440077671\tREV0.4\tN\tDHANAR KURNIA PUTRA\tPE Solution P /SEIN-P`;
  });
}

const btnClearText = document.getElementById('btn-clear-text');
if (btnClearText) {
  btnClearText.addEventListener('click', () => {
    tsvInput.value = '';
    allParsedRows = [];
    previewContainer.classList.add('d-none');
  });
}

// File Dropzone handlers (Client-side Excel parsing via SheetJS)
if (dropzone) {
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      handleFileSelect(e.dataTransfer.files[0]);
    }
  });
}

if (fileInput) {
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFileSelect(fileInput.files[0]);
  });
}

function handleFileSelect(file) {
  const fileSelectedName = document.getElementById('file-selected-name');
  if (fileSelectedName) {
    fileSelectedName.innerHTML = `<i class="fas fa-file-alt me-1"></i> ${file.name} (${(file.size/1024).toFixed(1)} KB)`;
  }
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!rawJson || rawJson.length === 0) {
        alert('File kosong atau tidak memiliki data baris.');
        return;
      }

      const normalizedRows = rawJson.map(r => normalizeRowObject(r));
      setParsedData(normalizedRows);
    } catch (err) {
      alert('Gagal membaca file Excel/CSV: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// Commit Bulk Ingestion to Database in 100-Row Batches
if (btnCommit) {
  btnCommit.addEventListener('click', async () => {
    if (allParsedRows.length === 0) return;

    const totalRows = allParsedRows.length;
    const batchSize = 100;
    const totalBatches = Math.ceil(totalRows / batchSize);

    if (!confirm(`Konfirmasi Ingestion:\nKirim ${totalRows.toLocaleString('id-ID')} data sample ke server dalam ${totalBatches} batch (per 100 baris)?`)) {
      return;
    }

    btnCommit.disabled = true;
    btnCommit.innerHTML = `<i class="fas fa-spinner fa-spin me-2"></i>Memproses Batch...`;
    
    progressContainer.classList.remove('d-none');
    progressContainer.scrollIntoView({ behavior: 'smooth' });

    let cumulativeInserted = 0;
    let cumulativeUpdated = 0;
    let cumulativeFailed = 0;

    for (let i = 0; i < totalBatches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, totalRows);
      const batchRows = allParsedRows.slice(start, end);
      const batchNumber = i + 1;
      const currentPercentage = Math.round((batchNumber / totalBatches) * 100);

      // Update progress UI
      progressBar.style.width = `${currentPercentage}%`;
      progressPercentageBadge.textContent = `${currentPercentage}%`;
      progressBatchDetail.textContent = `Mengirim Batch ${batchNumber} dari ${totalBatches} (${end}/${totalRows} baris)`;
      progressStatsDetail.textContent = `Baru: ${cumulativeInserted} | Diupdate: ${cumulativeUpdated} | Gagal: ${cumulativeFailed}`;

      try {
        const res = await fetch('/api/samples/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: batchRows })
        });

        const data = await res.json();
        if (data.success && data.summary) {
          cumulativeInserted += data.summary.inserted || 0;
          cumulativeUpdated += data.summary.updated || 0;
          cumulativeFailed += data.summary.failed || 0;
        } else {
          cumulativeFailed += batchRows.length;
          console.error(`Batch ${batchNumber} error:`, data.message);
        }
      } catch (err) {
        cumulativeFailed += batchRows.length;
        console.error(`Batch ${batchNumber} network error:`, err);
      }

      progressStatsDetail.textContent = `Baru: ${cumulativeInserted} | Diupdate: ${cumulativeUpdated} | Gagal: ${cumulativeFailed}`;
    }

    SoundEffects.play('SUCCESS');
    progressStatusTitle.innerHTML = `<i class="fas fa-check-circle text-success me-2"></i> Ingestion Selesai!`;
    progressBar.style.width = '100%';
    progressPercentageBadge.textContent = '100%';
    progressPercentageBadge.className = 'badge bg-success fs-6 font-monospace';

    showGiantAlert({
      title: 'BULK IMPORT SUKSES!',
      message: `Total: ${totalRows.toLocaleString('id-ID')} Baris<br>Data Baru: ${cumulativeInserted} | Diperbarui: ${cumulativeUpdated} | Gagal: ${cumulativeFailed}`,
      action: 'SUCCESS',
      duration: 4500
    });

    btnCommit.disabled = false;
    btnCommit.innerHTML = `<i class="fas fa-check-circle me-1"></i> Simpan ke Database (Batch 100)`;
  });
}
