// supabase/functions/admin-users/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action = "create" | "update" | "delete";
type SupabaseAdminClient = ReturnType<typeof createClient>;

type AppUserRow = {
  id: string;
  email: string;
  full_name: string;
  active: boolean;
};

type ProfileRow = {
  id: string;
  full_name: string;
  role: string;
  active: boolean;
};

type UserSnapshot = {
  appUser: AppUserRow | null;
  profile: ProfileRow | null;
  roleCodes: string[];
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function toNullableString(value: unknown): string | null {
  const v = asTrimmedString(value);
  return v ? v : null;
}

function isUuid(value: unknown): boolean {
  const v = asTrimmedString(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const v = asTrimmedString(value);
    if (v) return v;
  }
  return "";
}

function normalizeEmail(value: unknown) {
  return asTrimmedString(value).toLowerCase();
}

function normalizeName(value: unknown) {
  return asTrimmedString(value);
}

function normalizeRole(value: unknown) {
  const role = asTrimmedString(value).toUpperCase();
  return role || "RECEPCION";
}

function normalizeRoleCode(value: unknown) {
  return asTrimmedString(value).toLowerCase();
}

function isValidEmail(email: string) {
  return /^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$/i.test(email);
}

function isValidPassword(password: string) {
  return (
    typeof password === "string" &&
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function dedupeRoleCodes(values: unknown[]) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizeRoleCode).filter(Boolean))];
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message || null,
      name: error.name || null,
      stack: error.stack || null,
    };
  }

  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    return {
      message: typeof e.message === "string" ? e.message : null,
      name: typeof e.name === "string" ? e.name : null,
      stack: typeof e.stack === "string" ? e.stack : null,
      code: typeof e.code === "string" ? e.code : null,
      hint: typeof e.hint === "string" ? e.hint : null,
      details: typeof e.details === "string" ? e.details : null,
      status: typeof e.status === "number" ? e.status : null,
    };
  }

  return {
    message: typeof error === "string" ? error : null,
    name: null,
    stack: null,
    code: null,
    hint: null,
    details: null,
    status: null,
  };
}

async function getAuthenticatedAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { error: "Falta Authorization", status: 401 as const };
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { error: "Token inválido", status: 401 as const };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { error: "Faltan variables de entorno", status: 500 as const };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser(
    token,
  );

  if (userError || !userData?.user?.id) {
    return { error: "Token inválido o expirado", status: 401 as const };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return {
    admin,
    token,
    user: userData.user,
  };
}

async function getRequesterRole(
  admin: SupabaseAdminClient,
  userId: string,
): Promise<string | null> {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (profile && (profile as { active?: boolean }).active !== true) {
    return null;
  }

  const profileRole = normalizeRoleCode((profile as { role?: unknown } | null)?.role);
  if (profileRole) return profileRole;

  const { data: links, error: linksError } = await admin
    .from("app_user_roles")
    .select("role_id")
    .eq("user_id", userId);

  if (linksError) {
    throw linksError;
  }

  const roleIds = (links ?? [])
    .map((row) => asTrimmedString((row as { role_id?: unknown }).role_id))
    .filter(Boolean);

  if (roleIds.length === 0) return null;

  const { data: roles, error: rolesError } = await admin
    .from("app_roles")
    .select("code")
    .in("id", roleIds);

  if (rolesError) {
    throw rolesError;
  }

  const codes = (roles ?? [])
    .map((row) => normalizeRoleCode((row as { code?: unknown }).code))
    .filter(Boolean);

  if (codes.includes("admin")) return "admin";
  if (codes.includes("medico")) return "medico";
  if (codes.includes("recepcion")) return "recepcion";

  return null;
}

async function loadUserSnapshot(
  admin: SupabaseAdminClient,
  userId: string,
): Promise<UserSnapshot> {
  const [{ data: appUser, error: appUserError }, { data: profile, error: profileError }] =
    await Promise.all([
      admin
        .from("app_users")
        .select("id, email, full_name, active")
        .eq("id", userId)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("id, full_name, role, active")
        .eq("id", userId)
        .maybeSingle(),
    ]);

  if (appUserError) throw appUserError;
  if (profileError) throw profileError;

  const { data: roleLinks, error: roleLinksError } = await admin
    .from("app_user_roles")
    .select("role_id")
    .eq("user_id", userId);

  if (roleLinksError) throw roleLinksError;

  const roleIds = (roleLinks ?? [])
    .map((row) => asTrimmedString((row as { role_id?: unknown }).role_id))
    .filter(Boolean);

  let roleCodes: string[] = [];
  if (roleIds.length > 0) {
    const { data: roles, error: rolesError } = await admin
      .from("app_roles")
      .select("code")
      .in("id", roleIds);

    if (rolesError) throw rolesError;

    roleCodes = (roles ?? [])
      .map((row) => normalizeRoleCode((row as { code?: unknown }).code))
      .filter(Boolean);
  }

  return {
    appUser: appUser
      ? {
        id: asTrimmedString((appUser as { id?: unknown }).id),
        email: asTrimmedString((appUser as { email?: unknown }).email),
        full_name: asTrimmedString((appUser as { full_name?: unknown }).full_name),
        active: Boolean((appUser as { active?: unknown }).active),
      }
      : null,
    profile: profile
      ? {
        id: asTrimmedString((profile as { id?: unknown }).id),
        full_name: asTrimmedString((profile as { full_name?: unknown }).full_name),
        role: asTrimmedString((profile as { role?: unknown }).role),
        active: Boolean((profile as { active?: unknown }).active),
      }
      : null,
    roleCodes,
  };
}

async function restoreSnapshot(
  admin: SupabaseAdminClient,
  userId: string,
  snapshot: UserSnapshot,
) {
  if (snapshot.appUser) {
    const { error } = await admin.rpc("sync_app_user_account", {
      p_user_id: userId,
      p_email: snapshot.appUser.email,
      p_full_name: snapshot.appUser.full_name,
      p_active: snapshot.appUser.active,
    });
    if (error) throw error;
  }

  if (snapshot.profile) {
    const { error } = await admin.rpc("sync_profile_account", {
      p_user_id: userId,
      p_full_name: snapshot.profile.full_name,
      p_role: snapshot.profile.role,
      p_active: snapshot.profile.active,
    });
    if (error) throw error;
  }

  const { error: rolesError } = await admin.rpc("sync_user_roles", {
    p_user_id: userId,
    p_role_codes: snapshot.roleCodes,
  });
  if (rolesError) throw rolesError;
}

async function syncAppUser(
  admin: SupabaseAdminClient,
  userId: string,
  email: string,
  fullName: string,
  active: boolean,
) {
  const { data, error } = await admin.rpc("sync_app_user_account", {
    p_user_id: userId,
    p_email: email,
    p_full_name: fullName,
    p_active: active,
  });

  if (error) throw error;
  return data;
}

async function syncProfile(
  admin: SupabaseAdminClient,
  userId: string,
  fullName: string,
  role: string,
  active: boolean,
) {
  const { data, error } = await admin.rpc("sync_profile_account", {
    p_user_id: userId,
    p_full_name: fullName,
    p_role: role,
    p_active: active,
  });

  if (error) throw error;
  return data;
}

async function syncRoles(
  admin: SupabaseAdminClient,
  userId: string,
  roleCodes: string[],
) {
  const { error } = await admin.rpc("sync_user_roles", {
    p_user_id: userId,
    p_role_codes: roleCodes,
  });

  if (error) throw error;
}

async function createAuthUser(
  admin: SupabaseAdminClient,
  email: string,
  password: string,
) {
  console.log("========== CREATE AUTH USER ==========");
  console.log("email:", email);
  console.log("passwordLength:", password?.length ?? 0);

  const response = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  console.log(
    "SUPABASE AUTH RESPONSE:",
    JSON.stringify(response, null, 2),
  );

  const { data, error } = response;

  if (error) {
    console.error(
      "CREATE USER ERROR:",
      JSON.stringify(error, null, 2),
    );

    throw new Error(
      JSON.stringify({
        message: error.message,
        status: (error as any)?.status,
        code: (error as any)?.code,
        name: (error as any)?.name,
      }),
    );
  }

  if (!data?.user?.id) {
    throw new Error(
      "Supabase devolvió éxito pero no retornó user.id",
    );
  }

  console.log("USER CREATED:", data.user.id);

  return data.user.id;
}

async function updateAuthUser(
  admin: SupabaseAdminClient,
  userId: string,
  email: string,
  password: string | null,
) {
  const payload: Record<string, unknown> = { email };

  if (password) {
    if (!isValidPassword(password)) {
      throw new Error("La contraseña debe tener al menos 12 caracteres");
    }
    payload.password = password;
  }

  const { error } = await admin.auth.admin.updateUserById(userId, payload);
  if (error) throw error;
}

async function softDeleteUser(admin: SupabaseAdminClient, userId: string) {
  const { error: rolesError } = await admin
    .from("app_user_roles")
    .delete()
    .eq("user_id", userId);

  if (rolesError) throw rolesError;

  const { error: appUserError } = await admin
    .from("app_users")
    .update({
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (appUserError) throw appUserError;

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      active: false,
    })
    .eq("id", userId);

  if (profileError) throw profileError;

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
  if (authDeleteError) throw authDeleteError;
}

async function cleanupOnFailure(
  admin: SupabaseAdminClient,
  userId?: string | null,
) {
  if (!userId) return;

  await admin.from("app_user_roles").delete().eq("user_id", userId).catch(() => null);
  await admin.from("profiles").delete().eq("id", userId).catch(() => null);
  await admin.from("app_users").delete().eq("id", userId).catch(() => null);
  await admin.auth.admin.deleteUser(userId).catch(() => null);
}

async function validateAdminCaller(
  admin: SupabaseAdminClient,
  token: string,
) {
  try {
    if (!token) {
      return { error: "Token requerido", status: 401 as const };
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() || "";
    if (!supabaseUrl || !anonKey) {
      return { error: "Faltan variables de entorno", status: 500 as const };
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: userData, error: userError } = await authClient.auth.getUser(
      token,
    );

    if (userError || !userData?.user?.id) {
      return {
        error: "Token inválido o expirado",
        status: 401 as const,
      };
    }

    const userId = userData.user.id;

    const { data: appUser, error: appUserError } = await admin
      .from("app_users")
      .select("id, active")
      .eq("id", userId)
      .maybeSingle();

    if (appUserError) {
      return {
        error: "Database error finding users",
        status: 500 as const,
        details: {
          stage: "validate-auth",
          error: serializeError(appUserError),
        },
      };
    }

    if (!appUser || (appUser as { active?: boolean }).active !== true) {
      return {
        error: "Usuario de aplicación no válido",
        status: 403 as const,
      };
    }

    const role = await getRequesterRole(admin, userId);
    if (role !== "admin" && role !== "developer") {
      return {
        error: "Sin permisos",
        status: 403 as const,
      };
    }

    return { userId };
  } catch (error) {
    return {
      error: asTrimmedString((error as Error)?.message) || "Error de autenticación",
      status: 401 as const,
      details: serializeError(error),
    };
  }
}

function extractAction(body: any): Action | "" {
  return String(body?.action || body?.data?.action || body?.payload?.action || "")
    .trim()
    .toLowerCase() as Action;
}

function extractUserId(body: any): string {
  return firstNonEmpty(
    body?.user_id,
    body?.userId,
    body?.id,
    body?.data?.user_id,
    body?.data?.userId,
    body?.data?.id,
    body?.payload?.user_id,
    body?.payload?.userId,
    body?.payload?.id,
  );
}

function extractEmail(body: any): string {
  return firstNonEmpty(
    body?.email,
    body?.data?.email,
    body?.payload?.email,
    body?.payload?.data?.email,
  );
}

function extractPassword(body: any): string {
  return firstNonEmpty(
    body?.password,
    body?.data?.password,
    body?.payload?.password,
    body?.payload?.data?.password,
  );
}

function extractFullName(body: any): string {
  return firstNonEmpty(
    body?.full_name,
    body?.fullName,
    body?.nombre,
    body?.data?.full_name,
    body?.data?.fullName,
    body?.data?.nombre,
    body?.payload?.full_name,
    body?.payload?.fullName,
    body?.payload?.nombre,
  );
}

function extractRole(body: any): string {
  return firstNonEmpty(
    body?.role,
    body?.data?.role,
    body?.payload?.role,
    "RECEPCION",
  ).toUpperCase();
}

function extractRoleCodes(body: any): string[] {
  const raw = Array.isArray(body?.role_codes)
    ? body.role_codes
    : Array.isArray(body?.data?.role_codes)
      ? body.data.role_codes
      : Array.isArray(body?.payload?.role_codes)
        ? body.payload.role_codes
        : [];

  return dedupeRoleCodes(raw);
}

async function handleCreate(admin: SupabaseAdminClient, body: any) {
  const stage = {
    value: "create:init",
  };

  const email = normalizeEmail(extractEmail(body));
  const password = extractPassword(body);
  const fullName = normalizeName(extractFullName(body));
  const role = normalizeRole(extractRole(body));
  const roleCodes = extractRoleCodes(body);
  const active = body?.active !== false;

  if (!email || !password || !fullName) {
    return json({ error: "email, password y full_name son obligatorios" }, 400);
  }

  if (!isValidEmail(email)) {
    return json({ error: "Email inválido" }, 400);
  }

  if (!isValidPassword(password)) {
    return json(
      { error: "La contraseña debe tener al menos 12 caracteres" },
      400,
    );
  }

  const finalRoleCodes = roleCodes.length ? roleCodes : [role.toLowerCase()];

  stage.value = "create:check-app-user";
  const { data: existingAppUser, error: existingAppUserError } = await admin
    .from("app_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingAppUserError) {
    return json({
      error: existingAppUserError.message,
      stage: stage.value,
      details: serializeError(existingAppUserError),
    }, 500);
  }

  if (existingAppUser) {
    return json({ error: "Ya existe un usuario con ese correo" }, 409);
  }

  let newAuthUserId: string | null = null;

  try {
    console.log("SERVICE ROLE EXISTS:", !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    console.log("SUPABASE URL EXISTS:", !!Deno.env.get("SUPABASE_URL"));
    stage.value = "create:auth";
    newAuthUserId = await createAuthUser(admin, email, password);

    stage.value = "create:app_user";
    const appUser = await syncAppUser(
      admin,
      newAuthUserId,
      email,
      fullName,
      active,
    );

    stage.value = "create:profile";
    const profile = await syncProfile(
      admin,
      newAuthUserId,
      fullName,
      role,
      active,
    );

    stage.value = "create:roles";
    await syncRoles(admin, newAuthUserId, finalRoleCodes);

    return json({
      success: true,
      action: "create",
      userId: newAuthUserId,
      appUser,
      profile,
      roleCodes: finalRoleCodes,
    }, 200);
  } catch (error) {
    console.error(
      "HANDLE CREATE ERROR:",
      JSON.stringify(error, null, 2),
    );

    await cleanupOnFailure(admin, newAuthUserId);

    const errorMessage = (error as Error)?.message || "";
    
    // Captura defensiva de la desincronización en auth.users (Error 500 interno de GoTrue)
    if (errorMessage.includes("Database error creating new user") || errorMessage.includes("unexpected_failure")) {
      return json({
        error: "El correo ya está registrado en el sistema de autenticación (auth.users), pero se encuentra desincronizado de las tablas de la aplicación. Por favor, elimine el registro fantasma desde la pestaña Authentication en Supabase antes de reintentar.",
        stage: stage.value,
        details: serializeError(error),
      }, 409);
    }

    return json({
      error: asTrimmedString(errorMessage) || "Error al crear usuario",
      stage: stage.value,
      details: {
        email,
        full_name: fullName,
        role,
        role_codes: finalRoleCodes,
        auth_user_id: newAuthUserId,
        error: serializeError(error),
      },
    }, 500);
  }
}

async function handleUpdate(admin: SupabaseAdminClient, body: any) {
  const stage = {
    value: "update:init",
  };

  const userId = extractUserId(body);
  if (!isUuid(userId)) {
    return json({ error: "user_id inválido" }, 400);
  }

  const email = normalizeEmail(extractEmail(body));
  const password = extractPassword(body) || null;
  const fullName = normalizeName(extractFullName(body));
  const role = normalizeRole(extractRole(body));
  const roleCodes = extractRoleCodes(body);
  const active = body?.active !== false;

  const { data: exists, error: existsError } = await admin
    .from("app_users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existsError) {
    return json({
      error: existsError.message,
      stage: "update:check-user",
      details: serializeError(existsError),
    }, 500);
  }

  if (!exists) {
    return json({ error: "Usuario no encontrado" }, 404);
  }

  const snapshot = await loadUserSnapshot(admin, userId);

  try {
    if (email || password) {
      stage.value = "update:auth";
      await updateAuthUser(
        admin,
        userId,
        email || snapshot.appUser?.email || "",
        password,
      );
    }

    stage.value = "update:app_user";
    await syncAppUser(
      admin,
      userId,
      email || snapshot.appUser?.email || "",
      fullName || snapshot.appUser?.full_name || snapshot.profile?.full_name || "",
      active,
    );

    stage.value = "update:profile";
    await syncProfile(
      admin,
      userId,
      fullName || snapshot.profile?.full_name || snapshot.appUser?.full_name || "",
      role || snapshot.profile?.role || "RECEPCION",
      active,
    );

    stage.value = "update:roles";
    await syncRoles(
      admin,
      userId,
      roleCodes.length
        ? roleCodes
        : [String(role || snapshot.profile?.role || "RECEPCION").toLowerCase()],
    );

    return json({
      success: true,
      action: "update",
      userId,
    }, 200);
  } catch (error) {
    console.error("admin-users update failed:", {
      stage: stage.value,
      error: serializeError(error),
      userId,
    });

    await restoreSnapshot(admin, userId, snapshot).catch((rollbackError) => {
      console.error("Rollback update failed:", serializeError(rollbackError));
    });

    return json({
      error: asTrimmedString((error as Error)?.message) || "Error al actualizar usuario",
      stage: stage.value,
      details: {
        userId,
        error: serializeError(error),
      },
    }, 500);
  }
}

async function handleDelete(admin: SupabaseAdminClient, body: any) {
  const userId = extractUserId(body);

  if (!isUuid(userId)) {
    return json({ error: "user_id inválido" }, 400);
  }

  const { data: exists, error: existsError } = await admin
    .from("app_users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existsError) {
    return json({
      error: existsError.message,
      stage: "delete:check-user",
      details: serializeError(existsError),
    }, 500);
  }

  if (!exists) {
    return json({ error: "Usuario no encontrado" }, 404);
  }

  try {
    await softDeleteUser(admin, userId);

    return json({
      success: true,
      action: "delete",
      userId,
    }, 200);
  } catch (error) {
    console.error("admin-users delete failed:", {
      error: serializeError(error),
      userId,
    });

    return json({
      error: asTrimmedString((error as Error)?.message) || "Error al eliminar usuario",
      stage: "delete",
      details: {
        userId,
        error: serializeError(error),
      },
    }, 500);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const auth = await getAuthenticatedAdmin(req);
    if ("status" in auth) {
      return json({ error: auth.error, details: (auth as any).details ?? null }, auth.status);
    }

    const { admin, token } = auth;

    const authCheck = await validateAdminCaller(admin, token);
    if ("status" in authCheck) {
      return json({
        error: authCheck.error,
        details: (authCheck as { details?: unknown }).details ?? null,
      }, authCheck.status);
    }

    const body = await req.json().catch(() => ({}));
    const action = extractAction(body);

    if (action !== "create" && action !== "update" && action !== "delete") {
      return json({ error: "action debe ser create, update o delete" }, 400);
    }

    if (action === "create") {
      return await handleCreate(admin, body);
    }

    if (action === "update") {
      return await handleUpdate(admin, body);
    }

    if (action === "delete") {
      return await handleDelete(admin, body);
    }

    return json({ error: "Acción no soportada" }, 400);
  } catch (error) {
    console.error("admin-users fatal error:", {
      error: serializeError(error),
      stack: (error as Error)?.stack || null,
    });

    return json({
      error: asTrimmedString((error as Error)?.message) || "Error inesperado",
      details: {
        name: (error as Error)?.name || null,
        stack: (error as Error)?.stack || null,
      },
      stage: "fatal",
    }, 500);
  }
});