import { supabase } from "../config/supabase.js";

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
      ip_address: ipAddress
    });

  if (error) throw error;
  return true;
}

export async function listAuditLogs(limit = 50) {
  const { data, error } = await supabase
    .from("audit_logs")
    .select(`
      id,
      user_id,
      action_type_id,
      entity_name,
      entity_id,
      details,
      ip_address,
      created_at,
      audit_action_types (
        id,
        code,
        name
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}