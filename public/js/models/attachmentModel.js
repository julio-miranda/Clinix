// js/models/attachmentModel.js
import { supabase } from "../config/supabase.js";

const STORAGE_BUCKET = "encounter-studies";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const STUDY_TYPE_BY_MIME = {
  "application/pdf": "PDF",
  "image/jpeg": "IMAGE",
  "image/png": "IMAGE",
  "image/webp": "IMAGE"
};

async function getCatalogId(tableName, code) {
  const { data, error } = await supabase
    .from(tableName)
    .select("id")
    .eq("code", code)
    .single();

  if (error) throw error;
  return data?.id ?? null;
}

function sanitizeFileName(name) {
  return String(name || "archivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user?.id ?? null;
}

function validateAttachmentFile(file) {
  if (!file) throw new Error("Debe seleccionar un archivo.");

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Tipo de archivo no permitido.");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("El archivo supera el tamaño máximo permitido.");
  }
}

export async function listEncounterAttachments(encounterId) {
  const { data, error } = await supabase
    .from("encounter_studies")
    .select(`
      id,
      encounter_id,
      study_type_id,
      title,
      description,
      file_url,
      original_filename,
      mime_type,
      file_size_bytes,
      uploaded_at,
      uploaded_by,
      study_types (
        id,
        code,
        name
      )
    `)
    .eq("encounter_id", encounterId)
    .order("uploaded_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function uploadEncounterAttachment({
  encounterId,
  file,
  title,
  description,
  uploadedBy,
  studyTypeCode
}) {
  if (!encounterId) throw new Error("encounterId es obligatorio.");

  validateAttachmentFile(file);

  const authUserId = await getCurrentUserId();
  const resolvedUploadedBy = authUserId || uploadedBy || null;
  if (!resolvedUploadedBy) {
    throw new Error("No hay usuario autenticado.");
  }

  const resolvedStudyTypeCode =
    studyTypeCode || STUDY_TYPE_BY_MIME[file.type] || "OTHER";

  const studyTypeId = await getCatalogId("study_types", resolvedStudyTypeCode);
  if (!studyTypeId) {
    throw new Error(`No existe el catálogo ${resolvedStudyTypeCode} en study_types.`);
  }

  const safeName = sanitizeFileName(file.name);
  const storagePath = `encounters/${encounterId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false
    });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("encounter_studies")
    .insert({
      encounter_id: encounterId,
      study_type_id: studyTypeId,
      title: String(title || file.name).trim(),
      description: String(description || "").trim() || null,
      file_url: storagePath,
      original_filename: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      uploaded_by: resolvedUploadedBy
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getSignedAttachmentUrl(storagePath, expiresIn = 3600) {
  if (!storagePath) return null;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) throw error;
  return data?.signedUrl || null;
}