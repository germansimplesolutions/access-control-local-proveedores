import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import FichaApp from "./FichaApp.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";

import { ChakraProvider, extendTheme } from "@chakra-ui/react";
// En un kiosko no hay devtools a mano, así que cualquier excepción que no
// atrapa React (window.onerror) o una promesa rechazada sin catch
// (unhandledrejection) quedan mudas - la pantalla se pone en blanco sin
// ninguna pista. Logueamos con console.error para que, del lado de
// Electron, main.js la reenvíe al buffer de la pestaña Logs del panel
// admin (ver "console-message" en main.js).
window.addEventListener("error", (event) => {
  console.error(
    "[window.onerror]",
    event.message,
    event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : "",
    event.error && event.error.stack ? event.error.stack : ""
  );
});

window.addEventListener("unhandledrejection", (event) => {
  console.error(
    "[unhandledrejection]",
    event.reason && event.reason.stack ? event.reason.stack : String(event.reason)
  );
});
const theme = extendTheme({
  fonts: {
    poppins: "Poppins, sans-serif",
  },
  breakpoints: {
    base: "0px",
    sm: "320px",
    md: "768px",
    lg: "960px",
    xl: "1200px",
    "2xl": "1536px",
  },
});

// Ruteo simple sin libreria aparte: /ficha muestra la pantalla nueva de la
// ficha de la persona, cualquier otra ruta muestra el dashboard de
// entradas/salidas de siempre. Las dos se sirven desde el mismo contenedor
// fe, en el mismo puerto.
const ScreenToRender = window.location.pathname.startsWith("/ficha") ? FichaApp : App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ChakraProvider theme={theme}>
      <ErrorBoundary>
        <ScreenToRender />
      </ErrorBoundary>
    </ChakraProvider>
  </React.StrictMode>
);
