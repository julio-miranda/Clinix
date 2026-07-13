// js/router.js
import {
  getSessionUser,
  requireAuth,
  initLoginView,
  initDashboardView,
  redirectByRole
} from "./controllers/authController.js";

import { initPatientsView, initPatientFormView } from "./controllers/patientController.js";
import { initEncounterView } from "./controllers/encounterController.js";
import { initConsultationDetailView } from "./controllers/consultationDetailController.js";
import { initConsultationsListView } from "./controllers/consultationsListController.js";
import { initAuditView } from "./controllers/auditController.js";
import { initReportsView } from "./controllers/reportController.js";
import { initCatalogosView } from "./controllers/catalogController.js";
import { initReportDetailView } from "./controllers/reportDetailController.js";
import { initUsersView } from "./controllers/usersController.js";
import { initProfileView } from "./controllers/profileController.js";
import { initClinicsView } from "./controllers/clinicController.js";

let navigationToken = 0;

const routes = {
  "#/login": {
    view: "./views/login.html",
    public: true,
    init: initLoginView
  },
  "#/dashboard": {
    view: "./views/dashboard.html",
    roles: ["admin", "medico", "recepcion"],
    init: initDashboardView
  },
  "#/perfil": {
    view: "./views/perfil.html",
    roles: ["admin", "medico", "recepcion"],
    init: initProfileView
  },
  "#/clinicas": {
    view: "./views/clinicas.html",
    roles: ["admin"],
    init: initClinicsView
  },
  "#/pacientes": {
    view: "./views/pacientes.html",
    roles: ["admin", "recepcion", "medico"],
    init: initPatientsView
  },
  "#/paciente-form": {
    view: "./views/paciente-form.html",
    roles: ["admin", "recepcion"],
    init: initPatientFormView
  },
  "#/consulta": {
    view: "./views/consulta-form.html",
    roles: ["admin", "medico"],
    init: initEncounterView
  },
  "#/consulta-detalle": {
    view: "./views/consulta-detalle.html",
    roles: ["admin", "medico", "recepcion"],
    init: initConsultationDetailView
  },
  "#/consultas": {
    view: "./views/consultations-list.html",
    roles: ["admin", "medico", "recepcion"],
    init: initConsultationsListView
  },
  "#/auditoria": {
    view: "./views/audit-logs.html",
    roles: ["admin"],
    init: initAuditView
  },
  "#/reportes": {
    view: "./views/reportes.html",
    roles: ["admin", "medico"],
    init: initReportsView
  },
  "#/catalogos": {
    view: "./views/catalogos.html",
    roles: ["admin"],
    init: initCatalogosView
  },
  "#/reporte-detalle": {
    view: "./views/reporte-detalle.html",
    roles: ["admin", "medico"],
    init: initReportDetailView
  },
  "#/usuarios": {
    view: "./views/usuarios.html",
    roles: ["admin"],
    init: initUsersView
  }
};

function getAppContainer() {
  return document.getElementById("app");
}

function renderSystemError(message) {
  const app = getAppContainer();
  if (!app) return;

  app.innerHTML = `
    <div class="page">
      <h2>Error del sistema</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function loadView(viewPath, token) {
  const app = getAppContainer();
  if (!app) {
    throw new Error("No existe el contenedor #app en el DOM.");
  }

  const response = await fetch(viewPath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`No se pudo cargar la vista: ${viewPath}`);
  }

  if (token !== navigationToken) return false;

  const html = await response.text();
  if (token !== navigationToken) return false;

  app.innerHTML = html;
  return true;
}

function getCurrentRoute() {
  const rawHash = window.location.hash || "#/login";
  const [hashPath, queryString = ""] = rawHash.split("?");

  return {
    hashPath,
    queryString,
    route: routes[hashPath] || routes["#/login"]
  };
}

export async function router() {
  const token = ++navigationToken;

  try {
    const { hashPath, queryString, route } = getCurrentRoute();

    const user = getSessionUser();

    if (!route.public) {
      const authorized = await requireAuth();
      if (!authorized || token !== navigationToken) return;
    }

    const currentRole = String(user?.role || "").toLowerCase();

    if (route.roles && route.roles.length && user) {
      if (!route.roles.includes(currentRole)) {
        alert("No tienes permisos para acceder aquí.");
        redirectByRole(currentRole);
        return;
      }
    }

    const loaded = await loadView(route.view, token);
    if (!loaded || token !== navigationToken) return;

    const params = new URLSearchParams(queryString);

    if (typeof route.init === "function") {
      await route.init(params);
    }
  } catch (error) {
    console.error("Error en router:", error);
    renderSystemError(error?.message || "No se pudo cargar la página.");
  }
}