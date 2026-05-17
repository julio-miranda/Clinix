//js/models/patientModel.js
import { supabase } from "../config/supabase.js";

async function getCatalogId(tableName, code) {
  const { data, error } = await supabase
    .from(tableName)
    .select("id")
    .eq("code", code)
    .single();

  if (error) throw error;
  return data?.id ?? null;
}

export async function getSexes() {
  const { data, error } = await supabase
    .from("sexes")
    .select("id, code, name")
    .order("id", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getPatients(search = "") {
  let query = supabase
    .from("patients")
    .select(`
      id,
      medical_record_number,
      first_name,
      last_name,
      birth_date,
      sex_id,
      occupation,
      active,
      created_at,
      updated_at,
      sex:sexes(code,name)
    `)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,medical_record_number.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getPatientById(id) {
  const { data, error } = await supabase
    .from("patients")
    .select("id, medical_record_number, first_name, last_name, birth_date, sex_id, occupation, active, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function getPatientContacts(patientId) {
  const { data, error } = await supabase
    .from("patient_contacts")
    .select("*")
    .eq("patient_id", patientId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getPatientAddresses(patientId) {
  const { data, error } = await supabase
    .from("patient_addresses")
    .select("*")
    .eq("patient_id", patientId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getPatientFull(patientId) {
  const [patient, contacts, addresses] = await Promise.all([
    getPatientById(patientId),
    getPatientContacts(patientId),
    getPatientAddresses(patientId)
  ]);

  return {
    patient,
    primaryContact: contacts[0] || null,
    primaryAddress: addresses[0] || null
  };
}

export async function createPatient(payload) {
  const { data, error } = await supabase
    .from("patients")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updatePatient(id, payload) {
  const { data, error } = await supabase
    .from("patients")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function savePrimaryContact(patientId, contactValue) {
  const clean = String(contactValue || "").trim();

  await supabase
    .from("patient_contacts")
    .delete()
    .eq("patient_id", patientId)
    .eq("is_primary", true);

  if (!clean) return null;

  const contactTypeId = await getCatalogId("contact_types", "PHONE");
  const { data, error } = await supabase
    .from("patient_contacts")
    .insert({
      patient_id: patientId,
      contact_type_id: contactTypeId,
      contact_value: clean,
      is_primary: true,
      active: true
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function savePrimaryAddress(patientId, addressValue) {
  const clean = String(addressValue || "").trim();

  await supabase
    .from("patient_addresses")
    .delete()
    .eq("patient_id", patientId)
    .eq("is_primary", true);

  if (!clean) return null;

  const addressTypeId = await getCatalogId("address_types", "HOME");
  const { data, error } = await supabase
    .from("patient_addresses")
    .insert({
      patient_id: patientId,
      address_type_id: addressTypeId,
      line1: clean,
      is_primary: true
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}