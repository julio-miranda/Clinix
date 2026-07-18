// js/controllers/usersController.js
import { UsersModel } from "../models/usersModel.js";
import { getClinics, getBranchesByClinic } from "../models/clinicModel.js";

const S = {
  form: "#usuarioForm",
  id: "#usuarioId",
  email: "#usuarioEmail",
  fullName: "#usuarioNombreCompleto",
  password: "#usuarioPassword",
  confirmPassword: "#usuarioConfirmPassword",
  active: "#usuarioActivo",
  rolesSelect: "#usuarioRoles",

  clinicInput: "#usuarioClinicInput",
  clinicId: "#usuarioClinicId",
  clinicOptions: "#clinicOptions",

  branchInput: "#usuarioBranchInput",
  branchId: "#usuarioBranchId",
  branchOptions: "#branchOptions",

  search: "#usuarioSearch",
  tableBody: "#usuariosTableBody",
  btnNew: "#btnNuevoUsuario",
  btnSearch: "#btnBuscarUsuario",
  btnReset: "#btnLimpiarUsuario",
  btnCancel: "#btnCancelarUsuario",
  modal: "#usuarioModal",
  alertBox: "#usuariosAlert",
};

const state = {
  users: [],
  roles: [],
  clinics: [],
  branches: [],
  editingUserId: null,
};

function el(selector) {
  return document.querySelector(selector);
}

function getValue(selector) {
  const node = el(selector);
  return node ? node.value.trim() : "";
}

function setValue(selector, value) {
  const node = el(selector);
  if (node) node.value = value ?? "";
}

function setChecked(selector, value) {
  const node = el(selector);
  if (node) node.checked = !!value;
}

function getChecked(selector) {
  const node = el(selector);
  return node ? node.checked : false;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= 12;
}

function showMessage(message, type = "info") {
  const box = el(S.alertBox);
  if (!box) return;

  const card = document.createElement("div");
  card.className = `card ${type === "error" ? "card-error" : "card-info"}`;

  const strong = document.createElement("strong");
  strong.textContent = message;

  card.appendChild(strong);
  box.replaceChildren(card);

  setTimeout(() => {
    box.textContent = "";
  }, 4000);
}

function openModal() {
  const modal = el(S.modal);
  if (modal) modal.style.display = "block";
}

function closeModal() {
  const modal = el(S.modal);
  if (modal) modal.style.display = "none";
}

function cancelUserForm() {
  resetForm();
  closeModal();
}

function resetForm() {
  state.editingUserId = null;

  setValue(S.id, "");
  setValue(S.email, "");
  setValue(S.fullName, "");
  setValue(S.password, "");
  setValue(S.confirmPassword, "");
  setChecked(S.active, true);

  const rolesSelect = el(S.rolesSelect);
  if (rolesSelect) {
    Array.from(rolesSelect.options).forEach((opt) => {
      opt.selected = false;
    });
  }

  setValue(S.clinicInput, "");
  setValue(S.clinicId, "");
  setValue(S.branchInput, "");
  setValue(S.branchId, "");

  const branchInput = el(S.branchInput);
  if (branchInput) branchInput.disabled = true;

  const branchOptions = el(S.branchOptions);
  if (branchOptions) branchOptions.innerHTML = "";

  const clinicInput = el(S.clinicInput);
  if (clinicInput) clinicInput.focus();
}

function validateForm() {
  const email = getValue(S.email);
  const fullName = getValue(S.fullName);
  const password = getValue(S.password);
  const confirmPassword = getValue(S.confirmPassword);
  const clinicId = getValue(S.clinicId);
  const branchId = getValue(S.branchId);

  if (!email) throw new Error("El correo es obligatorio.");
  if (!fullName) throw new Error("El nombre completo es obligatorio.");
  if (!clinicId) throw new Error("Debe seleccionar una clínica válida.");
  if (!branchId) throw new Error("Debe seleccionar una sucursal válida.");

  if (!state.editingUserId) {
    if (!password) {
      throw new Error("La contraseña es obligatoria para crear el usuario.");
    }
    if (!isValidPassword(password)) {
      throw new Error("La contraseña debe tener al menos 12 caracteres.");
    }
    if (password !== confirmPassword) {
      throw new Error("Las contraseñas no coinciden.");
    }
  } else {
    if (password || confirmPassword) {
      if (password !== confirmPassword) {
        throw new Error("Las contraseñas no coinciden.");
      }
      if (password && !isValidPassword(password)) {
        throw new Error("La contraseña debe tener al menos 12 caracteres.");
      }
    }
  }
}

function getSelectedRoleCodes() {
  const rolesSelect = el(S.rolesSelect);
  if (!rolesSelect) return [];

  return Array.from(rolesSelect.selectedOptions)
    .map((opt) => String(opt.value || "").trim().toLowerCase())
    .filter(Boolean);
}

function renderRolesOptions() {
  const select = el(S.rolesSelect);
  if (!select) return;

  select.replaceChildren();

  state.roles.forEach((role) => {
    const option = document.createElement("option");
    option.value = role.code;
    option.textContent = `${role.name} (${role.code})`;
    select.appendChild(option);
  });
}

function setDatalistOptions(datalist, items, labelKey = "name") {
  if (!datalist) return;

  datalist.innerHTML = "";

  (items || []).forEach((item) => {
    const option = document.createElement("option");
    option.value = item?.[labelKey] || "";
    datalist.appendChild(option);
  });
}

function findItemByExactName(items, value) {
  const target = String(value ?? "").trim().toLowerCase();
  if (!target) return null;

  return (items || []).find((item) => {
    return String(item?.name ?? "").trim().toLowerCase() === target;
  }) || null;
}

function syncHiddenId(inputSelector, hiddenSelector, items) {
  const input = el(inputSelector);
  const hidden = el(hiddenSelector);

  if (!input || !hidden) return null;

  const match = findItemByExactName(items, input.value);
  hidden.value = match?.id || "";
  return match;
}

function renderClinicOptions() {
  setDatalistOptions(el(S.clinicOptions), state.clinics, "name");
}

function renderBranchOptions(branches = []) {
  setDatalistOptions(el(S.branchOptions), branches, "name");
}

async function loadBranchesForClinic(clinicId, selectedBranchId = "") {
  const branchInput = el(S.branchInput);
  const branchId = el(S.branchId);
  const branchOptions = el(S.branchOptions);

  if (!branchInput || !branchId || !branchOptions) return;

  if (!clinicId) {
    state.branches = [];
    branchInput.value = "";
    branchId.value = "";
    branchInput.disabled = true;
    branchOptions.innerHTML = "";
    return;
  }

  branchInput.disabled = true;
  branchInput.value = "";
  branchId.value = "";
  branchOptions.innerHTML = `<option value="">Cargando...</option>`;

  try {
    state.branches = await getBranchesByClinic(clinicId);
    renderBranchOptions(state.branches);

    const selectedBranch = state.branches.find(
      (branch) => String(branch.id) === String(selectedBranchId)
    );

    if (selectedBranch) {
      branchInput.value = selectedBranch.name || "";
      branchId.value = selectedBranch.id || "";
    }

    branchInput.disabled = false;
  } catch (error) {
    console.error(error);
    branchOptions.innerHTML = `<option value="">Error cargando sucursales</option>`;
    branchInput.disabled = true;
  }
}

function renderUsersTable() {
  const tbody = el(S.tableBody);
  if (!tbody) return;

  if (!state.users.length) {
    tbody.innerHTML = `<tr><td colspan="9">No hay usuarios.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.users
    .map((user) => {
      const roles = (user.roles || []).map((r) => r.name).join(", ");
      const clinicName = user.clinic?.name || "";
      const branchName = user.branch?.name || "";

      return `
      <tr>
        <td>${escapeHtml(user.full_name)}</td>
        <td>${escapeHtml(user.email)}</td>
        <td>${escapeHtml(clinicName)}</td>
        <td>${escapeHtml(branchName)}</td>
        <td>${escapeHtml(roles)}</td>
        <td>${user.active ? "Activo" : "Inactivo"}</td>
        <td>${user.created_at ? new Date(user.created_at).toLocaleString("es-SV") : "-"}</td>
        <td>${user.updated_at ? new Date(user.updated_at).toLocaleString("es-SV") : "-"}</td>
        <td>
          <button class="btn-edit" data-action="edit" data-id="${escapeHtml(user.id)}">Editar</button>
          <button class="btn-delete" data-action="delete" data-id="${escapeHtml(user.id)}">Eliminar</button>
        </td>
      </tr>
    `;
    })
    .join("");
}

async function loadRoles() {
  state.roles = await UsersModel.getRoles();
  renderRolesOptions();
}

async function loadClinics() {
  state.clinics = await getClinics("");
  renderClinicOptions();
}

async function loadUsers() {
  const search = getValue(S.search);
  state.users = await UsersModel.getUsers(search);
  renderUsersTable();
}

async function saveUser(event) {
  event.preventDefault();

  const submitBtn = el("#usuarioForm button[type='submit']");
  if (submitBtn) submitBtn.disabled = true;

  try {
    validateForm();

    const email = getValue(S.email);
    const fullName = getValue(S.fullName);
    const password = getValue(S.password);
    const active = getChecked(S.active);
    const roleCodes = getSelectedRoleCodes();
    const role = roleCodes[0] || "recepcion";
    const clinicId = getValue(S.clinicId);
    const branchId = getValue(S.branchId);

    const result = await UsersModel.saveUser({
      action: state.editingUserId ? "update" : "create",
      user_id: state.editingUserId,
      userId: state.editingUserId,
      id: state.editingUserId,
      email,
      full_name: fullName,
      password: password || null,
      active,
      role,
      role_codes: roleCodes.length ? roleCodes : [role],
      clinic_id: clinicId,
      branch_id: branchId,
    });

    closeModal();
    resetForm();
    await loadUsers();

    showMessage(result.message || "Usuario guardado correctamente.", "success");
  } catch (error) {
    console.error(error);
    showMessage(error.message, "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function deleteUser(id) {
  const ok = confirm("¿Desea eliminar este usuario? Esta acción no se puede deshacer.");
  if (!ok) return;

  try {
    await UsersModel.deleteUser(id);
    await loadUsers();
    showMessage("Usuario eliminado correctamente.", "success");
  } catch (error) {
    console.error(error);
    showMessage(error.message, "error");
  }
}

async function handleTableClick(event) {
  const btn = event.target.closest("button");
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === "edit") {
    const user = state.users.find((u) => u.id === id);
    if (!user) return;

    state.editingUserId = user.id;
    setValue(S.id, user.id);
    setValue(S.email, user.email || "");
    setValue(S.fullName, user.full_name || "");
    setChecked(S.active, user.active);
    setValue(S.password, "");
    setValue(S.confirmPassword, "");

    const rolesSelect = el(S.rolesSelect);
    if (rolesSelect) {
      const userRoleCodes = new Set(
        (user.roles || []).map((r) => String(r.code).toLowerCase())
      );

      Array.from(rolesSelect.options).forEach((opt) => {
        opt.selected = userRoleCodes.has(String(opt.value).toLowerCase());
      });
    }

    const clinicId = user.clinic?.id || user.clinic_id || "";
    const clinicName = user.clinic?.name || "";
    const branchId = user.branch?.id || user.branch_id || "";
    const branchName = user.branch?.name || "";

    setValue(S.clinicInput, clinicName);
    setValue(S.clinicId, clinicId);

    await loadBranchesForClinic(clinicId, branchId);

    setValue(S.branchInput, branchName);
    setValue(S.branchId, branchId);

    openModal();
  }

  if (action === "delete") {
    await deleteUser(id);
  }
}

async function handleClinicInput() {
  const match = syncHiddenId(S.clinicInput, S.clinicId, state.clinics);

  const branchInput = el(S.branchInput);
  const branchId = el(S.branchId);

  if (!match) {
    state.branches = [];
    if (branchInput) {
      branchInput.value = "";
      branchInput.disabled = true;
    }
    if (branchId) branchId.value = "";
    const branchOptions = el(S.branchOptions);
    if (branchOptions) branchOptions.innerHTML = "";
    return;
  }

  await loadBranchesForClinic(match.id, "");
}

function handleBranchInput() {
  syncHiddenId(S.branchInput, S.branchId, state.branches);
}

function bindEvents() {
  el(S.form)?.addEventListener("submit", saveUser);

  el(S.btnNew)?.addEventListener("click", async () => {
    resetForm();
    await loadClinics();
    openModal();
  });

  el(S.btnSearch)?.addEventListener("click", loadUsers);

  el(S.btnReset)?.addEventListener("click", () => {
    setValue(S.search, "");
    loadUsers();
  });

  el(S.tableBody)?.addEventListener("click", handleTableClick);

  el(S.btnCancel)?.addEventListener("click", cancelUserForm);

  el(S.clinicInput)?.addEventListener("input", handleClinicInput);
  el(S.clinicInput)?.addEventListener("change", handleClinicInput);

  el(S.branchInput)?.addEventListener("input", handleBranchInput);
  el(S.branchInput)?.addEventListener("change", handleBranchInput);
}

export async function initUsersView() {
  try {
    bindEvents();
    await loadRoles();
    await loadClinics();
    await loadUsers();

    const branchInput = el(S.branchInput);
    if (branchInput) {
      branchInput.innerHTML = "";
      branchInput.disabled = true;
    }
  } catch (error) {
    console.error(error);
    showMessage("Error inicializando usuarios.", "error");
  }
}