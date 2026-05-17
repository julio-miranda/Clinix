// supabase/functions/admin-users/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";

type Action = "create" | "update";

type AdminUserPayload = {
  action: Action;
  user_id?: string;
  email: string;
  full_name: string;
  password?: string;
  active?: boolean;
  role?: string;        // "ADMIN" | "MEDICO" | "RECEPCION"
  role_codes?: string[]; // e.g. ["admin"], ["medico"], ["recepcion"]
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeName(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeRole(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function isValidEmail(email: string) {
  return /^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$/i.test(email);
}

function isValidPassword(password: string) {
  return password.length >= 12;
}

function isUuid(value: unknown) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function mapRoleToCodes(role: string, roleCodes?: string[]) {
  if (Array.isArray(roleCodes) && roleCodes.length > 0) {
    return roleCodes.map((r) => String(r).trim().toLowerCase()).filter(Boolean);
  }

  const r = role.toUpperCase();
  if (r === "ADMIN") return ["admin"];
  if (r === "MEDICO") return ["medico"];
  if (r === "RECEPCION") return ["recepcion"];
  return ["recepcion"];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "Missing Supabase environment variables" });
  }

  const authHeader = req.headers.get("Authorization") ?? "";

  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const body = (await req.json()) as Partial<AdminUserPayload>;

    const action = body.action;
    const email = normalizeEmail(body.email);
    const fullName = normalizeName(body.full_name);
    const password = String(body.password ?? "");
    const active = body.active !== false;
    const role = normalizeRole(body.role || "RECEPCION");
    const roleCodes = mapRoleToCodes(role, body.role_codes);

    if (action !== "create" && action !== "update") {
      return json(400, { error: "action debe ser create o update" });
    }

    if (!isValidEmail(email)) {
      return json(400, { error: "Email inválido" });
    }

    if (!fullName) {
      return json(400, { error: "El nombre completo es obligatorio" });
    }

    if (action === "create" && !isValidPassword(password)) {
      return json(400, { error: "La contraseña debe tener al menos 12 caracteres" });
    }

    if (action === "update" && body.user_id && !isUuid(body.user_id)) {
      return json(400, { error: "user_id inválido" });
    }

    const { data: authUserData, error: authUserError } = await supabaseUser.auth.getUser();
    if (authUserError) {
      return json(401, { error: authUserError.message });
    }

    const caller = authUserData?.user;
    if (!caller?.id) {
      return json(401, { error: "No autenticado" });
    }

    const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role, active")
      .eq("id", caller.id)
      .single();

    if (callerProfileError || !callerProfile) {
      return json(403, { error: "Perfil no encontrado" });
    }

    if (String(callerProfile.role).toUpperCase() !== "ADMIN" || callerProfile.active !== true) {
      return json(403, { error: "permission denied" });
    }

    let authUserId = body.user_id ?? null;

    if (action === "create") {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role,
        },
        app_metadata: {
          provider: "email",
        },
      });

      if (createError) {
        return json(400, { error: createError.message });
      }

      authUserId = created.user?.id ?? null;

      if (!authUserId) {
        return json(500, { error: "No se pudo obtener el ID del usuario creado" });
      }
    }

    if (action === "update") {
      if (!authUserId) {
        const { data: foundUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });

        if (listError) {
          return json(500, { error: listError.message });
        }

        const matched = foundUsers.users.find((u) => (u.email || "").toLowerCase() === email);
        authUserId = matched?.id ?? null;
      }

      if (!authUserId) {
        return json(404, { error: "Usuario de autenticación no encontrado" });
      }

      const updateAttrs: {
        email?: string;
        password?: string;
        user_metadata?: Record<string, unknown>;
      } = {
        email,
        user_metadata: {
          full_name: fullName,
          role,
        },
      };

      if (password) {
        if (!isValidPassword(password)) {
          return json(400, { error: "La contraseña debe tener al menos 12 caracteres" });
        }
        updateAttrs.password = password;
      }

      const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        authUserId,
        updateAttrs
      );

      if (updateError) {
        return json(400, { error: updateError.message });
      }

      if (!updated.user?.id) {
        return json(500, { error: "No se pudo actualizar el usuario en Auth" });
      }
    }

    if (!authUserId) {
      return json(500, { error: "authUserId no resuelto" });
    }

    const { data: appUser, error: appUserError } = await supabaseAdmin.rpc("sync_app_user_account", {
      p_user_id: authUserId,
      p_email: email,
      p_full_name: fullName,
      p_active: active,
    });

    if (appUserError) {
      return json(400, { error: appUserError.message });
    }

    const { data: profile, error: profileError } = await supabaseAdmin.rpc("sync_profile_account", {
      p_user_id: authUserId,
      p_full_name: fullName,
      p_role: role,
      p_active: active,
    });

    if (profileError) {
      return json(400, { error: profileError.message });
    }

    const { error: rolesError } = await supabaseAdmin.rpc("sync_user_roles", {
      p_user_id: authUserId,
      p_role_codes: roleCodes,
    });

    if (rolesError) {
      return json(400, { error: rolesError.message });
    }

    return json(200, {
      ok: true,
      action,
      auth_user_id: authUserId,
      app_user: appUser,
      profile,
      role_codes: roleCodes,
    });
  } catch (error) {
    console.error("admin-users error:", error);
    return json(500, {
      error: error instanceof Error ? error.message : "Unexpected error",
    });
  }
});