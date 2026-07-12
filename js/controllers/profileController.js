// js/controllers/profileController.js
import { getSessionUser } from "./authController.js";
import {
  getCurrentProfile,
  updateCurrentProfile,
  changeCurrentPassword
} from "../models/profileModel.js";

function el(selector) {
  return document.querySelector(selector);
}

function setValue(selector, value) {
  const node = el(selector);
  if (node) node.value = value ?? "";
}

function setText(selector, value) {
  const node = el(selector);
  if (node) node.textContent = value ?? "";
}

function showAlert(message, type = "info") {
  const box = el("#profileAlert");
  if (!box) return;

  const div = document.createElement("div");
  div.className = type === "error" ? "card card-error" : "card card-info";
  div.style.marginBottom = "12px";
  div.textContent = message;

  box.replaceChildren(div);

  window.clearTimeout(showAlert._timer);
  showAlert._timer = window.setTimeout(() => {
    if (box) box.replaceChildren();
  }, 4000);
}

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (value === "admin") return "Administrador";
  if (value === "medico") return "Médico";
  if (value === "recepcion") return "Recepción";
  return value || "---";
}

function normalizeActive(active) {
  return active ? "Activo" : "Inactivo";
}

function syncCachedSessionUser(fullName) {
  const patchableKeys = [];

  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (!key) continue;

    const raw = sessionStorage.getItem(key);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && Object.prototype.hasOwnProperty.call(parsed, "full_name")) {
        patchableKeys.push(key);
      }
    } catch {
      continue;
    }
  }

  for (const key of patchableKeys) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        parsed.full_name = fullName;
        sessionStorage.setItem(key, JSON.stringify(parsed));
      }
    } catch {
      continue;
    }
  }
}

function validatePassword(password, confirmPassword) {
  const cleanPassword = String(password || "").trim();
  const cleanConfirm = String(confirmPassword || "").trim();

  if (!cleanPassword && !cleanConfirm) return null;

  if (cleanPassword.length < 12) {
    throw new Error("La contraseña debe tener al menos 12 caracteres.");
  }

  if (cleanPassword !== cleanConfirm) {
    throw new Error("Las contraseñas no coinciden.");
  }

  return cleanPassword;
}

async function loadProfile() {
  const { authUser, profile } = await getCurrentProfile();

  setValue("#profileFullName", profile.full_name || "");
  setValue("#profileEmail", authUser.email || "");
  setValue("#profileRole", normalizeRole(profile.role));
  setValue("#profileActive", normalizeActive(profile.active));
}

async function handleSubmit(event) {
  event.preventDefault();

  const submitBtn = document.querySelector("#profileForm button[type='submit']");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const fullName = el("#profileFullName")?.value?.trim() || "";
    const password = el("#profilePassword")?.value || "";
    const confirmPassword = el("#profileConfirmPassword")?.value || "";

    if (!fullName) {
      throw new Error("El nombre completo es obligatorio.");
    }

    const newPassword = validatePassword(password, confirmPassword);

    const updatedProfile = await updateCurrentProfile(fullName);

    if (newPassword) {
      await changeCurrentPassword(newPassword);
    }

    syncCachedSessionUser(updatedProfile.full_name);

    setText("#profileActive", normalizeActive(updatedProfile.active));
    showAlert(
      newPassword
        ? "Perfil actualizado y contraseña cambiada correctamente."
        : "Perfil actualizado correctamente.",
      "success"
    );

    setValue("#profilePassword", "");
    setValue("#profileConfirmPassword", "");

    if (typeof getSessionUser === "function") {
      const current = getSessionUser();
      if (current && typeof current === "object") {
        current.full_name = updatedProfile.full_name;
      }
    }
  } catch (error) {
    console.error("Error actualizando perfil:", error);
    showAlert(error.message || "No se pudo actualizar el perfil.", "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

export async function initProfileView() {
  const user = getSessionUser();

  if (!user) {
    window.location.hash = "#/login";
    return;
  }

  const form = document.querySelector("#profileForm");
  if (!form) return;

  form.addEventListener("submit", handleSubmit);

  try {
    await loadProfile();
  } catch (error) {
    console.error("Error cargando perfil:", error);
    showAlert(error.message || "No se pudo cargar el perfil.", "error");
  }
}