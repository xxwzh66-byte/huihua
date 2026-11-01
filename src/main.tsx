import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppLock } from "./AppLock";
import { applyTheme, readTheme } from "./theme";
import "./styles.css";
import "./experience.css";
import "./refinements.css";
import "./polish.css";
import "./mochi.css";
import "./mobile.css";
// Last: the theme sheet re-declares the surfaces that hardcode white.
import "./theme.css";

// Paint the saved theme before the first render so the app never flashes white.
applyTheme(readTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppLock>
      <App />
    </AppLock>
  </React.StrictMode>,
);
