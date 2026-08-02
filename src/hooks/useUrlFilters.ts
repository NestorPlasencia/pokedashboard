import { useEffect } from 'react';
import { useCardContext } from '../context/CardContext';
import { parseUrlParams } from '../utils/urlParams';

/**
 * Mapea nombres de orden a configuración de ordenamiento
 * Esta función debe estar sincronizada con Orders.tsx
 */
const orderToSortConfig = (order: string) => {
  switch (order) {
    case "Number":
      return { field: 'number' as const, direction: 'asc' as const };
    case "Set and Number":
      return { field: 'setAndNumber' as const, direction: 'asc' as const };
    case "Pokedex":
      return { field: 'pokedex' as const, direction: 'asc' as const };
    case "Energy":
      return { field: 'energy' as const, direction: 'asc' as const };
    case "Rarities":
      return { field: 'rarity' as const, direction: 'asc' as const };
    case "Energy and Name":
      return { field: 'energyAndName' as const, direction: 'asc' as const };
    case "Energy and Pokedex":
      return { field: 'energyAndPokedex' as const, direction: 'asc' as const };
    case "Price ↑":
      return { field: 'price' as const, direction: 'asc' as const };
    case "Price ↓":
      return { field: 'price' as const, direction: 'desc' as const };
    default:
      return { field: 'number' as const, direction: 'asc' as const };
  }
};

/**
 * Hook para sincronizar filtros con parámetros de URL
 * Inicializa los filtros desde la URL al montar
 */
export const useUrlFilters = () => {
  const cardContext = useCardContext();

  // Inicializar filtros desde URL al montar
  useEffect(() => {
    const filters = parseUrlParams();
    
    // Aplicar filtros de variantes
    if (filters.variants && filters.variants.length > 0 && !(filters.variants.length === 1 && filters.variants[0] === 'All')) {
      cardContext.setVariantsFilter(filters.variants);
    }
    
    // Aplicar filtros de condición a collectionFilter
    if (filters.conditions && filters.conditions.length > 0 && !(filters.conditions.length === 1 && filters.conditions[0] === 'All')) {
      cardContext.setCollectionFilter(prev => ({
        ...prev,
        conditionsFilter: filters.conditions!
      }));
    }
    
    // Aplicar filtros de región de Pokédex
    if (filters.pokedexRegion && filters.pokedexRegion.length > 0 && !(filters.pokedexRegion.length === 1 && filters.pokedexRegion[0] === 'All')) {
      cardContext.setPokemonGrouping(prev => ({
        ...prev,
        regionsFilter: filters.pokedexRegion!
      }));
    }
    
    // Aplicar colecciones si existen
    if (filters.collections && filters.collections.length > 0) {
      cardContext.setCollectionFilter(prev => ({
        ...prev,
        selectedCollections: filters.collections!
      }));
    }

    // Aplicar filtros de precio
    if (filters.priceMin) {
      const priceMinNum = Number(filters.priceMin);
      cardContext.setPriceRange(prev => ({ ...prev, min: priceMinNum }));
    }
    if (filters.priceMax) {
      const priceMaxNum = Number(filters.priceMax);
      cardContext.setPriceRange(prev => ({ ...prev, max: priceMaxNum }));
    }

    // Aplicar ordenamiento desde URL
    if (filters.order && filters.order !== 'None') {
      const sortConfig = orderToSortConfig(filters.order);
      cardContext.setSortConfig(sortConfig);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - intentionally only run on mount
};
