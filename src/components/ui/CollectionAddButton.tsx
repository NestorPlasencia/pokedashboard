import { PencilOff, Plus } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useOwnedCollections } from "../../context/OwnedCollectionsContext";
import { useWishlists } from "../../context/WishlistsContext";
import { useCardContext } from "../../context/CardContext";
import type { OptionsCollection } from "../../types/dashboard";
import { navigate, openCardsView } from "../../utils/route";
import { CATALOG_VIEW } from "../../utils/viewMode";

export function CollectionAddButton({ collection }: { collection: OptionsCollection }) {
  const owned = useOwnedCollections();
  const wishlists = useWishlists();
  const { session, isAuthLoading } = useAuth();
  const { setViewMode } = useCardContext();
  const canAddOwned = Boolean(collection.id) && owned.collections.some(candidate => candidate.id === collection.id);
  const canAddWishlist = Boolean(collection.id) && collection.editable && !wishlists.groupIds.has(collection.id) && wishlists.wishlists.some(wishlist =>
    wishlist.subcollections.some(subcollection => subcollection.id === collection.id)
  );
  const canAdd = canAddOwned || canAddWishlist;
  const isAdding = canAddOwned
    ? owned.selectedId === collection.id
    : canAddWishlist && wishlists.armedSubId === collection.id;
  const action = `${isAdding ? "Stop adding cards to" : "Add cards to"} ${collection.name}`;
  const title = !collection.editable
    ? "Las cartas de esta colección se añaden desde Collectr"
    : collection.kind === "wishlist" && !canAddWishlist
      ? "Elige una subcolección de la wishlist para añadir cartas"
      : action;

  return (
    <button
      type="button"
      className={`collections-add-btn${isAdding ? " is-armed" : ""}`}
      title={title}
      aria-label={action}
      aria-pressed={isAdding}
      disabled={!canAdd || isAuthLoading}
      onClick={() => {
        if (!session) {
          navigate("collections");
          return;
        }
        if (canAddOwned) owned.setSelectedId(isAdding ? "" : collection.id);
        else if (canAddWishlist) wishlists.setArmedSubId(isAdding ? "" : collection.id);
        if (!isAdding) {
          setViewMode(CATALOG_VIEW);
          openCardsView();
        }
      }}
    >
      {isAdding ? <PencilOff size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
    </button>
  );
}
