import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import {
  PublicCollectionNotFound,
  loadPublicCollection,
  type PublicCollection,
} from "../../services/publicCollection";
import { pathForPublicCollection } from "../../utils/route";

/**
 * A collection someone shared, read without a session.
 *
 * Rendered outside every provider: nothing here depends on who is looking, and mounting
 * the signed-in tree would start a full inventory load for a page that never reads it.
 * The RPC returns only shareable fields, so there is nothing to strip on the way in.
 */

type Status =
  | { kind: "loading" }
  | { kind: "ready"; collection: PublicCollection }
  | { kind: "missing" }
  | { kind: "error"; message: string };

const cardKey = (card: PublicCollection["cards"][number], index: number) =>
  `${card.product_id}-${card.printing ?? ""}-${card.condition ?? ""}-${card.language ?? ""}-${index}`;

export const PublicCollectionPage = ({ collectionId }: { collectionId: string }) => {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });
    loadPublicCollection(collectionId)
      .then((collection) => {
        if (!cancelled) setStatus({ kind: "ready", collection });
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof PublicCollectionNotFound) {
          setStatus({ kind: "missing" });
          return;
        }
        console.error("[public] Unable to read the shared collection", error);
        setStatus({ kind: "error", message: "This collection could not be loaded right now." });
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  if (status.kind === "loading") {
    return (
      <div className="public-collection">
        <p className="public-collection__notice" role="status">Loading the shared collection…</p>
      </div>
    );
  }

  if (status.kind === "missing") {
    return (
      <div className="public-collection">
        <div className="public-collection__empty">
          <Lock size={22} aria-hidden="true" />
          <h1>This collection is not available</h1>
          {/* A private collection and one that never existed give the same answer, so a
              shared id cannot be used to probe for which collections exist. */}
          <p>The link may be wrong, or its owner may have stopped sharing it.</p>
        </div>
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div className="public-collection">
        <p className="public-collection__notice public-collection__notice--error" role="alert">
          {status.message}
        </p>
      </div>
    );
  }

  const { collection } = status;
  const totalCopies = collection.cards.reduce((sum, card) => sum + card.quantity, 0);

  return (
    <div className="public-collection">
      <header className="public-collection__header">
        <h1>{collection.name}</h1>
        <p className="public-collection__meta">
          <span>{collection.cards.length === 1 ? "1 card" : `${collection.cards.length.toLocaleString()} cards`}</span>
          {totalCopies > collection.cards.length && (
            <span>{totalCopies.toLocaleString()} copies</span>
          )}
          {collection.printings.map((printing) => (
            <span key={printing} className="collection-printing-tag">{printing}</span>
          ))}
        </p>
      </header>

      {collection.subcollections.length > 0 && (
        <nav className="public-collection__subcollections" aria-label="Shared subcollections">
          {/* Publishing a collection does not publish its children, so only the ones
              shared in their own right are listed here. */}
          {collection.subcollections.map((subcollection) => (
            <a key={subcollection.id} href={pathForPublicCollection(subcollection.id)}>
              {subcollection.name}
            </a>
          ))}
        </nav>
      )}

      {collection.cards.length === 0 ? (
        <p className="public-collection__notice">This collection has no cards yet.</p>
      ) : (
        <ul className="public-collection__cards">
          {collection.cards.map((card, index) => (
            <li key={cardKey(card, index)} className="public-collection__card">
              {card.image_url
                ? <img loading="lazy" src={card.image_url} alt={card.name} />
                : <div className="public-collection__card-placeholder" aria-hidden="true" />}
              <div className="public-collection__card-info">
                <strong>{card.name}</strong>
                <span>
                  {[card.set_name, card.number && `#${card.number}`, card.rarity]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span>
                  {[card.printing, card.condition, card.language].filter(Boolean).join(" · ")}
                </span>
              </div>
              {card.quantity > 1 && (
                <span className="public-collection__quantity" aria-label={`${card.quantity} copies`}>
                  {card.quantity}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
