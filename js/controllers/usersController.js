// js/controllers/usersController.js
import { UsersModel } from "../models/usersModel.js";

const S = {
  form: "#usuarioForm",
  id: "#usuarioId",
  email: "#usuarioEmail",
  fullName: "#usuarioNombreCompleto",
  password: "#usuarioPassword",
  confirmPassword: "#usuarioConfirmPassword",
  active: "#usuarioActivo",
  rolesSelect: "#usuarioRoles",
  search: "#usuarioSearch",
  tableBody: "#usuariosTableBody",
  btnNew: "#btnNuevoUsuario",
  btnSearch: "#btnBuscarUsuario",
  btnReset: "#btnLimpiarUsuario",
  btnCancel: "#btnCancelarUsuario",
  modal: "#usuarioModal",
  alertBox: "#usuariosAlert"
};

const state = {
  users: [],
  roles: [],
  editingUserId: null
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
    Array.from(rolesSelect.options).forEach(opt => {
      opt.selected = false;
    });
  }
}

function validateForm() {
  const email = getValue(S.email);
  const fullName = getValue(S.fullName);
  const password = getValue(S.password);
  const confirmPassword = getValue(S.confirmPassword);

  if (!email) throw new Error("El correo es obligatorio.");
  if (!fullName) throw new Error("El nombre completo es obligatorio.");

  if (!state.editingUserId) {
    if (!password) {
      throw new Error("La contraseña es obligatoria para crear el usuario.");
    }
    if (password.length < 12) {
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
      if (password && password.length < 12) {
        throw new Error("La contraseña debe tener al menos 12 caracteres.");
      }
    }
  }
}

function getSelectedRoleCodes() {
  const rolesSelect = el(S.rolesSelect);
  if (!rolesSelect) return [];

  return Array.from(rolesSelect.selectedOptions)
    .map(opt => String(opt.value || "").trim().toLowerCase())
    .filter(Boolean);
}

function renderRolesOptions() {
  const select = el(S.rolesSelect);
  if (!select) return;

  select.replaceChildren();

  state.roles.forEach(role => {
    const option = document.createElement("option");
    option.value = role.code;
    option.textContent = `${role.name} (${role.code})`;
    select.appendChild(option);
  });
}

function renderUsersTable() {
  const tbody = el(S.tableBody);
  if (!tbody) return;

  if (!state.users.length) {
    tbody.innerHTML = `<tr><td colspan="8">No hay usuarios.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.users.map(user => {
    const roles = (user.roles || []).map(r => r.name).join(", ");

    return `
      <tr>
        <td>${escapeHtml(user.full_name)}</td>
        <td>${escapeHtml(user.email)}</td>
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
  }).join("");
}

async function loadRoles() {
  state.roles = await UsersModel.getRoles();
  renderRolesOptions();
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

    const result = await UsersModel.saveUser({
      action: state.editingUserId ? "update" : "create",
      user_id: state.editingUserId,
      email,
      full_name: fullName,
      password: password || null,
      active,
      role,
      role_codes: roleCodes.length ? roleCodes : [role]
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
    const user = state.users.find(u => u.id === id);
    if (!user) return;

    state.editingUserId = user.id;
    setValue(S.email, user.email);
    setValue(S.fullName, user.full_name);
    setChecked(S.active, user.active);
    setValue(S.password, "");
    setValue(S.confirmPassword, "");

    const rolesSelect = el(S.rolesSelect);
    if (rolesSelect) {
      const userRoleCodes = new Set((user.roles || []).map(r => String(r.code).toLowerCase()));
      Array.from(rolesSelect.options).forEach(opt => {
        opt.selected = userRoleCodes.has(String(opt.value).toLowerCase());
      });
    }

    openModal();
  }

  if (action === "delete") {
    await deleteUser(id);
  }
}

function bindEvents() {
  el(S.form)?.addEventListener("submit", saveUser);

  el(S.btnNew)?.addEventListener("click", () => {
    resetForm();
    openModal();
  });

  el(S.btnSearch)?.addEventListener("click", loadUsers);

  el(S.btnReset)?.addEventListener("click", () => {
    setValue(S.search, "");
    loadUsers();
  });

  el(S.tableBody)?.addEventListener("click", handleTableClick);

  el(S.btnCancel)?.addEventListener("click", cancelUserForm);
}

export async function initUsersView() {
  try {
    bindEvents();
    await loadRoles();
    await loadUsers();
  } catch (error) {
    console.error(error);
    showMessage("Error inicializando usuarios.", "error");
  }
}