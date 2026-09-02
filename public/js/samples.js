import { Auth, setupWebSocket } from '/js/app.js';

let currentPage = 1;
let totalPages = 1;
const sampleTbody = document.getElementById('sample-tbody');
const searchInput = document.getElementById('search-input');
const filterPinjam = document.getElementById('filter-pinjam');
const filterAudit = document.getElementById('filter-audit');
const filterLimit = document.getElementById('filter-limit');
const detailModal = new bootstrap.Modal(document.getElementById('sampleDetailModal'));
const editModal = new bootstrap.Modal(document.getElementById('sampleEditModal'));

async function loadSamples(page = 1) {
  currentPage = page;
  const params = new URLSearchParams({
    page: currentPage,
    limit: filterLimit.value,
    search: searchInput.value.trim(),
    status_pinjam: filterPinjam.value,
    status_audit: filterAudit.value,
    sortBy: 'id',
    sortOrder: 'DESC'
  });

  sampleTbody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-secondary"><i class="fas fa-spinner fa-spin me-2"></i>Memuat data...</td></tr>`;

  try {
    const res = await fetch(`/api/samples?${params.toString()}`);
    const data = await res.json();

    totalPages = data.totalPages || 1;
    document.getElementById('page-info').textContent = `Halaman ${data.page} dari ${totalPages} (Total: ${data.total} item)`;
    document.getElementById('table-summary-text').textContent = `Menampilkan ${data.data.length} dari ${data.total} sample`;
    document.getElementById('btn-prev-page').disabled = currentPage <= 1;
    document.getElementById('btn-next-page').disabled = currentPage >= totalPages;

    if (!data.data || data.data.length === 0) {
      sampleTbody.innerHTML = `<tr><td colspan="11" class="text-center py-5 text-muted">Tidak ada data sample yang cocok</td></tr>`;
      return;
    }

    sampleTbody.innerHTML = data.data.map(s => {
      const isPinjam = (s.status_pinjam || '').toUpperCase() === 'PINJAM';
      const isAudited = (s.status_audit || '').toUpperCase() === 'SUDAH';
      const serial = s.nomor_asset || s.sn || '-';
      return `
        <tr>
          <td>${s.id}</td>
          <td class="fw-bold text-primary">${s.model || s.model_name || '-'}</td>
          <td><span class="badge bg-dark border border-secondary">${serial}</span></td>
          <td>
            <span class="badge-status ${isPinjam ? 'badge-pinjam' : 'badge-kembali'}">
              ${isPinjam ? '<i class="fas fa-hand-holding"></i>' : '<i class="fas fa-check"></i>'}
              ${s.status_pinjam || 'KEMBALI'}
            </span>
          </td>
          <td class="fw-semibold">${s.name || '-'}</td>
          <td>
            <span class="badge-status ${isAudited ? 'badge-audit-sudah' : 'badge-audit-reset'}">
              ${s.status_audit || 'RESET'}
            </span>
          </td>
          <td>
            <div class="small">${s.imei || '-'}</div>
            ${s.un ? `<div class="text-muted small">UN: ${s.un}</div>` : ''}
          </td>
          <td>${s.hw_rev || '-'}</td>
          <td>${s.retention_owner || s.pic_sample || '-'}</td>
          <td class="small text-secondary">${s.retention_department || s.Dept || '-'}</td>
          <td class="text-center">
            <div class="btn-group btn-group-sm">
              <button class="btn btn-surface btn-view" data-id="${s.id}" title="Detail & QR"><i class="fas fa-eye"></i></button>
              <button class="btn btn-surface btn-edit" data-id="${s.id}" title="Edit"><i class="fas fa-edit"></i></button>
              <button class="btn btn-surface text-danger btn-delete" data-id="${s.id}" title="Hapus"><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach buttons handlers
    document.querySelectorAll('.btn-view').forEach(b => b.addEventListener('click', () => showDetail(b.dataset.id)));
    document.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', () => openEdit(b.dataset.id)));
    document.querySelectorAll('.btn-delete').forEach(b => b.addEventListener('click', () => deleteItem(b.dataset.id)));
  } catch (err) {
    sampleTbody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-danger">Gagal memuat data: ${err.message}</td></tr>`;
  }
}

async function showDetail(id) {
  try {
    const res = await fetch(`/api/samples/${id}`);
    const { sample } = await res.json();
    if (!sample) return;

    const assetNo = sample.nomor_asset || sample.sn;
    const qrUrl = `/api/qr?text=${encodeURIComponent(assetNo)}&width=250`;

    document.getElementById('detailModalTitle').textContent = `Detail Sample: ${sample.model || ''} (${assetNo})`;
    document.getElementById('detailModalBody').innerHTML = `
      <div class="row">
        <div class="col-md-5 text-center mb-3">
          <div class="p-3 bg-white rounded shadow-sm d-inline-block">
            <img src="${qrUrl}" alt="QR Code" class="img-fluid" style="width: 180px; height: 180px;">
          </div>
          <div class="mt-2 fw-bold text-light">${assetNo}</div>
          <div class="text-secondary small">${sample.model || ''}</div>
        </div>
        <div class="col-md-7">
          <table class="table table-sm table-borderless text-light">
            <tr><th width="40%" class="text-secondary">Model</th><td>${sample.model || '-'}</td></tr>
            <tr><th class="text-secondary">Serial / No. Asset</th><td><span class="badge bg-dark border border-secondary">${assetNo}</span></td></tr>
            <tr><th class="text-secondary">Status Pinjam</th><td><span class="badge ${sample.status_pinjam === 'PINJAM' ? 'bg-danger' : 'bg-success'}">${sample.status_pinjam}</span></td></tr>
            <tr><th class="text-secondary">Peminjam Terakhir</th><td>${sample.name || '-'}</td></tr>
            <tr><th class="text-secondary">Status Audit</th><td><span class="badge ${sample.status_audit === 'SUDAH' ? 'bg-success' : 'bg-warning'}">${sample.status_audit}</span></td></tr>
            <tr><th class="text-secondary">Tanggal Pengecekan</th><td>${sample.latest_check || '-'}</td></tr>
            <tr><th class="text-secondary">IMEI 1</th><td>${sample.imei || '-'}</td></tr>
            <tr><th class="text-secondary">IMEI 2</th><td>${sample.imei2 || '-'}</td></tr>
            <tr><th class="text-secondary">UN Code</th><td>${sample.un || '-'}</td></tr>
            <tr><th class="text-secondary">HW Rev.</th><td>${sample.hw_rev || '-'}</td></tr>
            <tr><th class="text-secondary">Retention Owner</th><td>${sample.retention_owner || sample.pic_sample || '-'}</td></tr>
            <tr><th class="text-secondary">Departemen</th><td>${sample.retention_department || sample.Dept || '-'}</td></tr>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btn-print-qr').onclick = () => {
      const win = window.open('', '_blank');
      if (!win) return alert('Pop-up terblokir. Izinkan pop-up untuk mencetak badge.');
      
      const doc = win.document;
      doc.open();
      doc.write('<html><head><title>Print QR - ' + assetNo + '</title></head>');
      doc.write('<body style="text-align:center; padding: 20px; font-family: sans-serif;">');
      doc.write('<img src="' + qrUrl + '" style="width:200px; height:200px;"><br>');
      doc.write('<h2>' + assetNo + '</h2>');
      doc.write('<p><strong>' + (sample.model || '') + '</strong></p>');
      doc.write('<p>' + (sample.retention_owner || '') + ' | ' + (sample.retention_department || '') + '</p>');
      doc.write('</body></html>');
      doc.close();
      win.focus();
      setTimeout(() => { win.print(); }, 400);
    };

    detailModal.show();
  } catch (e) {
    alert('Gagal memuat detail sample: ' + e.message);
  }
}

async function openEdit(id) {
  document.getElementById('sample-form').reset();
  document.getElementById('edit-id').value = '';
  document.getElementById('formModalTitle').textContent = 'Tambah Sample Baru';

  if (id) {
    document.getElementById('formModalTitle').textContent = 'Edit Sample';
    const res = await fetch(`/api/samples/${id}`);
    const { sample } = await res.json();
    if (sample) {
      document.getElementById('edit-id').value = sample.id;
      document.getElementById('edit-model').value = sample.model || '';
      document.getElementById('edit-asset').value = sample.nomor_asset || sample.sn || '';
      document.getElementById('edit-status-pinjam').value = sample.status_pinjam || 'KEMBALI';
      document.getElementById('edit-status-audit').value = sample.status_audit || 'RESET';
      document.getElementById('edit-name').value = sample.name || '';
      document.getElementById('edit-defect-status').value = sample.defect_status || 'Normal';
      document.getElementById('edit-defect-detail').value = sample.defect || '';
      document.getElementById('edit-octa-status').value = sample.octa_status || '';
      document.getElementById('edit-imei').value = sample.imei || '';
      document.getElementById('edit-un').value = sample.un || '';
      document.getElementById('edit-hw-rev').value = sample.hw_rev || '';
      document.getElementById('edit-retention-owner').value = sample.retention_owner || sample.pic_sample || '';
      document.getElementById('edit-dept').value = sample.retention_department || sample.Dept || '';
    }
  }
  editModal.show();
}

async function deleteItem(id) {
  if (!confirm('Hapus sample ini dari database?')) return;
  try {
    const res = await fetch(`/api/samples/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadSamples(currentPage);
    } else {
      alert(data.message || 'Gagal menghapus sample (Perlu Super User)');
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

document.getElementById('sample-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-id').value;
  const payload = {
    model: document.getElementById('edit-model').value.trim(),
    nomor_asset: document.getElementById('edit-asset').value.trim(),
    status_pinjam: document.getElementById('edit-status-pinjam').value,
    status_audit: document.getElementById('edit-status-audit').value,
    defect_status: document.getElementById('edit-defect-status').value,
    defect: document.getElementById('edit-defect-detail').value.trim(),
    octa_status: document.getElementById('edit-octa-status').value,
    name: document.getElementById('edit-name').value.trim(),
    imei: document.getElementById('edit-imei').value.trim(),
    un: document.getElementById('edit-un').value.trim(),
    hw_rev: document.getElementById('edit-hw-rev').value.trim(),
    retention_owner: document.getElementById('edit-retention-owner').value.trim(),
    retention_department: document.getElementById('edit-dept').value.trim()
  };

  try {
    const url = id ? `/api/samples/${id}` : '/api/samples';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      editModal.hide();
      loadSamples(currentPage);
    } else {
      alert(data.message || 'Gagal menyimpan sample');
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
});

document.getElementById('btn-add-sample').addEventListener('click', () => openEdit());
document.getElementById('btn-filter').addEventListener('click', () => loadSamples(1));
document.getElementById('btn-reset-filter').addEventListener('click', () => {
  searchInput.value = '';
  filterPinjam.value = '';
  filterAudit.value = '';
  loadSamples(1);
});

document.getElementById('btn-prev-page').addEventListener('click', () => {
  if (currentPage > 1) loadSamples(currentPage - 1);
});

document.getElementById('btn-next-page').addEventListener('click', () => {
  if (currentPage < totalPages) loadSamples(currentPage + 1);
});

setupWebSocket(() => loadSamples(currentPage));
loadSamples();
