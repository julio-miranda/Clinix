import { supabase } from "../config/supabase.js";

const ROLE_PRIORITY = ["admin", "medico", "recepcion"];

function normalizeRoleCode(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeRoleRow(row) {
  const role = Array.isArray(row?.app_roles)
    ? row.app_roles[0]
    : row?.app_roles || row;
  const code = normalizeRoleCode(role?.code);

  if (!code) return null;

  return {
    id: role.id ?? row?.role_id ?? null,
    code,
    name: role.name ?? code
  };
}

function pickPrimaryRole(roles) {
  const roleCodes = new Set(
    (roles || [])
      .map(role => normalizeRoleCode(role?.code))
      .filter(Boolean)
  );

  return ROLE_PRIORITY.find(role => roleCodes.has(role)) || null;
}

export async function login(email, password) {
  return await supabase.auth.signInWithPassword({
    email,
    password
  });
}

export async function logout() {
  return await supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("session") && message.includes("missing")) {
    return null;
  }

  if (error) throw error;
  return data?.user || null;
}

export async function getProfile(userId) {
  const authUser = await getCurrentUser();

  if (!authUser?.id || authUser.id !== userId) {
    throw new Error("Sesion no valida.");
  }

  const { data: appUser, error: userError } = await supabase
    .from("app_users")
    .select("id, email, full_name, active, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (userError) throw userError;
  if (!appUser) return null;

  if (appUser.active === false) {
    return {
      ...appUser,
      role: null,
      roles: []
    };
  }

  const { data: roleRows, error: rolesError } = await supabase
    .from("app_user_roles")
    .select("role_id, app_roles(id, name, code)")
    .eq("user_id", userId);

  if (rolesError) throw rolesError;

  const roles = (roleRows || [])
    .map(normalizeRoleRow)
    .filter(Boolean);

  return {
    ...appUser,
    role: pickPrimaryRole(roles),
    roles
  };
}
