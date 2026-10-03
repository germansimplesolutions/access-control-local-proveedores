# control-acceso-local-v2

Proyecto nuevo y separado de `access-control-local` (v25). Parte del código de
v25 pero SIN los fixes de offline/delete y de "siempre mandar log" que se
armaron para ese proyecto - este es su propio punto de partida, versionado
desde v1.

## Qué cambia respecto a v25

- **Base de datos local**: al sincronizar, cada persona se guarda completa
  en `be/database/database.json` (indexado por documento/DNI), **menos**
  los campos `user` y `resident_phones`, que nunca se persisten.
- **Alta en el Face ID más simple**: solo se carga DNI, nombre y apellido -
  no se enrola ninguna foto/cara en el equipo.
- **QR (experimental)**: si la persona tiene `id_hash`, se intenta cargarlo
  como QR en el equipo. No encontré documentación ISAPI confirmada para
  este modelo sin pasar por HikCentral - el código lo intenta mediante
  `CardInfo/Record` con `cardType: "QRCode"` como mejor hipótesis, pero
  **hay que probarlo contra un equipo real**. Si falla, no corta el resto
  del alta (queda solo en el log).
- **Apertura de puerta validada por el backend**: el equipo identifica a la
  persona (con `doorRight` deshabilitado, para que no abra la puerta por su
  cuenta) y el backend recién manda la orden de apertura
  (`RemoteControl/door`) si no tiene ningún vencimiento documental
  (ART, certificado de reincidencia, registro de conducir, seguro del
  vehículo). **Importante**: no pude confirmar en la documentación que el
  equipo siga generando el evento de identificación con `doorRight` en 0 -
  es la hipótesis más razonable que encontré, pero se necesita probar en
  campo. Si no genera el evento así, hay que revisar esto.
- **Caso sin ficha local** (por ejemplo tarjetas de guardia/personal sin
  registro de residente): por ahora el backend NO abre la puerta
  automáticamente si no encuentra datos locales de esa persona. Si estas
  credenciales necesitan abrir igual, falta definir un bypass para ellas.
- **Front nuevo `/ficha`**: pantalla separada (mismo contenedor `fe`, mismo
  puerto 8080) que muestra la ficha de la persona identificada, con sus
  vencimientos y un aviso si algo está vencido. Se accede en
  `http://IP-DE-LA-PC:8080/ficha`. El dashboard de entradas/salidas de
  siempre sigue en `http://IP-DE-LA-PC:8080/`.
  - Su botón de Config tiene los mismos parámetros que el dashboard v1, más
    una pestaña nueva para elegir uno o más equipos Face ID a mostrar (sin
    selección = se muestran todos).
- **PHOTO_SOURCE por defecto en "local"** en vez de "device": como ya no se
  enrola foto en el equipo, buscarla ahí nunca encontraría nada.

## Cómo levantarlo

1. Copiar `be/.env-example` a `be/.env-be` y completar los datos (igual que
   en v25).
2. Copiar `fe/.env.example` a `.env-fe` y completar `VITE_HOST`.
3. Crear los archivos vacíos si es la primera vez:
   ```
   touch .env-be .env-fe
   mkdir -p images uploads database
   ```
4. Buildear y pushear las imágenes (todavía no existen en ningún
   registry), ajustar `docker-compose.yaml` con el nombre que uses, y:
   ```
   docker compose up -d
   ```

## Pendiente de validar en campo

- Que `doorRight: "0"` siga permitiendo que el equipo mande el evento de
  identificación (sin esto, la apertura por backend no tiene de qué
  dispararse).
- El endpoint de QR (`CardInfo/Record` con `cardType: "QRCode"`) - no
  confirmado para este modelo de equipo.
- Qué hacer con credenciales sin ficha local (tarjetas de guardia/personal).
