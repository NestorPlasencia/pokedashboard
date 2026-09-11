import { WishlistsProvider } from "./context/WishlistsContext";
import React from "react";
import { Main } from "./components/Main";
import { CardProvider } from "./context/CardContext";
import { OptionsProvider } from "./context/OptionsContext";
import { AuthProvider } from "./context/AuthContext";
import { OwnedCollectionsProvider } from "./context/OwnedCollectionsContext";

const App: React.FC = () => (
  <AuthProvider>
    <OptionsProvider>
      <OwnedCollectionsProvider>
        <CardProvider>
          <WishlistsProvider>
            <Main />
          </WishlistsProvider>
        </CardProvider>
      </OwnedCollectionsProvider>
    </OptionsProvider>
  </AuthProvider>
);

export default App;
