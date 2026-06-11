// js/controllers/authController.js
import {
  login,
  logout,
  getCurrentUser,
  getProfile,
} from "../models/authModel.js";

const SESSION_USER_KEY = "user";
const VALID_ROLES = new Set(["admin", "medico", "recepcion"]);

const ROLE_LABELS = {
  admin: "ADMIN",
  medico: "MEDICO",
  recepcion: "RECEPCION",
};

function normalizeRole(role) {
  const value = String(role || "").toLowerCase().trim();
  return VALID_ROLES.has(value) ? value : "";
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
    validated_at: new Date().toISOString(),
  };
}

function saveSessionUser(user) {
  console.log("[auth] Guardando usuario en sessionStorage:", user);
  sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

export function clearLocalAuthArtifacts() {
  try {
    console.warn("[auth] Limpiando sessionStorage.");
    sessionStorage.removeItem(SESSION_USER_KEY);
  } catch (err) {
    console.error("ERROR LIMPIANDO SESIÓN:", err);
  }
}

async function clearRemoteSession() {
  try {
    console.warn("[auth] Cerrando sesión remota...");
    await logout();
  } catch (err) {
    console.error("LOGOUT ERROR:", err);
  } finally {
    clearLocalAuthArtifacts();
  }
}

async function loadSessionUser() {
  console.log("[auth] Verificando sesión activa...");

  const authUser = await getCurrentUser();
  console.log("[auth] Usuario Auth actual:", authUser);

  if (!authUser) {
    console.warn("[auth] No hay sesión activa en Supabase.");
    clearLocalAuthArtifacts();
    return null;
  }

  const profile = await getProfile(authUser.id);
  console.log("[auth] Perfil de aplicación:", profile);

  if (!profile) {
    console.warn("[auth] No existe perfil para el usuario actual.");
    await clearRemoteSession();
    return null;
  }

  const sessionUser = buildSessionUser(authUser, profile);
  saveSessionUser(sessionUser);

  console.log("[auth] Sesión válida cargada:", sessionUser);
  return sessionUser;
}

export async function initLoginView() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.removeEventListener("submit", handleLogin);
  form.addEventListener("submit", handleLogin);

  try {
    const existingUser = await loadSessionUser();
    console.log("[auth] initLoginView -> existingUser:", existingUser);

    if (existingUser?.id) {
      console.log("[auth] Ya existe sesión. Redirigiendo por rol:", existingUser.role);
      redirectByRole(existingUser.role);
    }
  } catch (err) {
    console.error("SESSION LOAD ERROR:", err);
    clearLocalAuthArtifacts();
  }
}

export async function initDashboardView() {
  let user = getSessionUser();
  console.log("[auth] initDashboardView -> usuario desde sessionStorage:", user);

  if (!user) {
    try {
      user = await loadSessionUser();
      console.log("[auth] initDashboardView -> usuario recargado:", user);
    } catch (err) {
      console.error("DASHBOARD SESSION ERROR:", err);
      user = null;
    }
  }

  if (!user) {
    console.warn("[auth] No hay sesión válida. Redirigiendo al login.");
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
}

export async function handleLogin(event) {
  event.preventDefault();

  const form = event.target;
  const submitBtn = form.querySelector("button[type='submit']");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const email = form.email.value.trim().toLowerCase();
    const password = form.password.value;

    console.log("[auth] Intento de login:", { email, hasPassword: !!password });

    if (!email || !password) {
      alert("Complete el correo y la contraseña.");
      return;
    }

    const { error, data } = await login(email, password);

    if (error) {
      console.error("[auth] Error Supabase login:", error);
      clearLocalAuthArtifacts();
      alert("Error al iniciar sesión: " + error.message);
      return;
    }

    const authUser = data?.user;
    console.log("[auth] Usuario autenticado:", authUser);

    if (!authUser) {
      await clearRemoteSession();
      alert("Usuario inválido.");
      return;
    }

    const profile = await getProfile(authUser.id);
    console.log("[auth] Perfil obtenido tras login:", profile);

    if (!profile) {
      await clearRemoteSession();
      alert("Perfil de aplicación no encontrado.");
      return;
    }

    const sessionUser = buildSessionUser(authUser, profile);
    saveSessionUser(sessionUser);

    console.log("[auth] Login exitoso. Redirigiendo por rol:", sessionUser.role);
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
  console.log("[auth] Cerrando sesión...");
  await clearRemoteSession();
  window.location.hash = "#/login";
}

export function getSessionUser() {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_KEY);
    console.log("[auth] getSessionUser() raw:", raw);

    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const role = normalizeRole(parsed?.role);

    if (!parsed?.id || !role || parsed.active !== true) {
      console.warn("[auth] Sesión local inválida. Se elimina.");
      sessionStorage.removeItem(SESSION_USER_KEY);
      return null;
    }

    const sessionUser = {
      ...parsed,
      role,
      role_label: parsed.role_label || ROLE_LABELS[role],
    };

    console.log("[auth] getSessionUser() válido:", sessionUser);
    return sessionUser;
  } catch (err) {
    console.error("SESSION PARSE ERROR:", err);
    sessionStorage.removeItem(SESSION_USER_KEY);
    return null;
  }
}

export async function requireAuth() {
  try {
    console.log("[auth] requireAuth() iniciado...");
    const user = await loadSessionUser();

    if (!user) {
      console.warn("[auth] requireAuth() -> sin sesión. Redirigiendo al login.");
      window.location.hash = "#/login";
      return false;
    }

    console.log("[auth] requireAuth() -> sesión válida:", user.id);
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
  console.log("[auth] redirectByRole() ->", currentRole);

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

  console.log("[auth] Menú filtrado por rol:", currentRole);
}