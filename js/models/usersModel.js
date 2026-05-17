// js/models/usersModel.js
import { supabase } from "../config/supabase.js";

function escapeLike(value) {
  return String(value ?? "")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")
    .trim();
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

async function invokeAdminUsers(payload) {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: payload
  });

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("No hubo respuesta de la Edge Function.");
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

async function attachRoles(users) {
  const list = Array.isArray(users) ? users : [];
  if (!list.length) return [];

  const userIds = list.map(u => u.id);

  const { data, error } = await supabase
    .from("app_user_roles")
    .select("user_id, role_id, app_roles(id, name, code)")
    .in("user_id", userIds);

  if (error) throw error;

  const rolesByUserId = new Map();
  for (const row of data || []) {
    if (!rolesByUserId.has(row.user_id)) {
      rolesByUserId.set(row.user_id, []);
    }
    if (row.app_roles) {
      rolesByUserId.get(row.user_id).push(row.app_roles);
    }
  }

  return list.map(user => ({
    ...user,
    roles: rolesByUserId.get(user.id) || []
  }));
}

export const UsersModel = {
  async getRoles() {
    const { data, error } = await supabase
      .from("app_roles")
      .select("id, name, code")
      .order("name", { ascending: true });

    if (error) throw error;
    return data ?? [];
  },

  async getUsers(search = "") {
    const term = escapeLike(search);

    let query = supabase
      .from("app_users")
      .select("id, email, full_name, active, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (term) {
      query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return await attachRoles(data ?? []);
  },

  async getUserById(id) {
    if (!id) throw new Error("id es obligatorio.");

    const { data, error } = await supabase
      .from("app_users")
      .select("id, email, full_name, active, created_at, updated_at")
      .eq("id", id)
      .single();

    if (error) throw error;

    const { data: rolesData, error: rolesError } = await supabase
      .from("app_user_roles")
      .select("role_id, app_roles(id, name, code)")
      .eq("user_id", id);

    if (rolesError) throw rolesError;

    return {
      ...data,
      roles: (rolesData || [])
        .map(row => row.app_roles)
        .filter(Boolean)
    };
  },

  async saveUser(payload) {
    const {
      action,       // "create" | "update"
      user_id = null,
      email,
      full_name,
      password = null,
      active = true,
      role = "RECEPCION",
      role_codes = []
    } = payload || {};

    if (action !== "create" && action !== "update") {
      throw new Error("action debe ser create o update.");
    }

    if (!email) throw new Error("El correo es obligatorio.");
    if (!full_name) throw new Error("El nombre completo es obligatorio.");

    const body = {
      action,
      user_id,
      email: normalizeText(email),
      full_name: normalizeText(full_name),
      active: Boolean(active),
      role: String(role || "RECEPCION").trim().toUpperCase(),
      role_codes: Array.isArray(role_codes) ? role_codes : []
    };

    if (password) {
      body.password = String(password);
    }

    const result = await invokeAdminUsers(body);

    if (!result.ok) {
      throw new Error(result.error || "No se pudo guardar el usuario.");
    }

    return result;
  },

  async deleteUser(id) {
    if (!id) throw new Error("id es obligatorio.");

    const result = await invokeAdminUsers({
      action: "delete",
      user_id: id
    });

    if (!result.ok) {
      throw new Error(result.error || "No se pudo eliminar el usuario.");
    }

    return true;
  }
};