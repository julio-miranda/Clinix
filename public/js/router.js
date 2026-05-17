import {
    getSessionUser,
    requireAuth,
    initLoginView,
    initDashboardView,
    redirectByRole
} from "./controllers/authController.js";

import {
    initPatientsView,
    initPatientFormView
} from "./controllers/patientController.js";

import {
    initEncounterView
} from "./controllers/encounterController.js";

import {
    initConsultationDetailView
} from "./controllers/consultationDetailController.js";

import { initConsultationsListView } from "./controllers/consultationsListController.js";

import { initAuditView } from "./controllers/auditController.js";

import { initReportsView } from "./controllers/reportController.js";

import { initCatalogosView } from "./controllers/catalogController.js";

import { initReportDetailView } from "./controllers/reportDetailController.js";

import { initUsersView } from "./controllers/usersController.js";

const app = document.getElementById("app");

const routes = {
    "#/login": {
        view: "./views/login.html",
        public: true,
        init: initLoginView
    },
    "#/dashboard": {
        view: "./views/dashboard.html",
        roles: ["admin", "medico"],
        init: initDashboardView
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

export async function router() {
    try {
        const rawHash = window.location.hash || "#/login";
        const [hashPath, queryString = ""] = rawHash.split("?");
        const route = routes[hashPath] || routes["#/login"];

        if (!route.public && !(await requireAuth())) return;

        const user = getSessionUser();
        const currentRole = String(user?.role || "").toLowerCase();

        if (route.roles && route.roles.length && user) {
            if (!route.roles.includes(currentRole)) {
                alert("No tienes permisos para acceder aqui.");
                redirectByRole(currentRole);
                return;
            }
        }

        await loadView(route.view);

        const params = new URLSearchParams(queryString);
        if (typeof route.init === "function") {
            await route.init(params);
        }
    } catch (error) {
        console.error("Error en router:", error);
        app.innerHTML = `
      <div class="page">
        <h2>Error del sistema</h2>
        <p>No se pudo cargar la página.</p>
      </div>
    `;
    }
}

async function loadView(viewPath) {
    try {
        const response = await fetch(viewPath);
        if (!response.ok) {
            throw new Error("No se pudo cargar la vista.");
        }

        const html = await response.text();
        app.innerHTML = html;
    } catch (error) {
        console.error("Error cargando vista:", error);
        app.innerHTML = `
      <div class="page">
        <h2>Error cargando vista</h2>
        <p>${error.message}</p>
      </div>
    `;
    }
}
