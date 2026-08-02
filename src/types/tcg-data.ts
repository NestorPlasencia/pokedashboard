export interface SetTcgData {
  id: string;
  name: string;
  series: string;
  printedTotal: number;
  total: number;
  legalities: Legalities;
  ptcgoCode: string;
  releaseDate: string;
  updatedAt: string;
  images: SetImages;
}

interface SetImages {
  symbol: string;
  logo: string;
}

export interface CardTcgData {
  id: string;
  name: string;
  supertype: string;
  subtypes: string[];
  types: string[];
  number: string;
  artist: string;
  rarity: string;
  flavorText?: string;
  nationalPokedexNumbers: number[];
  images: CardImages;
  legalities?: Legalities;
  evolvesFrom?: string;
  abilities?: Ability[];
  attacks?: Attack[];
  weaknesses?: Weakness[];
  retreatCost?: string[];
  convertedRetreatCost?: number;
  level?: string;
  hp?: string;
  regulationMark?: string;
}



interface Ability {
  name: string;
  text: string;
  type: string;
}

interface Attack {
  name: string;
  cost: string[];
  convertedEnergyCost: number;
  damage: string;
  text: string;
}

interface Weakness {
  type: string;
  value: string;
}

interface CardImages {
  small: string;
  large: string;
}

interface Legalities {
  unlimited: string;
}
