// js/models/clinicModel.js
import { supabase } from "../config/supabase.js";

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

async function querySingleOrNull(builder) {
  const { data, error } = await builder.maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function getClinics(search = "") {
  let query = supabase
    .from("clinics")
    .select("id, name, active, created_at, updated_at")
    .order("name", { ascending: true });

  const term = normalizeText(search);
  if (term) {
    query = query.ilike("name", `%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getClinicById(id) {
  if (!id) return null;

  return await querySingleOrNull(
    supabase
      .from("clinics")
      .select("id, name, active, created_at, updated_at")
      .eq("id", id)
  );
}

export async function createClinic(payload) {
  const body = {
    name: normalizeText(payload?.name),
    active: payload?.active !== false
  };

  if (!body.name) throw new Error("El nombre de la clínica es obligatorio.");

  const { data, error } = await supabase
    .from("clinics")
    .insert(body)
    .select("id, name, active, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

export async function updateClinic(id, payload) {
  if (!id) throw new Error("id de clínica es obligatorio.");

  const body = {
    name: normalizeText(payload?.name),
    active: payload?.active !== false,
    updated_at: new Date().toISOString()
  };

  if (!body.name) throw new Error("El nombre de la clínica es obligatorio.");

  const { data, error } = await supabase
    .from("clinics")
    .update(body)
    .eq("id", id)
    .select("id, name, active, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteClinic(id) {
  if (!id) throw new Error("id de clínica es obligatorio.");

  const { error } = await supabase
    .from("clinics")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
}

export async function getBranches(clinicId = "", search = "") {
  let query = supabase
    .from("branches")
    .select(`
      id,
      clinic_id,
      name,
      active,
      created_at,
      updated_at,
      clinic:clinics(id, name)
    `)
    .order("name", { ascending: true });

  const clinic = normalizeText(clinicId);
  const term = normalizeText(search);

  if (clinic) {
    query = query.eq("clinic_id", clinic);
  }

  if (term) {
    query = query.ilike("name", `%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getBranchById(id) {
  if (!id) return null;

  return await querySingleOrNull(
    supabase
      .from("branches")
      .select(`
        id,
        clinic_id,
        name,
        active,
        created_at,
        updated_at,
        clinic:clinics(id, name)
      `)
      .eq("id", id)
  );
}

export async function createBranch(payload) {
  const body = {
    clinic_id: normalizeText(payload?.clinic_id),
    name: normalizeText(payload?.name),
    active: payload?.active !== false
  };

  if (!body.clinic_id) throw new Error("Debe seleccionar una clínica.");
  if (!body.name) throw new Error("El nombre de la sucursal es obligatorio.");

  const { data, error } = await supabase
    .from("branches")
    .insert(body)
    .select(`
      id,
      clinic_id,
      name,
      active,
      created_at,
      updated_at,
      clinic:clinics(id, name)
    `)
    .single();

  if (error) throw error;
  return data;
}

export async function updateBranch(id, payload) {
  if (!id) throw new Error("id de sucursal es obligatorio.");

  const body = {
    clinic_id: normalizeText(payload?.clinic_id),
    name: normalizeText(payload?.name),
    active: payload?.active !== false,
    updated_at: new Date().toISOString()
  };

  if (!body.clinic_id) throw new Error("Debe seleccionar una clínica.");
  if (!body.name) throw new Error("El nombre de la sucursal es obligatorio.");

  const { data, error } = await supabase
    .from("branches")
    .update(body)
    .eq("id", id)
    .select(`
      id,
      clinic_id,
      name,
      active,
      created_at,
      updated_at,
      clinic:clinics(id, name)
    `)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteBranch(id) {
  if (!id) throw new Error("id de sucursal es obligatorio.");

  const { error } = await supabase
    .from("branches")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
}

export async function getBranchesByClinic(clinicId) {
  const cleanClinicId = String(clinicId ?? "").trim();

  if (!cleanClinicId) return [];

  const { data, error } = await supabase
    .from("branches")
    .select("id, clinic_id, name, active, created_at, updated_at")
    .eq("clinic_id", cleanClinicId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}