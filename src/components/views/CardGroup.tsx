import React, { useState, useEffect, useCallback } from "react";
import { Card, PokemonWithoutCard, PokemonFormWithoutCard } from "../../types/dashboard";
import { CardView } from "./CardView"
import { cardBack } from "../../utils/helpers";
import { useCardContext } from "../../context/CardContext";

interface CardGroupProps {
  cards: (Card | PokemonWithoutCard | PokemonFormWithoutCard)[];
  pokedexNumber?: number;
  groupName?: string;
  groupImage?: string;
}

const CardGroupComponent: React.FC<CardGroupProps> = ({ cards, pokedexNumber, groupName, groupImage }) => {
  const { pokemonGrouping, collectionFilter } = useCardContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pokemonName, setPokemonName] = useState<string>('');

  const isFormsMode = !!groupName;
  
  // Show empty groups when grouping, hide them only if specifically filtering by owned without grouping
  const hideEmptyGroups = !pokemonGrouping.enabled && pokemonGrouping.filterByCollection === 'owned';
  
  // Fetch Pokemon name from PokeAPI when we have a placeholder (only for pokedex mode)
  useEffect(() => {
    if (isFormsMode) return;
    const hasPlaceholder = cards.length === 1 && 'isPlaceholder' in cards[0];
    if (hasPlaceholder || (cards.length === 0 && pokedexNumber)) {
      const num = hasPlaceholder ? (cards[0] as PokemonWithoutCard).pokedexNumber : pokedexNumber;
      fetch(`https://pokeapi.co/api/v2/pokemon/${num}`)
        .then(res => res.json())
        .then(data => {
          const name = data.name.charAt(0).toUpperCase() + data.name.slice(1);
          setPokemonName(name);
        })
        .catch(() => setPokemonName(`#${num}`));
    }
  }, [cards, pokedexNumber, isFormsMode]);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  // Cerrar modal con Escape
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen]);

  // Create a dummy card for empty groups
  const createDummyCard = (pokedexNum: number): Card => ({
    ...cardBack,
    id: `dummy-${pokedexNum}`,
    name: `#${pokedexNum}`,
    nationalPokedexNumbers: [pokedexNum],
    image: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokedexNum}.png`,
    variant: 'Normal',
  });

  // Check if we have a placeholder
  const hasPlaceholder = cards.length === 1 && 'isPlaceholder' in cards[0];
  const isEmpty = cards.length === 0 || hasPlaceholder;

  // Resolve display name and image for the group
  const displayName = isFormsMode ? groupName : pokemonName;
  const emptyImage = isFormsMode && groupImage
    ? groupImage
    : pokedexNumber
      ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokedexNumber}.png`
      : '';
  
  // If we have a placeholder, use it to create dummy card for display
  const displayCards = hasPlaceholder && !isFormsMode
    ? [createDummyCard((cards[0] as PokemonWithoutCard).pokedexNumber)]
    : isEmpty && pokedexNumber && !isFormsMode
      ? [createDummyCard(pokedexNumber)] 
      : cards;
  
  const sortedCards = [...displayCards].sort((a, b) => {
    // Placeholders don't have shadow property
    if ('isPlaceholder' in a || 'isPlaceholder' in b) return 0;
    const cardA = a as Card;
    const cardB = b as Card;
    if (cardA.shadow && !cardB.shadow) return 1;
    if (!cardA.shadow && cardB.shadow) return -1;
    return 0;
  });

  const firstNonShadowedCard = sortedCards.find(card => {
    if ('isPlaceholder' in card) return false;
    return !(card as Card).shadow;
  }) as Card | undefined;

  // For empty/dummy cards, render a simplified version
  if (isEmpty && (pokedexNumber || isFormsMode)) {
    return (
      <>
        {!hideEmptyGroups && (
          <>
            <div className="card-group" onClick={handleOpenModal} tabIndex={0} role="button" aria-label={isFormsMode ? "Pokémon form sin cartas" : "Pokédex no poseído"}>
              <div className="card-group-empty">
                <div className="card-group-empty-card">
                  {/* Background card image */}
                  <img 
                    src="https://i.ebayimg.com/images/g/qhsAAeSwyUJolRHE/s-l225.jpg" 
                    alt="Card back"
                    className="card-group-empty-backdrop"
                  />
                  {/* Pokemon artwork overlay */}
                  <img 
                    src={isFormsMode ? emptyImage : (displayCards[0] as Card).image}
                    alt={isFormsMode ? groupName : `Pokédex #${pokedexNumber}`}
                    className="card-group-empty-artwork"
                    onError={(e) => {
                      (e.target as HTMLImageElement).classList.add('is-hidden');
                    }}
                  />
                </div>
                {(displayName || pokemonName) && (
                  <div className="card-group-empty-name">
                    {displayName || pokemonName}
                  </div>
                )}
              </div>
            </div>
            {isModalOpen && (
              <div className="modal" role="dialog" aria-modal="true" aria-label={isFormsMode ? "Pokémon form sin cartas" : "Pokédex no poseído"}>
                <div className="modal-content">
                  <button className="close" onClick={handleCloseModal} aria-label="Cerrar modal" type="button">
                    &times;
                  </button>
                  <h2>{isFormsMode ? groupName : `Pokédex #${pokedexNumber}`}</h2>
                    <div className="card-group-empty-modal-body">
                      <div className="card-group-empty-modal-card">
                      {/* Background card */}
                      <img 
                        src="https://i.ebayimg.com/images/g/qhsAAeSwyUJolRHE/s-l225.jpg" 
                        alt="Card back"
                          className="card-group-empty-modal-backdrop"
                      />
                      {/* Pokemon artwork */}
                      <img 
                        src={isFormsMode ? emptyImage : (displayCards[0] as Card).image}
                        alt={isFormsMode ? groupName : `Pokédex #${pokedexNumber}`}
                          className="card-group-empty-modal-artwork"
                        onError={(e) => {
                            (e.target as HTMLImageElement).classList.add('is-hidden');
                        }}
                      />
                    </div>
                      <p className="card-group-empty-message">{isFormsMode ? 'No tienes cartas de este Pokémon Form' : 'No tienes cartas de este Pokédex'}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <>
      {!(isEmpty && hideEmptyGroups) && (
        <>
          <div className="card-group" onClick={handleOpenModal} tabIndex={0} role="button" aria-label="Abrir grupo de cartas">
            {!isEmpty && (cards.length > 0) && <CardView card={(firstNonShadowedCard || sortedCards[0]) as Card} key="group-preview" />}
            <div className="length">
              {isEmpty ? '0' : cards.filter(c => !('isPlaceholder' in c)).length}
              {!isEmpty && collectionFilter.enabled && (() => {
                const realCards = cards.filter(c => !('isPlaceholder' in c)) as Card[];
                const nonShadowCount = realCards.filter(c => !c.shadow).length;
                return nonShadowCount !== realCards.length ? (
                  <span className="length-owned"> ({nonShadowCount})</span>
                ) : null;
              })()}
            </div>
          </div>
          {isModalOpen && (
            <div className="modal" role="dialog" aria-modal="true" aria-label="Grupo de cartas">
              <div className="modal-content">
                <button className="close" onClick={handleCloseModal} aria-label="Cerrar modal" type="button">
                  &times;
                </button>
                <h2>{isFormsMode ? groupName : 'Lista de cartas'}</h2>
                <ul className="card-group-modal">
                  {!isEmpty && sortedCards.filter(card => !('isPlaceholder' in card)).map((card, index) => (
                    <CardView card={card as Card} key={`${card.id}-${index}`} />
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
};

export const CardGroup = React.memo(CardGroupComponent);
