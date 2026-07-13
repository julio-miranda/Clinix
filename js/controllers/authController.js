// js/controllers/authController.js
import {
  login,
  logout,
  getCurrentUser,
  getProfile
} from "../models/authModel.js";

import {
  getClinics,
  getBranches
} from "../models/clinicModel.js";

const SESSION_USER_KEY = "user";
const CONTEXT_KEY = "app_context";
const VALID_ROLES = new Set(["admin", "medico", "recepcion"]);

const ROLE_LABELS = {
  admin: "ADMIN",
  medico: "MEDICO",
  recepcion: "RECEPCION"
};

function normalizeRole(role) {
  const value = String(role || "").toLowerCase().trim();
  return VALID_ROLES.has(value) ? value : "";
}

function cleanId(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function getAppContext() {
  try {
    const raw = sessionStorage.getItem(CONTEXT_KEY);
    if (!raw) return { clinic_id: "", branch_id: "" };

    const parsed = JSON.parse(raw);
    return {
      clinic_id: cleanId(parsed?.clinic_id),
      branch_id: cleanId(parsed?.branch_id)
    };
  } catch {
    return { clinic_id: "", branch_id: "" };
  }
}

function setAppContext(context) {
  const payload = {
    clinic_id: cleanId(context?.clinic_id),
    branch_id: cleanId(context?.branch_id)
  };

  sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(payload));
  return payload;
}

function clearAppContext() {
  sessionStorage.removeItem(CONTEXT_KEY);
}

function buildSessionUser(authUser, profile) {
  if (!authUser?.id || !profile?.id || authUser.id !== profile.id) {
    throw new Error("Sesión no válida.");
  }

  if (profile.active === false) {
    throw new Error("Usuario inactivo.");
  }

  const role = normalizeRole(profile.role);
  if (!role) {
    throw new Error("Rol inválido o no asignado.");
  }

  return {
    id: authUser.id,
    email: authUser.email || profile.email || "",
    full_name: profile.full_name || "Usuario",
    role,
    role_label: ROLE_LABELS[role],
    roles: Array.isArray(profile.roles)
      ? profile.roles.map(item => normalizeRole(item?.code)).filter(Boolean)
      : [role],
    active: true,
    validated_at: new Date().toISOString()
  };
}

function saveSessionUser(user) {
  sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

export function clearLocalAuthArtifacts() {
  try {
    sessionStorage.removeItem(SESSION_USER_KEY);
    clearAppContext();
  } catch (err) {
    console.error("ERROR LIMPIANDO SESIÓN:", err);
  }
}

async function clearRemoteSession() {
  try {
    await logout();
  } catch (err) {
    console.error("LOGOUT ERROR:", err);
  } finally {
    clearLocalAuthArtifacts();
  }
}

async function loadSessionUser() {
  const authUser = await getCurrentUser();

  if (!authUser) {
    clearLocalAuthArtifacts();
    return null;
  }

  const profile = await getProfile(authUser.id);

  if (!profile) {
    await clearRemoteSession();
    return null;
  }

  const sessionUser = buildSessionUser(authUser, profile);
  saveSessionUser(sessionUser);

  return sessionUser;
}

function fillContextSelect(select, items, placeholder, selectedId = "") {
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

async function initDashboardContext() {
  const clinicSelect = document.getElementById("clinicSelect");
  const branchSelect = document.getElementById("branchSelect");
  const btnApply = document.getElementById("btnApplyContext");

  if (!clinicSelect || !branchSelect) return;

  const ctx = getAppContext();

  const clinics = await getClinics();
  fillContextSelect(clinicSelect, clinics, "Seleccione clínica", ctx.clinic_id);

  const loadBranches = async (clinicId, selectedBranchId = "") => {
    const branches = await getBranches(clinicId);
    fillContextSelect(branchSelect, branches, "Seleccione sucursal", selectedBranchId);
  };

  clinicSelect.addEventListener("change", async () => {
    branchSelect.innerHTML = `<option value="">Cargando...</option>`;
    await loadBranches(clinicSelect.value, "");
  });

  await loadBranches(ctx.clinic_id, ctx.branch_id);

  if (btnApply) {
    btnApply.addEventListener("click", () => {
      const next = setAppContext({
        clinic_id: clinicSelect.value,
        branch_id: branchSelect.value
      });

      if (!next.clinic_id || !next.branch_id) {
        alert("Seleccione clínica y sucursal.");
        return;
      }

      window.location.hash = "#/dashboard";
    });
  }
}

export async function initLoginView() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.removeEventListener("submit", handleLogin);
  form.addEventListener("submit", handleLogin);

  try {
    const existingUser = await loadSessionUser();

    if (existingUser?.id) {
      redirectByRole(existingUser.role);
    }
  } catch (err) {
    console.error("SESSION LOAD ERROR:", err);
    clearLocalAuthArtifacts();
  }
}

export async function initDashboardView() {
  let user = getSessionUser();

  if (!user) {
    try {
      user = await loadSessionUser();
    } catch (err) {
      console.error("DASHBOARD SESSION ERROR:", err);
      user = null;
    }
  }

  if (!user) {
    window.location.hash = "#/login";
    return;
  }

  const nameLabel = document.getElementById("userFullName");
  if (nameLabel) nameLabel.textContent = user.full_name || "Usuario";

  const roleLabel = document.getElementById("userRole");
  if (roleLabel) roleLabel.textContent = user.role_label || user.role || "---";

  filterMenuByRole(user.role);

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.removeEventListener("click", handleLogout);
    logoutBtn.addEventListener("click", handleLogout);
  }

  await initDashboardContext();
}

export async function handleLogin(event) {
  event.preventDefault();

  const form = event.target;
  const submitBtn = form.querySelector("button[type='submit']");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const email = form.email.value.trim().toLowerCase();
    const password = form.password.value;

    if (!email || !password) {
      alert("Complete el correo y la contraseña.");
      return;
    }

    const { error, data } = await login(email, password);

    if (error) {
      clearLocalAuthArtifacts();
      alert("Error al iniciar sesión: " + error.message);
      return;
    }

    const authUser = data?.user;

    if (!authUser) {
      await clearRemoteSession();
      alert("Usuario inválido.");
      return;
    }

    const profile = await getProfile(authUser.id);

    if (!profile) {
      await clearRemoteSession();
      alert("Perfil de aplicación no encontrado.");
      return;
    }

    const sessionUser = buildSessionUser(authUser, profile);
    saveSessionUser(sessionUser);

    redirectByRole(sessionUser.role);
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    await clearRemoteSession();
    alert(err?.message || "Error inesperado en login.");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

export async function handleLogout() {
  await clearRemoteSession();
  window.location.hash = "#/login";
}

export function getSessionUser() {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const role = normalizeRole(parsed?.role);

    if (!parsed?.id || !role || parsed.active !== true) {
      sessionStorage.removeItem(SESSION_USER_KEY);
      return null;
    }

    return {
      ...parsed,
      role,
      role_label: parsed.role_label || ROLE_LABELS[role]
    };
  } catch (err) {
    console.error("SESSION PARSE ERROR:", err);
    sessionStorage.removeItem(SESSION_USER_KEY);
    return null;
  }
}

export async function requireAuth() {
  try {
    const user = await loadSessionUser();

    if (!user) {
      window.location.hash = "#/login";
      return false;
    }

    return true;
  } catch (err) {
    console.error("AUTH REQUIRED ERROR:", err);
    await clearRemoteSession();
    window.location.hash = "#/login";
    return false;
  }
}

export function redirectByRole(role) {
  const currentRole = normalizeRole(role);

  switch (currentRole) {
    case "admin":
      window.location.hash = "#/dashboard";
      break;
    case "medico":
      window.location.hash = "#/consulta";
      break;
    case "recepcion":
      window.location.hash = "#/pacientes";
      break;
    default:
      window.location.hash = "#/login";
      break;
  }
}

export async function loadCurrentUser() {
  try {
    return await getCurrentUser();
  } catch (err) {
    console.error("CURRENT USER ERROR:", err);
    return null;
  }
}

function filterMenuByRole(role) {
  const currentRole = normalizeRole(role);
  const cards = document.querySelectorAll("#dashboardMenu .menu-card");

  cards.forEach(card => {
    const allowedRoles = String(card.dataset.roles || "")
      .split(",")
      .map(r => normalizeRole(r))
      .filter(Boolean);

    const visible = !allowedRoles.length || allowedRoles.includes(currentRole);
    card.style.display = visible ? "" : "none";
  });
}