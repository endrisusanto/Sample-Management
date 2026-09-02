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
    const isPinjam = sample.status_pinjam === 'PINJAM';
    const isAudited = sample.status_audit === 'SUDAH';
    const isNormal = !sample.defect_status || sample.defect_status === 'Normal' || sample.defect_status === '';
    const proofModalEl = document.getElementById('proofViewModal');
    const proofModal = proofModalEl ? new bootstrap.Modal(proofModalEl) : null;

    const proofThumbnail = sample.proof_image
      ? `<img src="${sample.proof_image}" id="detail-proof-img" class="img-thumbnail" style="width: 55px; height: 55px; object-fit: cover; cursor: pointer; border-radius: 8px; padding: 1px;" title="Klik untuk memperbesar foto bukti" data-img="${sample.proof_image}">`
      : `<span class="text-secondary small">-</span>`;

    document.getElementById('detailModalTitle').textContent = `Detail Sample: ${sample.model || ''} (${assetNo})`;
    document.getElementById('detailModalBody').innerHTML = `
      <div class="row g-3">
        <div class="col-md-4 text-center d-flex flex-column align-items-center justify-content-center p-2 rounded bg-dark bg-opacity-50 border border-secondary">
          <div class="p-2 bg-white rounded shadow-sm d-inline-block mb-2">
            <img src="${qrUrl}" alt="QR Code" class="img-fluid" style="width: 150px; height: 150px;">
          </div>
          <div class="fw-bold text-primary font-monospace">${assetNo}</div>
          <div class="text-secondary small">${sample.model || ''}</div>
          ${sample.proof_image ? `
            <div class="mt-3 pt-2 border-top border-secondary w-100 text-center">
              <div class="text-secondary small mb-1" style="font-size: 10px;">Bukti Foto Transaksi:</div>
              ${proofThumbnail}
            </div>
          ` : ''}
        </div>
        <div class="col-md-8">
          <div class="table-responsive rounded border border-secondary" style="background: var(--bg-surface-elevated, #0f172a);">
            <table class="table table-sm table-borderless text-light mb-0" style="font-size: 11.5px;">
              <tbody>
                <tr class="border-bottom border-secondary border-opacity-25"><th width="38%" class="text-secondary ps-3 py-1">Model</th><td class="fw-bold text-primary py-1">${sample.model || '-'}</td></tr>
                <tr class="border-bottom border-secondary border-opacity-25"><th class="text-secondary ps-3 py-1">Serial / No. Asset</th><td class="py-1"><span class="badge bg-dark border border-secondary">${assetNo}</span></td></tr>
                <tr class="border-bottom border-secondary border-opacity-25"><th class="text-secondary ps-3 py-1">Status Pinjam</th><td class="py-1"><span class="badge ${isPinjam ? 'bg-danger' : 'bg-success'}"><i class="fas ${isPinjam ? 'fa-user-lock' : 'fa-check-circle'} me-1"></i>${sample.status_pinjam || 'KEMBALI'}</span></td></tr>
                <tr class="border-bottom border-secondary border-opacity-25"><th class="text-secondary ps-3 py-1">Peminjam / PIC</th><td class="py-1 ${isPinjam ? 'text-warning fw-bold' : 'text-light'}">${sample.name || '-'}</td></tr>
                <tr class="border-bottom border-secondary border-opacity-25"><th class="text-secondary ps-3 py-1">Status Audit</th><td class="py-1"><span class="badge ${isAudited ? 'bg-info' : 'bg-secondary'}"><i class="fas ${isAudited ? 'fa-clipboard-check' : 'fa-hourglass-start'} me-1"></i>${sample.status_audit || 'RESET'}</span></td></tr>
                <tr class="border-bottom border-secondary border-opacity-25"><th class="text-secondary ps-3 py-1">Kondisi Perangkat</th><td class="py-1"><span class="badge ${isNormal ? 'bg-success bg-opacity-25 text-success border border-success' : 'bg-warning bg-opacity-25 text-warning border border-warning'}">${sample.defect_status || 'Normal'}</span>${sample.defect ? `<div class="text-muted small mt-1">${sample.defect}</div>` : ''}</td></tr>
                <tr class="border-bottom border-secondary border-opacity-25"><th class="text-secondary ps-3 py-1">Status OCTA</th><td class="py-1">${sample.octa_status ? `<span class="badge bg-secondary">${sample.octa_status}</span>` : '-'}</td></tr>
                <tr class="border-bottom border-secondary border-opacity-25"><th class="text-secondary ps-3 py-1">IMEI 1 / 2</th><td class="font-monospace text-secondary py-1">${sample.imei || '-'}${sample.imei2 ? ` / ${sample.imei2}` : ''}</td></tr>
                <tr class="border-bottom border-secondary border-opacity-25"><th class="text-secondary ps-3 py-1">UN Code</th><td class="font-monospace text-secondary py-1">${sample.un || '-'}</td></tr>
                <tr class="border-bottom border-secondary border-opacity-25"><th class="text-secondary ps-3 py-1">HW Rev.</th><td class="py-1"><span class="badge bg-dark border border-secondary">${sample.hw_rev || '-'}</span></td></tr>
                <tr class="border-bottom border-secondary border-opacity-25"><th class="text-secondary ps-3 py-1">Retention Owner</th><td class="py-1">${sample.retention_owner || sample.pic_sample || '-'}</td></tr>
                <tr><th class="text-secondary ps-3 py-1">Departemen</th><td class="py-1">${sample.retention_department || sample.Dept || '-'}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Proof click listener
    const imgProof = document.getElementById('detail-proof-img');
    if (imgProof && proofModal) {
      imgProof.addEventListener('click', () => {
        const modalImg = document.getElementById('proofModalImg');
        const modalSub = document.getElementById('proofModalSubtitle');
        if (modalImg) modalImg.src = imgProof.dataset.img;
        if (modalSub) modalSub.innerHTML = `<strong>${assetNo} (${sample.model || ''})</strong> — ${sample.status_pinjam} • PIC: ${sample.name || '-'}`;
        proofModal.show();
      });
    }

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
