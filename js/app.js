// js/app.js
import { router } from "./router.js";

function safeRouter() {
  router().catch((error) => {
    console.error("Error no controlado en router:", error);
  });
}

window.addEventListener("error", (event) => {
  console.error("ERROR GLOBAL:", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("PROMESA RECHAZADA:", event.reason);
});

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", safeRouter);
} else {
  safeRouter();
}

window.addEventListener("hashchange", safeRouter);