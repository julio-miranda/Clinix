//js/models/auditModel.js
import { supabase } from "../config/supabase.js";

const CONTEXT_KEY = "app_context";

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

function requireAppContext() {
  const ctx = getAppContext();
  if (!ctx.clinic_id || !ctx.branch_id) {
    throw new Error("Debe seleccionar clínica y sucursal.");
  }
  return ctx;
}

async function getActionTypeId(code) {
  const { data, error } = await supabase
    .from("audit_action_types")
    .select("id")
    .eq("code", code)
    .single();

  if (error) throw error;
  return data?.id ?? null;
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user?.id ?? null;
}

export async function createAuditLog({
  actionCode,
  entityName,
  entityId = null,
  details = null,
  ipAddress = null
}) {
  const context = requireAppContext();

  const actionTypeId = await getActionTypeId(actionCode);
  if (!actionTypeId) {
    throw new Error(`No existe el actionCode ${actionCode} en audit_action_types.`);
  }

  const currentUserId = await getCurrentUserId();
  if (!currentUserId) {
    throw new Error("No hay usuario autenticado para generar la auditoría.");
  }

  const { error } = await supabase
    .from("audit_logs")
    .insert({
      user_id: currentUserId,
      action_type_id: actionTypeId,
      entity_name: entityName,
      entity_id: entityId,
      details,
      ip_address: ipAddress,
      clinic_id: context.clinic_id,
      branch_id: context.branch_id
    });

  if (error) throw error;
  return true;
}

export async function listAuditLogs(limit = 50) {
  const context = requireAppContext();

  const { data, error } = await supabase
    .from("audit_logs")
    .select(`
      id,
      entity_name,
      entity_id,
      details,
      ip_address,
      created_at,
      user:app_users!audit_logs_user_id_fkey (
        id,
        full_name,
        email
      ),
      action_type:audit_action_types!audit_logs_action_type_id_fkey (
        id,
        code,
        name
      )
    `)
    .eq("clinic_id", context.clinic_id)
    .eq("branch_id", context.branch_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}