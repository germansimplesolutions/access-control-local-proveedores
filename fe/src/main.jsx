import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import FichaApp from "./FichaApp.jsx";

import { ChakraProvider, extendTheme } from "@chakra-ui/react";
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
      <ScreenToRender />
    </ChakraProvider>
  </React.StrictMode>
);
