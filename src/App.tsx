import { WishlistsProvider } from "./context/WishlistsContext";
import React from "react";
import { Main } from "./components/Main";
import { CardProvider } from "./context/CardContext";
import { OptionsProvider } from "./context/OptionsContext";
import { AuthProvider } from "./context/AuthContext";

const App: React.FC = () => (
  <AuthProvider>
    <CardProvider>
      <OptionsProvider>
        <WishlistsProvider>
          <Main />
        </WishlistsProvider>
      </OptionsProvider>
    </CardProvider>
  </AuthProvider>
);

export default App;
