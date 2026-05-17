//js/models/catalogModel.js
import { supabase } from "../config/supabase.js";

export const CATALOGS = [
  { key: "sexes", title: "Sexos", table: "sexes" },
  { key: "contact_types", title: "Tipos de contacto", table: "contact_types" },
  { key: "address_types", title: "Tipos de dirección", table: "address_types" },
  { key: "patient_history_types", title: "Tipos de antecedentes", table: "patient_history_types" },
  { key: "allergy_severities", title: "Severidad de alergias", table: "allergy_severities" },
  { key: "encounter_statuses", title: "Estados de consulta", table: "encounter_statuses" },
  { key: "appointment_statuses", title: "Estados de cita", table: "appointment_statuses" },
  { key: "plan_item_types", title: "Tipos de plan", table: "plan_item_types" },
  { key: "study_types", title: "Tipos de estudio", table: "study_types" },
  { key: "audit_action_types", title: "Acciones de auditoría", table: "audit_action_types" },
  { key: "diagnosis_systems_ref", title: "Sistemas de diagnóstico", table: "diagnosis_systems_ref" },
  { key: "app_roles", title: "Roles del sistema", table: "app_roles" }
];

export function getCatalogDefinition(key) {
  return CATALOGS.find(c => c.key === key) || null;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function makeBaseCode(table, name) {
  const tablePrefix = normalizeText(table).slice(0, 3);
  const namePart = normalizeText(name).slice(0, 12);
  const raw = `${tablePrefix}_${namePart}`.replace(/_+/g, "_");
  return raw.slice(0, 20) || `${tablePrefix}_${Date.now().toString().slice(-8)}`.slice(0, 20);
}

async function ensureUniqueCode(table, baseCode, currentId = null) {
  let code = baseCode.slice(0, 20);
  let counter = 1;

  while (true) {
    let query = supabase
      .from(table)
      .select("id")
      .eq("code", code)
      .limit(1);

    if (currentId) {
      query = query.neq("id", currentId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw error;

    if (!data) return code;

    const suffix = `_${counter}`;
    const maxBaseLength = 20 - suffix.length;
    code = `${baseCode.slice(0, maxBaseLength)}${suffix}`;
    counter += 1;
  }
}

export async function listCatalogRows(table) {
  const { data, error } = await supabase
    .from(table)
    .select("id, code, name")
    .order("id", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getCatalogRow(table, id) {
  const { data, error } = await supabase
    .from(table)
    .select("id, code, name")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function saveCatalogRow(table, payload) {
  const cleanName = String(payload.name || "").trim();
  const cleanCode = String(payload.code || "").trim();

  if (!cleanName) {
    throw new Error("El nombre es obligatorio.");
  }

  const baseCode = cleanCode || makeBaseCode(table, cleanName);
  const finalCode = await ensureUniqueCode(table, baseCode, payload.id || null);

  if (payload.id) {
    const { data, error } = await supabase
      .from(table)
      .update({
        code: finalCode,
        name: cleanName
      })
      .eq("id", payload.id)
      .select("id, code, name")
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from(table)
    .insert({
      code: finalCode,
      name: cleanName
    })
    .select("id, code, name")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCatalogRow(table, id) {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
}