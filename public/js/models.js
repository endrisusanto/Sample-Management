import { Auth, setupWebSocket } from '/js/app.js';

const cardsGrid = document.getElementById('model-cards-grid');
const searchInput = document.getElementById('model-search-input');
const filterAvail = document.getElementById('filter-availability');
const totalBadge = document.getElementById('total-models-badge');
const detailModalEl = document.getElementById('sampleDetailModal');
let detailModal = null;
let allModels = [];
let currentSelectedModel = null;

export async function initModelsPage() {
  if (detailModalEl) {
    detailModal = new bootstrap.Modal(detailModalEl);
  }

  const btnApply = document.getElementById('btn-apply-filter');
  const btnRefresh = document.getElementById('btn-refresh-models');
  const btnReset = document.getElementById('btn-reset-model-filter');

  if (btnApply) btnApply.addEventListener('click', loadModelCards);
  if (btnRefresh) btnRefresh.addEventListener('click', loadModelCards);
  if (filterAvail) filterAvail.addEventListener('change', renderFilteredCards);
  if (searchInput) searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadModelCards(); });

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (filterAvail) filterAvail.value = 'all';
      loadModelCards();
    });
  }

  setupWebSocket(() => loadModelCards());
  await loadModelCards();
}

async function loadModelCards() {
  const search = searchInput ? searchInput.value.trim() : '';
  const params = new URLSearchParams();
  if (search) params.append('search', search);

  if (cardsGrid) {
    cardsGrid.innerHTML = `<div class="col-12 text-center py-5 text-secondary"><i class="fas fa-spinner fa-spin me-2"></i>Memuat kartu model...</div>`;
  }

  try {
    const res = await fetch(`/api/models-overview?${params.toString()}`);
    const data = await res.json();

    if (!data.success || !data.models) {
      if (cardsGrid) cardsGrid.innerHTML = `<div class="col-12 text-center py-5 text-muted">Tidak ada data model ditemukan.</div>`;
      return;
    }

    allModels = data.models;
    renderFilteredCards();
  } catch (err) {
    if (cardsGrid) cardsGrid.innerHTML = `<div class="col-12 text-center py-5 text-danger">Error: ${err.message}</div>`;
  }
}

function renderFilteredCards() {
  if (!cardsGrid) return;
  const filterVal = filterAvail ? filterAvail.value : 'all';
  let filtered = allModels;

  if (filterVal === 'has_borrowed') {
    filtered = allModels.filter(m => m.borrowed > 0);
  } else if (filterVal === 'all_available') {
    filtered = allModels.filter(m => m.borrowed === 0);
  }

  if (totalBadge) {
    totalBadge.textContent = `${filtered.length} Model (${filtered.reduce((acc, m) => acc + m.total, 0)} Unit)`;
  }

  if (filtered.length === 0) {
    cardsGrid.innerHTML = `<div class="col-12 text-center py-5 text-muted">Tidak ada model yang cocok dengan filter.</div>`;
    return;
  }

  cardsGrid.innerHTML = filtered.map(m => {
    const rowsHtml = m.items.slice(0, 8).map((item, idx) => {
      const isPinjam = item.status_pinjam === 'PINJAM';
      const isNormal = !item.defect_status || item.defect_status === 'Normal' || item.defect_status === '';
      const isAudited = item.status_audit === 'SUDAH';
      const assetNo = item.nomor_asset || item.sn || '-';
      const serial = item.sn || item.serial_no || '-';
      const imei = item.imei || item.un || '-';

      return `
        <tr>
          <td class="text-secondary" style="width: 24px;">${idx + 1}</td>
          <td><span class="badge bg-dark border border-secondary">${assetNo}</span></td>
          <td class="text-light fw-semibold">${serial}</td>
          <td class="text-secondary small font-monospace">${imei}</td>
          <td class="text-center">
            <div class="icon-status-cell justify-content-center">
              ${isPinjam 
                ? `<i class="fas fa-user-lock text-danger" title="Dipinjam: ${item.name || 'PIC'}"></i>`
                : `<i class="fas fa-check-circle text-success" title="Tersedia (KEMBALI)"></i>`}
              
              ${isNormal 
                ? `<i class="fas fa-shield-alt text-success" title="Normal"></i>`
                : `<i class="fas fa-exclamation-triangle text-warning" title="Defect: ${item.defect_status}"></i>`}

              ${isAudited 
                ? `<i class="fas fa-clipboard-check text-info" title="Sudah Diaudit"></i>`
                : `<i class="fas fa-hourglass-start text-secondary" title="Audit: RESET"></i>`}

              ${item.octa_status ? `<span class="badge bg-secondary" style="font-size:8.5px;">${item.octa_status}</span>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const moreCount = m.items.length > 8 ? m.items.length - 8 : 0;

    return `
      <div class="col-xl-4 col-lg-6 col-12">
        <div class="model-card clickable-model-card" data-model="${m.model}" style="cursor: pointer;">
          <div class="model-card-header">
            <div>
              <span class="model-card-title"><i class="fas fa-mobile-alt me-1"></i> ${m.model}</span>
            </div>
            <div class="d-flex align-items-center gap-1">
              <span class="badge bg-primary" title="Total Unit">${m.total} Unit</span>
              ${m.borrowed > 0 ? `<span class="badge bg-danger" title="Sedang Dipinjam">${m.borrowed} Pinjam</span>` : ''}
              <span class="badge bg-success" title="Tersedia">${m.available} Ready</span>
            </div>
          </div>

          <div class="model-card-body">
            <table class="dense-table mb-0">
              <thead>
                <tr>
                  <th>#</th>
                  <th>No. Asset</th>
                  <th>Serial</th>
                  <th>IMEI / UN</th>
                  <th class="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
            ${moreCount > 0 ? `
              <div class="text-center py-1 text-info small bg-dark bg-opacity-50 border-top border-secondary" style="font-size: 10.5px;">
                <i class="fas fa-eye me-1"></i> Klik untuk melihat ${moreCount} unit lainnya...
              </div>
            ` : ''}
          </div>

          <div class="model-card-footer">
            <span><i class="fas fa-layer-group me-1"></i> ${m.items[0]?.Dept || 'PE Solution P /SEIN-P'}</span>
            <span>Audit: <strong class="${m.audited === m.total ? 'text-success' : 'text-warning'}">${m.audited}/${m.total}</strong></span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach Click Handlers to Open Detailed Modal
  document.querySelectorAll('.clickable-model-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const modelName = card.dataset.model;
      openModelDetailModal(modelName);
    });
  });
}

function openModelDetailModal(modelName) {
  const modelObj = allModels.find(m => m.model === modelName);
  if (!modelObj) return;

  currentSelectedModel = modelObj;
  const modalTitle = document.getElementById('detailModalTitle');
  const modalBody = document.getElementById('detailModalBody');

  if (modalTitle) {
    modalTitle.innerHTML = `
      <div class="d-flex align-items-center gap-2">
        <i class="fas fa-mobile-screen text-primary fs-5"></i>
        <span>${modelObj.model}</span>
        <span class="badge bg-primary ms-2">${modelObj.total} Unit Total</span>
        ${modelObj.borrowed > 0 ? `<span class="badge bg-danger">${modelObj.borrowed} Dipinjam</span>` : ''}
        <span class="badge bg-success">${modelObj.available} Tersedia</span>
        <span class="badge bg-info">Audit: ${modelObj.audited}/${modelObj.total}</span>
      </div>
    `;
  }

  if (modalBody) {
    modalBody.innerHTML = `
      <div class="mb-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div class="input-group" style="max-width: 320px;">
          <span class="input-group-text bg-surface border-secondary py-1 px-2"><i class="fas fa-search"></i></span>
          <input type="text" id="modal-unit-search" class="form-control form-control-sm" placeholder="Cari Serial, Asset, PIC, IMEI..." style="font-size: 11.5px;">
        </div>
        <div class="text-secondary small">
          <i class="fas fa-building me-1"></i> Departemen: <strong>${modelObj.items[0]?.Dept || 'PE Solution P /SEIN-P'}</strong>
        </div>
      </div>

      <div class="table-responsive rounded border border-secondary" style="max-height: 60vh; overflow-y: auto;">
        <table class="custom-table table-sm mb-0">
          <thead style="position: sticky; top: 0; background: var(--bg-surface-elevated, #0f172a); z-index: 5;">
            <tr>
              <th style="width: 30px;">#</th>
              <th>No. Asset</th>
              <th>Serial No</th>
              <th>Status Pinjam</th>
              <th>PIC / Peminjam</th>
              <th>Status Audit</th>
              <th>UN Code</th>
              <th>IMEI 1 / 2</th>
              <th>HW Rev</th>
              <th>Kondisi / Defect</th>
              <th>OCTA</th>
              <th>Waktu Update</th>
            </tr>
          </thead>
          <tbody id="modal-units-tbody">
            ${renderModalTableRows(modelObj.items)}
          </tbody>
        </table>
      </div>
    `;

    // Live search inside modal
    const modalSearchInput = document.getElementById('modal-unit-search');
    const modalTbody = document.getElementById('modal-units-tbody');
    if (modalSearchInput && modalTbody) {
      modalSearchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        const filteredUnits = modelObj.items.filter(u => {
          const text = `${u.nomor_asset || ''} ${u.sn || ''} ${u.name || ''} ${u.imei || ''} ${u.un || ''} ${u.status_pinjam || ''} ${u.defect_status || ''}`.toLowerCase();
          return text.includes(q);
        });
        modalTbody.innerHTML = renderModalTableRows(filteredUnits);
      });
    }
  }

  if (detailModal) {
    detailModal.show();
  }
}

function renderModalTableRows(items) {
  if (items.length === 0) {
    return `<tr><td colspan="12" class="text-center py-4 text-muted">Tidak ada unit yang cocok dengan pencarian.</td></tr>`;
  }

  return items.map((u, i) => {
    const isPinjam = u.status_pinjam === 'PINJAM';
    const isAudited = u.status_audit === 'SUDAH';
    const isNormal = !u.defect_status || u.defect_status === 'Normal' || u.defect_status === '';

    return `
      <tr>
        <td class="text-secondary font-monospace">${i + 1}</td>
        <td><strong class="text-primary font-monospace">${u.nomor_asset || u.sn || '-'}</strong></td>
        <td class="text-light fw-semibold">${u.sn || u.serial_no || '-'}</td>
        <td>
          <span class="badge ${isPinjam ? 'bg-danger' : 'bg-success'}">
            <i class="fas ${isPinjam ? 'fa-user-lock' : 'fa-check-circle'} me-1"></i>${u.status_pinjam || 'KEMBALI'}
          </span>
        </td>
        <td>
          ${isPinjam ? `<span class="fw-bold text-warning">${u.name || '-'}</span>` : `<span class="text-secondary">${u.pic_sample || u.retention_owner || '-'}</span>`}
        </td>
        <td>
          <span class="badge ${isAudited ? 'bg-info' : 'bg-secondary'}">
            <i class="fas ${isAudited ? 'fa-clipboard-check' : 'fa-hourglass-start'} me-1"></i>${u.status_audit || 'RESET'}
          </span>
        </td>
        <td class="small font-monospace">${u.un || '-'}</td>
        <td class="small font-monospace">${u.imei || '-'}${u.imei2 ? `<br><span class="text-muted">${u.imei2}</span>` : ''}</td>
        <td><span class="badge bg-dark border border-secondary">${u.hw_rev || '-'}</span></td>
        <td>
          <span class="badge ${isNormal ? 'bg-success bg-opacity-25 text-success border border-success' : 'bg-warning bg-opacity-25 text-warning border border-warning'}">
            ${u.defect_status || 'Normal'}
          </span>
        </td>
        <td>${u.octa_status ? `<span class="badge bg-secondary">${u.octa_status}</span>` : '-'}</td>
        <td class="small text-secondary font-monospace">${u.timestamp || '-'}</td>
      </tr>
    `;
  }).join('');
}

// Auto-run if loaded as page module
if (document.getElementById('model-cards-grid')) {
  initModelsPage();
}
