# Face ID Proveedores - app de Windows (sin Docker)

Mismo funcionamiento que la app de Propietarios: se instala, queda en la
bandeja al cerrar la ventana, y desde la bandeja se tilda "Iniciar con
Windows". La ventana abre la ficha (`/ficha`). Todo corre en el puerto 3888.

- Panel de configuración: bandeja > "Abrir configuración" (admin/admin la
  primera vez, cambiarlo).
- Datos y configuración: `%APPDATA%\Face ID Proveedores\calocal-data\`.
  Las actualizaciones no los tocan.
- En cada Face ID, el servidor de eventos tiene que apuntar a
  `http://IP-DE-LA-PC:3888/event`.
- No incluye lectura de patentes.

## Generar el instalador

`cd windows-app && npm install && npm run dist:win` deja en `dist-installer/`
el `.exe`, el `.blockmap` y `latest.yml`. `backend/` se arma solo a partir de
`../be` y `../fe` (no editarlo a mano).

## Publicar una actualización

1. Subir el número de `version` en `windows-app/package.json` (ej. 1.0.1).
2. `npm run dist:win`.
3. En GitHub: Releases > Draft a new release > tag `v1.0.1` > adjuntar los
   tres archivos de `dist-installer/` (`.exe`, `.exe.blockmap`, `latest.yml`)
   > Publish release (no marcar "pre-release").

Cada PC busca al arrancar y cada hora, descarga sola e instala cuando pasan
2 minutos sin ingresos.
