import React from "react";
import { Main } from "./components/Main";
import { CardProvider } from "./context/CardContext";
import { OptionsProvider } from "./context/OptionsContext";

const App: React.FC = () => (
  <CardProvider>
    <OptionsProvider>
      <Main />
    </OptionsProvider>
  </CardProvider>
);

export default App;
