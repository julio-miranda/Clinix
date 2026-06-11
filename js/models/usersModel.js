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

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeRole(value) {
  return String(value ?? "").trim().toUpperCase() || "RECEPCION";
}

function normalizeRoleCode(value) {
  return String(value ?? "").trim().toLowerCase();
}

function dedupeRoleCodes(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(
    values
      .map(normalizeRoleCode)
      .filter(Boolean),
  )];
}

function extractMessageFromBody(body) {
  if (!body || typeof body !== "object") return null;

  const stage = body.stage ? ` [${body.stage}]` : "";
  const error =
    body.error ||
    body.message ||
    body.details?.message ||
    body.details?.error ||
    body.details?.hint ||
    body.details?.code ||
    null;

  if (error) return `${error}${stage}`;

  try {
    return `${JSON.stringify(body)}${stage}`;
  } catch {
    return stage ? `Error${stage}` : "Error desconocido";
  }
}

async function readFunctionError(error) {
  try {
    const context = error?.context;

    if (context?.json && typeof context.json === "function") {
      const body = await context.json();
      const message = extractMessageFromBody(body);
      if (message) return message;
    }

    if (context?.text && typeof context.text === "function") {
      const text = await context.text();
      if (text) return text;
    }
  } catch (e) {
    console.error("No se pudo leer el cuerpo de error de la Edge Function:", e);
  }

  return error?.message || "Error desconocido en la Edge Function.";
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  const token = data?.session?.access_token || null;
  if (!token) {
    throw new Error("Sesión inválida o expirada. Inicia sesión de nuevo.");
  }

  return token;
}

function buildAdminUsersPayload(payload) {
  const userId = normalizeText(
    payload?.user_id ?? payload?.userId ?? payload?.id,
  );

  const email = normalizeEmail(payload?.email);
  const fullName = normalizeText(payload?.full_name ?? payload?.fullName);
  const password = normalizeText(payload?.password);

  const role = normalizeRole(payload?.role);
  const roleCodes = dedupeRoleCodes(payload?.role_codes);

  return {
    action: String(payload?.action ?? "").trim().toLowerCase(),
    user_id: userId,
    userId,
    id: userId,
    email: payload?.action === "delete" ? null : email || null,
    full_name: payload?.action === "delete" ? null : fullName,
    password: payload?.action === "delete" ? null : password,
    active: payload?.active !== false,
    role,
    role_codes: roleCodes.length ? roleCodes : [role.toLowerCase()],
  };
}

async function invokeAdminUsers(payload) {
  const accessToken = await getAccessToken();
  const body = buildAdminUsersPayload(payload);

  const { data, error } = await supabase.functions.invoke("admin-users", {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    const detail = await readFunctionError(error);
    throw new Error(detail);
  }

  if (!data) {
    throw new Error("No hubo respuesta de la Edge Function.");
  }

  if (data.error) {
    const stage = data.stage ? ` [${data.stage}]` : "";
    const details =
      typeof data.details === "string"
        ? `: ${data.details}`
        : data.details?.message
          ? `: ${data.details.message}`
          : "";

    throw new Error(`${data.error}${details}${stage}`);
  }

  return data;
}

async function attachRoles(users) {
  const list = Array.isArray(users) ? users : [];
  if (!list.length) return [];

  const userIds = list.map((u) => u.id);

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

  return list.map((user) => ({
    ...user,
    roles: rolesByUserId.get(user.id) || [],
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
        .map((row) => row.app_roles)
        .filter(Boolean),
    };
  },

  async saveUser(payload) {
    const action = String(payload?.action ?? "").trim().toLowerCase();

    if (action !== "create" && action !== "update" && action !== "delete") {
      throw new Error("action debe ser create, update o delete.");
    }

    if (action !== "delete") {
      if (!payload?.email) throw new Error("El correo es obligatorio.");
      if (!payload?.full_name) throw new Error("El nombre completo es obligatorio.");
    }

    const body = buildAdminUsersPayload(payload);

    if (action !== "delete" && body.password) {
      body.password = String(body.password);
    }

    const result = await invokeAdminUsers(body);
    return result;
  },

  async deleteUser(id) {
    if (!id) throw new Error("id es obligatorio.");

    const result = await invokeAdminUsers({
      action: "delete",
      user_id: id,
      userId: id,
      id,
    });

    return result;
  },
};