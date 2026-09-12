import { DEPENDS, LIMITS } from "../constants/constants";
import { Card } from "../types/dashboard";
import { getCollectionTotalQuantity } from "./utils";

export const IO_IMAGES_BASE_URL =
  "https://pokemoncardimages.s3.us-east-2.amazonaws.com/images";

export const getValueFromArrayEquivalent = <T, K extends keyof T>(
  arr: T[],
  propToFind: K,
  value: string,
  propToReturn: K
): T[K] | null => {
  const register = arr.find((reg) => reg[propToFind] === value);
  return register ? register[propToReturn] : null;
};

export const searchErrorsInCollections = (cardsWithCollection: Card[]) => {
  const depends = Object.keys(DEPENDS);
  cardsWithCollection.forEach((card) => {
    const collections = card.collections;
    if (collections) {
      for (const collection of collections) {
        const limit = LIMITS[collection.name];
        const totalQty = getCollectionTotalQuantity(collection);
        if (limit !== undefined && totalQty > limit) {
          // console.log(
          //   `Collection: ${collection.name}, Card: ${card.name} Quantity: ${totalQty}, Limit: ${limit} `
          // );
        }
        if (depends.includes(collection.name)) {
          const dependItem = DEPENDS[collection.name];
          const cardSetNames =
            card.setNames && card.setNames.length > 0
              ? card.setNames
              : [card.setName];
          if (
            dependItem.setIncludes &&
            !cardSetNames.some((setName) => dependItem.setIncludes!.includes(setName))
          ) {
            break;
          }
          // if (dependCollection) {
          //   if (dependCollection.quantity < LIMITS[dependItem.depends]) {
          //     console.log("Dependency not covered");
          //     console.log(card);
          //     console.log(dependItem);
          //   }
          // } else {
          //   console.log("Dependency Not found");
          //   console.log(card);
          //   console.log(dependItem);
          // }
        }
      }
    }
  });
};

export const cardBack: Card = {
  id: "",
  name: "",
  types: [],
  number: "",
  artist: "",
  rarity: "",
  nationalPokedexNumbers: [],
  supertype: "",
  subtypes: [],
  image: "",
  prices: {
    "Near Mint": 0,
    "Lightly Played": 0,
    "Moderately Played": 0,
    "Heavily Played": 0,
    "Damaged": 0,
  },
  setName: "",
  setSeries: "",
  cardType: "",
  collections: [],
  shadow: false,
  setId: "",
  setNames: [],
  variant: "Normal",
};
