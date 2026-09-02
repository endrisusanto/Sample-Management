import { Auth, setupWebSocket, showGiantAlert, SoundEffects, showCustomAlert, showCustomConfirm } from '/js/app.js';
import { CameraProofEngine } from '/js/camera-proof.js';

const cardsGrid = document.getElementById('model-cards-grid');
const searchInput = document.getElementById('model-search-input');
const filterAvail = document.getElementById('filter-availability');
const totalBadge = document.getElementById('total-models-badge');
const detailModalEl = document.getElementById('sampleDetailModal');
const editModalEl = document.getElementById('sampleEditModal');
const editFormEl = document.getElementById('sample-edit-form');
const proofModalEl = document.getElementById('proofViewModal');
const bulkProofModalEl = document.getElementById('bulkProofModal');

let detailModal = null;
let editModal = null;
let proofModal = null;
let bulkProofModal = null;
let cameraProof = null;
let currentFacingMode = 'user';
let pendingBulkAssets = [];
let pendingBulkModelName = '';
let pendingBulkTargetAction = 'PINJAM';

let allModels = [];
let currentSelectedModel = null;
let currentChipFilter = 'all';

export async function initModelsPage() {
  if (detailModalEl) {
    detailModal = new bootstrap.Modal(detailModalEl);
  }
  if (editModalEl) {
    editModal = new bootstrap.Modal(editModalEl);
  }
  if (proofModalEl) {
    proofModal = new bootstrap.Modal(proofModalEl);
  }
  if (bulkProofModalEl) {
    bulkProofModal = new bootstrap.Modal(bulkProofModalEl);
    cameraProof = new CameraProofEngine('bulk-proof-video');

    bulkProofModalEl.addEventListener('hidden.bs.modal', () => {
      if (cameraProof) cameraProof.stopCamera();
    });

    const btnSwitchCamera = document.getElementById('btn-switch-camera-bulk');
    if (btnSwitchCamera) {
      btnSwitchCamera.addEventListener('click', async () => {
        currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
        try {
          await cameraProof.startCamera(currentFacingMode);
        } catch (e) {
          console.warn('Switch camera error:', e.message);
        }
      });
    }

    const btnCaptureConfirm = document.getElementById('btn-capture-confirm-bulk');
    if (btnCaptureConfirm) {
      btnCaptureConfirm.addEventListener('click', async () => {
        const user = await Auth.getUser() || Auth.getCurrentUser();
        const currentUserName = (user && user.name) ? user.name.toUpperCase() : '';
        
        let photoBase64 = null;
        if (cameraProof) {
          photoBase64 = cameraProof.captureStampedPhoto({
            action: `BULK ${pendingBulkTargetAction}`,
            model: pendingBulkModelName,
            nomorAsset: `${pendingBulkAssets.length} UNIT`,
            picName: currentUserName
          });
        }
        await processBulkBorrowExecution(photoBase64, currentUserName);
      });
    }

    const btnSkipPhoto = document.getElementById('btn-skip-photo-bulk');
    if (btnSkipPhoto) {
      btnSkipPhoto.addEventListener('click', async () => {
        const user = await Auth.getUser() || Auth.getCurrentUser();
        const currentUserName = (user && user.name) ? user.name.toUpperCase() : '';
        await processBulkBorrowExecution(null, currentUserName);
      });
    }
  }

  const btnApply = document.getElementById('btn-apply-filter');
  const btnRefresh = document.getElementById('btn-refresh-models');
  const btnReset = document.getElementById('btn-reset-model-filter');

  if (btnApply) btnApply.addEventListener('click', loadModelCards);
  if (btnRefresh) btnRefresh.addEventListener('click', loadModelCards);
  if (filterAvail) filterAvail.addEventListener('change', () => {
    currentChipFilter = filterAvail.value;
    syncChipButtons();
    renderFilteredCards();
  });
  if (searchInput) searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadModelCards(); });

  // Interactive Filter Chips
  document.querySelectorAll('#model-filter-chips .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#model-filter-chips .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentChipFilter = chip.dataset.chip;
      if (filterAvail) {
        if (['all', 'has_borrowed', 'all_available'].includes(currentChipFilter)) {
          filterAvail.value = currentChipFilter;
        } else {
          filterAvail.value = 'all';
        }
      }
      renderFilteredCards();
    });
  });

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (filterAvail) filterAvail.value = 'all';
      currentChipFilter = 'all';
      syncChipButtons();
      loadModelCards();
    });
  }

  // Handle Edit Form Submission
  if (editFormEl) {
    editFormEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-sample-id').value;
      const payload = {
        model: document.getElementById('edit-sample-model').value.trim(),
        nomor_asset: document.getElementById('edit-sample-asset').value.trim(),
        status_pinjam: document.getElementById('edit-sample-status-pinjam').value,
        status_audit: document.getElementById('edit-sample-status-audit').value,
        defect_status: document.getElementById('edit-sample-defect-status').value,
        defect: document.getElementById('edit-sample-defect-detail').value.trim(),
        octa_status: document.getElementById('edit-sample-octa-status').value,
        name: document.getElementById('edit-sample-name').value.trim(),
        imei: document.getElementById('edit-sample-imei').value.trim(),
        un: document.getElementById('edit-sample-un').value.trim(),
        hw_rev: document.getElementById('edit-sample-hw-rev').value.trim(),
        retention_owner: document.getElementById('edit-sample-retention-owner').value.trim(),
        retention_department: document.getElementById('edit-sample-dept').value.trim()
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
          if (editModal) editModal.hide();
          await loadModelCards();
          // If modal was open, refresh it
          if (currentSelectedModel) {
            const updated = allModels.find(m => m.model === currentSelectedModel.model);
            if (updated) {
              openModelDetailModal(updated.model);
            }
          }
          await showCustomAlert({
            title: 'Berhasil',
            message: 'Perubahan data sample berhasil disimpan.',
            type: 'success'
          });
        } else {
          await showCustomAlert({
            title: 'Gagal Menyimpan',
            message: data.message || 'Gagal menyimpan perubahan sample',
            type: 'danger'
          });
        }
      } catch (err) {
        await showCustomAlert({
          title: 'Error',
          message: err.message,
          type: 'danger'
        });
      }
    });
  }

  setupWebSocket(() => loadModelCards());
  await loadModelCards();
}

function syncChipButtons() {
  document.querySelectorAll('#model-filter-chips .filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.chip === currentChipFilter);
  });
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
  let filtered = allModels;

  if (currentChipFilter === 'has_borrowed') {
    filtered = allModels.filter(m => m.borrowed > 0);
  } else if (currentChipFilter === 'all_available') {
    filtered = allModels.filter(m => m.borrowed === 0);
  } else if (currentChipFilter === 'has_defects') {
    filtered = allModels.filter(m => (m.defects && m.defects > 0) || m.items.some(u => u.defect_status && u.defect_status !== 'Normal' && u.defect_status !== ''));
  } else if (currentChipFilter === 'audited') {
    filtered = allModels.filter(m => m.audited > 0);
  } else if (currentChipFilter === 'pending_audit') {
    filtered = allModels.filter(m => m.audited < m.total);
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
  const user = Auth.getCurrentUser();
  const currentUserName = (user && user.name) ? user.name.toUpperCase() : '';

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

      <div class="table-responsive rounded border border-secondary" style="max-height: 56vh; overflow-y: auto;">
        <table class="custom-table table-sm mb-0 text-nowrap">
          <thead style="position: sticky; top: 0; background: var(--bg-surface-elevated, #0f172a); z-index: 5;">
            <tr>
              <th style="width: 35px;" class="text-center">
                <input type="checkbox" class="custom-check-lg" id="check-all-model-units" title="Pilih / Batalkan Semua">
              </th>
              <th style="width: 25px;">#</th>
              <th>No. Asset</th>
              <th>Serial No</th>
              <th>Status Pinjam</th>
              <th>Bukti Foto</th>
              <th>PIC / Peminjam</th>
              <th>Status Audit</th>
              <th>UN Code</th>
              <th>IMEI 1 / 2</th>
              <th>HW Rev</th>
              <th>Kondisi / Defect</th>
              <th>OCTA</th>
              <th>Waktu Update</th>
              <th class="text-center sticky-col-right" style="width: 75px;">Aksi</th>
            </tr>
          </thead>
          <tbody id="modal-units-tbody">
            ${renderModalTableRows(modelObj.items)}
          </tbody>
        </table>
      </div>
    `;

    // Set PIC label in modal footer
    const picLabel = document.getElementById('bulk-borrow-pic-label');
    if (picLabel) picLabel.textContent = currentUserName;

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
        attachRowInteractions();
        updateBulkBarState();
      });
    }

    // Select All Checkbox - selects only units that match the current active status
    const checkAll = document.getElementById('check-all-model-units');
    if (checkAll) {
      checkAll.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const allBoxes = Array.from(document.querySelectorAll('.unit-check-item'));
        if (isChecked) {
          // If already some selected, use active status; otherwise pick first visible item's status
          const checked = allBoxes.find(c => c.checked);
          const targetStatus = checked ? (checked.dataset.status || 'KEMBALI') : (allBoxes[0]?.dataset.status || 'KEMBALI');
          allBoxes.forEach(chk => {
            if ((chk.dataset.status || 'KEMBALI') === targetStatus) {
              chk.checked = true;
            } else {
              chk.checked = false;
            }
          });
        } else {
          allBoxes.forEach(chk => { chk.checked = false; });
        }
        updateBulkBarState();
      });
    }

    // Uncheck button in footer
    const btnUncheck = document.getElementById('btn-uncheck-all-units');
    if (btnUncheck) {
      btnUncheck.onclick = () => {
        if (checkAll) checkAll.checked = false;
        document.querySelectorAll('.unit-check-item').forEach(chk => { chk.checked = false; });
        updateBulkBarState();
      };
    }

    // Execute Bulk Action Button in footer -> Open Photo Proof Confirmation Modal
    const btnBulkBorrow = document.getElementById('btn-execute-bulk-borrow');
    if (btnBulkBorrow) {
      btnBulkBorrow.onclick = async () => {
        const selectedAssets = Array.from(document.querySelectorAll('.unit-check-item:checked'))
          .map(chk => chk.dataset.asset)
          .filter(Boolean);

        if (selectedAssets.length === 0) return;

        pendingBulkAssets = selectedAssets;
        pendingBulkModelName = modelName;

        const summaryEl = document.getElementById('bulk-proof-summary-text');
        const actionLabel = pendingBulkTargetAction === 'KEMBALI' ? 'Pengembalian' : 'Peminjaman';
        if (summaryEl) {
          summaryEl.innerHTML = `${actionLabel} <strong>${selectedAssets.length} Unit</strong> (${modelName}) oleh PIC: <strong class="text-warning">${currentUserName}</strong>`;
        }

        if (bulkProofModal) {
          bulkProofModal.show();
          try {
            if (cameraProof) {
              await cameraProof.startCamera(currentFacingMode);
            }
          } catch (err) {
            console.warn('Camera auto-start warning:', err.message);
          }
        }
      };
    }

    attachRowInteractions();
    updateBulkBarState();
  }

  if (detailModal) {
    detailModal.show();
  }
}

async function processBulkBorrowExecution(proofImageBase64, currentUserName) {
  if (!pendingBulkAssets || pendingBulkAssets.length === 0) return;

  const btnCapture = document.getElementById('btn-capture-confirm-bulk');
  const btnSkip = document.getElementById('btn-skip-photo-bulk');
  const actionLabel = pendingBulkTargetAction === 'KEMBALI' ? 'Pengembalian' : 'Peminjaman';
  
  if (btnCapture) {
    btnCapture.disabled = true;
    btnCapture.innerHTML = `<i class="fas fa-spinner fa-spin me-2"></i>Memproses ${actionLabel}...`;
  }
  if (btnSkip) btnSkip.disabled = true;

  try {
    const res = await fetch('/api/borrow-return-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: currentUserName,
        assets: pendingBulkAssets,
        proof_image: proofImageBase64,
        action: pendingBulkTargetAction
      })
    });
    const result = await res.json();

    if (bulkProofModal) bulkProofModal.hide();
    if (cameraProof) cameraProof.stopCamera();

    if (result.success) {
      SoundEffects.play(pendingBulkTargetAction === 'KEMBALI' ? 'KEMBALI' : 'PINJAM');
      showGiantAlert({
        title: `${actionLabel.toUpperCase()} MASSAL BERHASIL`,
        message: `Berhasil memproses ${actionLabel.toLowerCase()} <strong>${result.count} Unit</strong> (${pendingBulkModelName}) untuk <strong>${currentUserName}</strong>!`,
        action: pendingBulkTargetAction === 'KEMBALI' ? 'KEMBALI' : 'PINJAM'
      });

      await loadModelCards();
      const updated = allModels.find(m => m.model === pendingBulkModelName);
      if (updated) {
        openModelDetailModal(updated.model);
      }
    } else {
      await showCustomAlert({
        title: `Gagal ${actionLabel} Massal`,
        message: result.message || `Gagal memproses ${actionLabel.toLowerCase()} massal`,
        type: 'danger'
      });
    }
  } catch (err) {
    await showCustomAlert({
      title: 'Error',
      message: err.message,
      type: 'danger'
    });
  } finally {
    if (btnCapture) {
      btnCapture.disabled = false;
      btnCapture.innerHTML = '<i class="fas fa-camera-retro me-2"></i> Ambil Foto & Konfirmasi';
    }
    if (btnSkip) btnSkip.disabled = false;
  }
}

function updateBulkBarState() {
  const bulkBar = document.getElementById('bulk-borrow-bar');
  const selectedBadge = document.getElementById('selected-units-badge');
  const checkAll = document.getElementById('check-all-model-units');
  const btnExecute = document.getElementById('btn-execute-bulk-borrow');
  const checkedItems = Array.from(document.querySelectorAll('.unit-check-item:checked'));
  const allCheckboxes = Array.from(document.querySelectorAll('.unit-check-item'));

  const count = checkedItems.length;

  if (count === 0) {
    if (bulkBar) {
      bulkBar.classList.add('d-none');
    }
    // Re-enable all checkboxes
    allCheckboxes.forEach(chk => {
      chk.disabled = false;
      const tr = chk.closest('tr');
      if (tr) {
        tr.style.opacity = '1';
        tr.removeAttribute('title');
      }
    });
    if (checkAll) {
      checkAll.checked = false;
      checkAll.indeterminate = false;
    }
    return;
  }

  // Determine active status from the first checked item ('PINJAM' vs 'KEMBALI')
  const activeStatus = checkedItems[0].dataset.status || 'KEMBALI';
  pendingBulkTargetAction = (activeStatus === 'PINJAM') ? 'KEMBALI' : 'PINJAM';

  // Conflict Prevention: Lock and disable checkboxes that have a different status
  allCheckboxes.forEach(chk => {
    const itemStatus = chk.dataset.status || 'KEMBALI';
    const tr = chk.closest('tr');
    if (itemStatus !== activeStatus) {
      chk.disabled = true;
      chk.checked = false;
      if (tr) {
        tr.style.opacity = '0.35';
        tr.setAttribute('title', `Tidak dapat dipilih bersamaan (Status berbeda: ${itemStatus})`);
      }
    } else {
      chk.disabled = false;
      if (tr) {
        tr.style.opacity = '1';
        tr.removeAttribute('title');
      }
    }
  });

  // Dynamic button label & styling
  if (btnExecute) {
    if (pendingBulkTargetAction === 'KEMBALI') {
      btnExecute.className = 'btn btn-sm btn-success fw-bold py-1 px-3 shadow text-nowrap';
      btnExecute.innerHTML = `<i class="fas fa-undo me-1"></i> Kembalikan ${count} Unit Terpilih`;
    } else {
      btnExecute.className = 'btn btn-sm btn-primary-custom fw-bold py-1 px-3 shadow text-nowrap';
      btnExecute.innerHTML = `<i class="fas fa-hand-holding me-1"></i> Pinjam ${count} Unit Terpilih`;
    }
  }

  if (selectedBadge) {
    const actionText = pendingBulkTargetAction === 'KEMBALI' ? 'Pengembalian' : 'Peminjaman';
    selectedBadge.className = `badge ${pendingBulkTargetAction === 'KEMBALI' ? 'bg-success' : 'bg-primary'} fs-6 py-1 px-2 text-nowrap`;
    selectedBadge.innerHTML = `<i class="fas fa-check-square me-1"></i>${count} Unit (${actionText})`;
  }

  if (bulkBar) {
    bulkBar.classList.remove('d-none');
  }

  const validSameStatusItems = allCheckboxes.filter(c => (c.dataset.status || 'KEMBALI') === activeStatus);
  if (checkAll && validSameStatusItems.length > 0) {
    checkAll.checked = count === validSameStatusItems.length;
    checkAll.indeterminate = count > 0 && count < validSameStatusItems.length;
  }
}

function renderModalTableRows(items) {
  if (items.length === 0) {
    return `<tr><td colspan="15" class="text-center py-4 text-muted">Tidak ada unit yang cocok dengan pencarian.</td></tr>`;
  }

  return items.map((u, i) => {
    const isPinjam = u.status_pinjam === 'PINJAM';
    const isAudited = u.status_audit === 'SUDAH';
    const isNormal = !u.defect_status || u.defect_status === 'Normal' || u.defect_status === '';
    const assetNo = u.nomor_asset || u.sn || '-';

    const proofThumbnail = u.proof_image 
      ? `<img src="${u.proof_image}" class="img-thumbnail btn-view-proof-img" style="width: 36px; height: 36px; object-fit: cover; cursor: pointer; border-radius: 6px; padding: 1px;" title="Klik untuk lihat foto bukti transaksi" data-img="${u.proof_image}" data-title="${assetNo} (${u.model || ''})" data-sub="${u.status_pinjam || ''} • PIC: ${u.name || '-'}">`
      : `<span class="text-muted small">-</span>`;

    const imeiDisplay = u.imei ? (u.imei2 ? `${u.imei} / ${u.imei2}` : u.imei) : '-';

    return `
      <tr>
        <td class="text-center">
          <input type="checkbox" class="custom-check-lg unit-check-item" data-asset="${assetNo}" data-status="${u.status_pinjam || 'KEMBALI'}">
        </td>
        <td class="text-secondary font-monospace text-nowrap">${i + 1}</td>
        <td class="text-nowrap"><strong class="text-primary font-monospace">${assetNo}</strong></td>
        <td class="text-light fw-semibold text-nowrap">${u.sn || u.serial_no || '-'}</td>
        <td class="text-nowrap">
          <span class="badge ${isPinjam ? 'bg-danger' : 'bg-success'} text-nowrap">
            <i class="fas ${isPinjam ? 'fa-user-lock' : 'fa-check-circle'} me-1"></i>${u.status_pinjam || 'KEMBALI'}
          </span>
        </td>
        <td class="text-center text-nowrap">${proofThumbnail}</td>
        <td class="text-nowrap">
          ${isPinjam ? `<span class="fw-bold text-warning">${u.name || '-'}</span>` : `<span class="text-secondary">${u.pic_sample || u.retention_owner || '-'}</span>`}
        </td>
        <td class="text-nowrap">
          <span class="badge ${isAudited ? 'bg-info' : 'bg-secondary'} text-nowrap">
            <i class="fas ${isAudited ? 'fa-clipboard-check' : 'fa-hourglass-start'} me-1"></i>${u.status_audit || 'RESET'}
          </span>
        </td>
        <td class="small font-monospace text-nowrap">${u.un || '-'}</td>
        <td class="small font-monospace text-nowrap">${imeiDisplay}</td>
        <td class="text-nowrap"><span class="badge bg-dark border border-secondary">${u.hw_rev || '-'}</span></td>
        <td class="text-nowrap">
          <span class="badge ${isNormal ? 'bg-success bg-opacity-25 text-success border border-success' : 'bg-warning bg-opacity-25 text-warning border border-warning'} text-nowrap" title="${u.defect || ''}">
            ${u.defect_status || 'Normal'}${u.defect ? ` (${u.defect})` : ''}
          </span>
        </td>
        <td class="text-nowrap">${u.octa_status ? `<span class="badge bg-secondary">${u.octa_status}</span>` : '-'}</td>
        <td class="small text-secondary font-monospace text-nowrap">${u.timestamp || '-'}</td>
        <td class="text-center text-nowrap sticky-col-right">
          <button type="button" class="btn btn-xs btn-outline-warning py-0 px-2 btn-open-sample-edit text-nowrap" data-id="${u.id}" title="Edit Sample & Kondisi">
            <i class="fas fa-edit me-1"></i>Edit
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function attachRowInteractions() {
  // Checkbox state change listener
  document.querySelectorAll('.unit-check-item').forEach(chk => {
    chk.addEventListener('change', () => {
      updateBulkBarState();
    });
  });

  // Row Edit button
  document.querySelectorAll('.btn-open-sample-edit').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!id) return;
      await openSampleEditModal(id);
    });
  });

  // Proof Image Thumbnail Click -> Preview
  document.querySelectorAll('.btn-view-proof-img').forEach(img => {
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!proofModal) return;
      const modalImg = document.getElementById('proofModalImg');
      const modalSub = document.getElementById('proofModalSubtitle');
      if (modalImg) modalImg.src = img.dataset.img;
      if (modalSub) modalSub.innerHTML = `<strong>${img.dataset.title}</strong> — ${img.dataset.sub}`;
      proofModal.show();
    });
  });
}

async function openSampleEditModal(id) {
  if (!editModal) return;

  try {
    const res = await fetch(`/api/samples/${id}`);
    const { sample } = await res.json();
    if (!sample) {
      return showCustomAlert({
        title: 'Tidak Ditemukan',
        message: 'Data sample tidak ditemukan di server.',
        type: 'warning'
      });
    }

    document.getElementById('edit-sample-id').value = sample.id || '';
    document.getElementById('edit-sample-model').value = sample.model || '';
    document.getElementById('edit-sample-asset').value = sample.nomor_asset || sample.sn || '';
    document.getElementById('edit-sample-defect-status').value = sample.defect_status || 'Normal';
    document.getElementById('edit-sample-defect-detail').value = sample.defect || '';
    document.getElementById('edit-sample-octa-status').value = sample.octa_status || '';
    document.getElementById('edit-sample-status-pinjam').value = sample.status_pinjam || 'KEMBALI';
    document.getElementById('edit-sample-status-audit').value = sample.status_audit || 'RESET';
    document.getElementById('edit-sample-name').value = sample.name || '';
    document.getElementById('edit-sample-imei').value = sample.imei || '';
    document.getElementById('edit-sample-un').value = sample.un || '';
    document.getElementById('edit-sample-hw-rev').value = sample.hw_rev || '';
    document.getElementById('edit-sample-retention-owner').value = sample.retention_owner || sample.pic_sample || '';
    document.getElementById('edit-sample-dept').value = sample.retention_department || sample.Dept || '';

    editModal.show();
  } catch (err) {
    showCustomAlert({
      title: 'Error',
      message: 'Gagal memuat detail sample: ' + err.message,
      type: 'danger'
    });
  }
}

// Auto-run if loaded as page module
if (document.getElementById('model-cards-grid')) {
  initModelsPage();
}
