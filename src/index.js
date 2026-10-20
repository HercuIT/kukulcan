import React from "react";
import ReactDOM from "react-dom/client";
// Los tokens del tema van antes que cualquier otra hoja de estilo.
import "./styles/theme.css";
import "./index.css";
import App from "./App";
import { ThemeProvider } from "./theme/ThemeContext";
import reportWebVitals from "./reportWebVitals";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
