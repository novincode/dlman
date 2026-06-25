import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
// Initializes i18next and applies the saved language/direction/font before render.
import "./i18n";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
