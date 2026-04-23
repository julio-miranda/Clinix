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
    if (!rolesByUserId.has(row.user_id)) rolesByUserId.set(row.user_id, []);
    if (row.app_roles) rolesByUserId.get(row.user_id).push(row.app_roles);
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

  async createUser(payload) {
    const { email, full_name, password, active = true } = payload || {};

    if (!email) throw new Error("El correo es obligatorio.");
    if (!full_name) throw new Error("El nombre completo es obligatorio.");
    if (!password) throw new Error("La contraseña es obligatoria.");

    const { data, error } = await supabase.rpc("admin_create_user_account", {
      p_email: normalizeText(email),
      p_full_name: normalizeText(full_name),
      p_password: String(password),
      p_active: Boolean(active)
    });

    if (error) throw error;
    if (!data) throw new Error("No se pudo crear el usuario.");

    return data;
  },

  async updateUserAccount(userId, payload) {
    if (!userId) throw new Error("userId es obligatorio.");

    const { email, full_name, active, password = null } = payload || {};

    const { data, error } = await supabase.rpc("admin_update_user_account", {
      p_user_id: userId,
      p_email: email === undefined ? null : normalizeText(email),
      p_full_name: full_name === undefined ? null : normalizeText(full_name),
      p_active: active === undefined ? null : Boolean(active),
      p_password: password ? String(password) : null
    });

    if (error) throw error;
    if (!data) throw new Error("No se pudo actualizar el usuario.");

    return data;
  },

  async replaceUserRoles(userId, roleIds = []) {
    if (!userId) throw new Error("userId es obligatorio.");

    const cleanRoleIds = Array.from(
      new Set((roleIds || []).filter(Boolean).map(String))
    );

    const { error: deleteError } = await supabase
      .from("app_user_roles")
      .delete()
      .eq("user_id", userId);

    if (deleteError) throw deleteError;

    if (!cleanRoleIds.length) return [];

    const rows = cleanRoleIds.map(roleId => ({
      user_id: userId,
      role_id: roleId
    }));

    const { data, error } = await supabase
      .from("app_user_roles")
      .insert(rows)
      .select(`
        user_id,
        role_id,
        app_roles (
          id,
          name,
          code
        )
      `);

    if (error) throw error;
    return data ?? [];
  },

  async deleteUser(id) {
    if (!id) throw new Error("id es obligatorio.");

    const { error: rolesError } = await supabase
      .from("app_user_roles")
      .delete()
      .eq("user_id", id);

    if (rolesError) throw rolesError;

    const { error } = await supabase
      .from("app_users")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return true;
  }
};