import { Component } from "react";

// Si algo rompe el render de <App /> (pantalla en blanco)
// sin esto React desmonta TODO el árbol y queda una pantalla
// blanca sin ninguna pista, salvo el botón de Config (que vive afuera,
// directo en index.html - ver más abajo). Con este boundary: se loguea el
// error completo (console.error, que main.js reenvía a la pestaña Logs del
// panel admin) y, como es una pantalla de kiosko sin nadie mirando devtools,
// se recarga sola a los pocos segundos en vez de quedar rota hasta que
// alguien la reinicie a mano.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error(
      "[ErrorBoundary] la pantalla se rompió, reiniciando en 5s:",
      error && error.stack ? error.stack : String(error),
      info && info.componentStack ? info.componentStack : ""
    );
    setTimeout(() => window.location.reload(), 5000);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            fontFamily: "poppins, sans-serif",
            color: "#9E1217",
            fontSize: 18,
            textAlign: "center",
            padding: 24,
          }}
        >
          Hubo un problema mostrando la pantalla. Reiniciando...
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
