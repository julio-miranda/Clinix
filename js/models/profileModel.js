// js/models/profileModel.js
import { supabase } from "../config/supabase.js";

async function getCurrentAuthUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const user = data?.user || null;
  if (!user) {
    throw new Error("No hay una sesión activa.");
  }

  return user;
}

export async function getCurrentProfile() {
  const authUser = await getCurrentAuthUser();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, active, created_at")
    .eq("id", authUser.id)
    .single();

  if (error) throw error;

  return {
    authUser,
    profile: data
  };
}

export async function updateCurrentProfile(fullName) {
  const authUser = await getCurrentAuthUser();
  const cleanFullName = String(fullName || "").trim();

  if (!cleanFullName) {
    throw new Error("El nombre completo no puede estar vacío.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: cleanFullName
    })
    .eq("id", authUser.id)
    .select("id, full_name, role, active, created_at")
    .single();

  if (error) throw error;
  return data;
}

export async function changeCurrentPassword(newPassword) {
  const cleanPassword = String(newPassword || "").trim();

  if (cleanPassword.length < 12) {
    throw new Error("La contraseña debe tener al menos 12 caracteres.");
  }

  const { data, error } = await supabase.auth.updateUser({
    password: cleanPassword
  });

  if (error) throw error;
  return data;
}