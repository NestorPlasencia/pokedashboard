import React, { useState, lazy, Suspense } from "react";
import { Main } from "./components/Main";
import { CardProvider } from "./context/CardContext";
import { OptionsProvider } from "./context/OptionsContext";

const ConditionEditor = lazy(() =>
  import("./components/views/ConditionEditor").then((m) => ({
    default: m.ConditionEditor,
  }))
);

type AppView = "dashboard" | "conditions";

const App: React.FC = () => {
  const [view, setView] = useState<AppView>("dashboard");

  return (
    <CardProvider>
      <OptionsProvider>
        <div className="app-shell">
          {/* ─ Navigation bar ─ */}
          <nav className="app-nav">
            <button className={`app-tab ${view === "dashboard" ? "is-active" : ""}`} onClick={() => setView("dashboard")}>
              Dashboard
            </button>
            <button className={`app-tab ${view === "conditions" ? "is-active" : ""}`} onClick={() => setView("conditions")}>
              Editor de Condiciones
            </button>
          </nav>

          {/* ─ View ─ */}
          <div className="app-view">
            {view === "dashboard" && <Main />}
            {view === "conditions" && (
              <Suspense fallback={<div className="app-loading">Cargando editor...</div>}>
                <ConditionEditor />
              </Suspense>
            )}
          </div>
        </div>
      </OptionsProvider>
    </CardProvider>
  );
};

export default App;
