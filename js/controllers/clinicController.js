// js/controllers/clinicController.js
import {
  getClinics,
  getClinicById,
  createClinic,
  updateClinic,
  deleteClinic,
  getBranches,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch
} from "../models/clinicModel.js";

const S = {
  alert: "#clinicsAlert",
  clinicSearch: "#clinicSearch",
  btnSearchClinic: "#btnSearchClinic",
  btnClearClinicSearch: "#btnClearClinicSearch",
  btnNewClinic: "#btnNewClinic",
  branchClinicFilter: "#branchClinicFilter",
  btnNewBranch: "#btnNewBranch",
  clinicsTableBody: "#clinicsTableBody",
  branchesTableBody: "#branchesTableBody",
  clinicForm: "#clinicForm",
  clinicId: "#clinicId",
  clinicName: "#clinicName",
  clinicActive: "#clinicActive",
  btnCancelClinic: "#btnCancelClinic",
  branchForm: "#branchForm",
  branchId: "#branchId",
  branchClinicId: "#branchClinicId",
  branchName: "#branchName",
  branchActive: "#branchActive",
  btnCancelBranch: "#btnCancelBranch"
};

const state = {
  clinics: [],
  branches: [],
  editingClinicId: null,
  editingBranchId: null
};

function el(selector) {
  return document.querySelector(selector);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setAlert(message, type = "info") {
  const box = el(S.alert);
  if (!box) return;

  box.innerHTML = `
    <div class="card ${type === "error" ? "card-error" : "card-info"}">
      <strong>${escapeHtml(message)}</strong>
    </div>
  `;

  window.clearTimeout(setAlert._timer);
  setAlert._timer = window.setTimeout(() => {
    box.innerHTML = "";
  }, 4000);
}

function clearClinicForm() {
  state.editingClinicId = null;
  const id = el(S.clinicId);
  const name = el(S.clinicName);
  const active = el(S.clinicActive);

  if (id) id.value = "";
  if (name) name.value = "";
  if (active) active.checked = true;
}

function clearBranchForm() {
  state.editingBranchId = null;
  const id = el(S.branchId);
  const clinicId = el(S.branchClinicId);
  const name = el(S.branchName);
  const active = el(S.branchActive);

  if (id) id.value = "";
  if (name) name.value = "";
  if (active) active.checked = true;
  if (clinicId && state.clinics.length && !clinicId.value) {
    clinicId.value = String(state.clinics[0].id);
  }
}

function fillClinicSelect(select, items, placeholder, selectedId = "") {
  if (!select) return;

  select.innerHTML = `<option value="">${placeholder}</option>`;
  for (const item of items || []) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name || "";
    if (String(selectedId) === String(item.id)) {
      option.selected = true;
    }
    select.appendChild(option);
  }
}

function renderClinicOptions() {
  const filter = el(S.branchClinicFilter);
  const branchClinic = el(S.branchClinicId);

  fillClinicSelect(filter, state.clinics, "Todas las clínicas");
  fillClinicSelect(branchClinic, state.clinics, "Seleccione clínica");
}

function renderClinicsTable() {
  const tbody = el(S.clinicsTableBody);
  if (!tbody) return;

  if (!state.clinics.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px;">No hay clínicas.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.clinics.map(clinic => `
    <tr>
      <td>${escapeHtml(clinic.name)}</td>
      <td>${clinic.active ? "Activa" : "Inactiva"}</td>
      <td>${clinic.created_at ? new Date(clinic.created_at).toLocaleString("es-SV") : "-"}</td>
      <td>${clinic.updated_at ? new Date(clinic.updated_at).toLocaleString("es-SV") : "-"}</td>
      <td>
        <button type="button" class="btn-edit-clinic" data-id="${escapeHtml(clinic.id)}">Editar</button>
        <button type="button" class="btn-delete-clinic" data-id="${escapeHtml(clinic.id)}">Eliminar</button>
      </td>
    </tr>
  `).join("");
}

function renderBranchesTable() {
  const tbody = el(S.branchesTableBody);
  if (!tbody) return;

  if (!state.branches.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">No hay sucursales.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.branches.map(branch => {
    const clinicName = branch.clinic?.name || state.clinics.find(c => String(c.id) === String(branch.clinic_id))?.name || "";
    return `
      <tr>
        <td>${escapeHtml(clinicName)}</td>
        <td>${escapeHtml(branch.name)}</td>
        <td>${branch.active ? "Activa" : "Inactiva"}</td>
        <td>${branch.created_at ? new Date(branch.created_at).toLocaleString("es-SV") : "-"}</td>
        <td>${branch.updated_at ? new Date(branch.updated_at).toLocaleString("es-SV") : "-"}</td>
        <td>
          <button type="button" class="btn-edit-branch" data-id="${escapeHtml(branch.id)}">Editar</button>
          <button type="button" class="btn-delete-branch" data-id="${escapeHtml(branch.id)}">Eliminar</button>
        </td>
      </tr>
    `;
  }).join("");
}

async function loadClinics() {
  const search = el(S.clinicSearch)?.value?.trim() || "";
  state.clinics = await getClinics(search);
  renderClinicOptions();
  renderClinicsTable();
}

async function loadBranches() {
  const clinicId = el(S.branchClinicFilter)?.value || "";
  state.branches = await getBranches(clinicId, "");
  renderBranchesTable();
}

async function refreshAll() {
  await loadClinics();
  await loadBranches();
}

async function handleClinicSubmit(event) {
  event.preventDefault();

  const submitBtn = el(`${S.clinicForm} button[type='submit']`);
  if (submitBtn) submitBtn.disabled = true;

  try {
    const id = el(S.clinicId)?.value || "";
    const payload = {
      name: el(S.clinicName)?.value || "",
      active: el(S.clinicActive)?.checked ?? true
    };

    if (id) {
      await updateClinic(id, payload);
      setAlert("Clínica actualizada correctamente.", "success");
    } else {
      await createClinic(payload);
      setAlert("Clínica creada correctamente.", "success");
    }

    clearClinicForm();
    await refreshAll();
  } catch (error) {
    console.error(error);
    setAlert(error.message || "No se pudo guardar la clínica.", "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function handleBranchSubmit(event) {
  event.preventDefault();

  const submitBtn = el(`${S.branchForm} button[type='submit']`);
  if (submitBtn) submitBtn.disabled = true;

  try {
    const id = el(S.branchId)?.value || "";
    const payload = {
      clinic_id: el(S.branchClinicId)?.value || "",
      name: el(S.branchName)?.value || "",
      active: el(S.branchActive)?.checked ?? true
    };

    if (id) {
      await updateBranch(id, payload);
      setAlert("Sucursal actualizada correctamente.", "success");
    } else {
      await createBranch(payload);
      setAlert("Sucursal creada correctamente.", "success");
    }

    clearBranchForm();
    await refreshAll();
  } catch (error) {
    console.error(error);
    setAlert(error.message || "No se pudo guardar la sucursal.", "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function editClinic(id) {
  const clinic = await getClinicById(id);
  if (!clinic) return;

  state.editingClinicId = clinic.id;
  if (el(S.clinicId)) el(S.clinicId).value = clinic.id;
  if (el(S.clinicName)) el(S.clinicName).value = clinic.name || "";
  if (el(S.clinicActive)) el(S.clinicActive).checked = Boolean(clinic.active);
}

async function editBranch(id) {
  const branch = await getBranchById(id);
  if (!branch) return;

  state.editingBranchId = branch.id;
  if (el(S.branchId)) el(S.branchId).value = branch.id;
  if (el(S.branchClinicId)) el(S.branchClinicId).value = branch.clinic_id || "";
  if (el(S.branchName)) el(S.branchName).value = branch.name || "";
  if (el(S.branchActive)) el(S.branchActive).checked = Boolean(branch.active);
}

async function deleteClinicFlow(id) {
  const ok = confirm("¿Eliminar esta clínica? Se eliminarán sus sucursales asociadas.");
  if (!ok) return;

  await deleteClinic(id);
  setAlert("Clínica eliminada correctamente.", "success");
  await refreshAll();
}

async function deleteBranchFlow(id) {
  const ok = confirm("¿Eliminar esta sucursal?");
  if (!ok) return;

  await deleteBranch(id);
  setAlert("Sucursal eliminada correctamente.", "success");
  await refreshAll();
}

function bindEvents() {
  el(S.clinicForm)?.addEventListener("submit", handleClinicSubmit);
  el(S.branchForm)?.addEventListener("submit", handleBranchSubmit);

  el(S.btnCancelClinic)?.addEventListener("click", clearClinicForm);
  el(S.btnCancelBranch)?.addEventListener("click", clearBranchForm);

  el(S.btnNewClinic)?.addEventListener("click", clearClinicForm);
  el(S.btnNewBranch)?.addEventListener("click", clearBranchForm);

  el(S.btnSearchClinic)?.addEventListener("click", loadClinics);
  el(S.btnClearClinicSearch)?.addEventListener("click", async () => {
    const search = el(S.clinicSearch);
    if (search) search.value = "";
    await loadClinics();
  });

  el(S.branchClinicFilter)?.addEventListener("change", loadBranches);

  el(S.clinicsTableBody)?.addEventListener("click", async (event) => {
    const btn = event.target.closest("button");
    if (!btn) return;

    const id = btn.dataset.id;
    if (!id) return;

    if (btn.classList.contains("btn-edit-clinic")) {
      await editClinic(id);
    }

    if (btn.classList.contains("btn-delete-clinic")) {
      await deleteClinicFlow(id);
    }
  });

  el(S.branchesTableBody)?.addEventListener("click", async (event) => {
    const btn = event.target.closest("button");
    if (!btn) return;

    const id = btn.dataset.id;
    if (!id) return;

    if (btn.classList.contains("btn-edit-branch")) {
      await editBranch(id);
    }

    if (btn.classList.contains("btn-delete-branch")) {
      await deleteBranchFlow(id);
    }
  });
}

export async function initClinicsView() {
  bindEvents();
  await refreshAll();
  clearClinicForm();
  clearBranchForm();
}