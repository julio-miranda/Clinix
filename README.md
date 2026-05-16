# Clinix

Sistema web para gestion clinica con Supabase, orientado a pacientes, consultas, usuarios, reportes, auditoria y catalogos.

## Estructura

- `index.html`: entrada principal de la aplicacion.
- `assets/css/`: estilos globales.
- `views/`: pantallas HTML cargadas por el router.
- `js/controllers/`: logica de interaccion de cada vista.
- `js/models/`: acceso a datos en Supabase.
- `js/config/`: configuracion del cliente Supabase.
- `*.sql`: scripts de esquema y endurecimiento de seguridad para la base de datos.

## Ejecutar localmente

Este proyecto usa modulos ES en el navegador. Para evitar problemas de CORS al abrir archivos directamente, sirve la carpeta con un servidor estatico:

```bash
python -m http.server 8000
```

Luego abre:

```txt
http://127.0.0.1:8000
```

## Seguridad

- La llave Supabase usada en frontend debe ser una publishable/anon key, nunca una `service_role` key.
- Las reglas de acceso dependen de Row Level Security en Supabase.
- No agregues `.env` ni llaves privadas al repositorio.
- Mantén el esquema privado `app_private` fuera de los schemas expuestos por la API REST de Supabase.
