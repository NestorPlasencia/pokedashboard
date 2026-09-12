import { WishlistsProvider } from "./context/WishlistsContext";
import React from "react";
import { Main } from "./components/Main";
import { CardProvider } from "./context/CardContext";
import { OptionsProvider } from "./context/OptionsContext";
import { AuthProvider } from "./context/AuthContext";
import { OwnedCollectionsProvider } from "./context/OwnedCollectionsContext";
import { PublicCollectionPage } from "./components/pages/PublicCollectionPage";
import { publicCollectionId } from "./utils/route";

const App: React.FC = () => {
  // A shared collection is read through the anonymous RPC and shows the same thing to
  // everyone, so it renders on its own. Mounting the signed-in tree for it would start a
  // full inventory load - and ask for a session - for a page that needs neither.
  const sharedCollectionId = publicCollectionId();
  if (sharedCollectionId) return <PublicCollectionPage collectionId={sharedCollectionId} />;

  return (
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
};

export default App;
