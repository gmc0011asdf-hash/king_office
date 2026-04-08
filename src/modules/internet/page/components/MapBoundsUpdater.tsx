import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { parseCoordinates } from './mapUtils';

interface MapBoundsUpdaterProps {
  items: any[];
  coordKey?: string;
}

export function MapBoundsUpdater({ items, coordKey = 'coordinates' }: MapBoundsUpdaterProps) {
  const map = useMap();
  
  useEffect(() => {
    if (items.length === 0) return;
    
    const bounds = L.latLngBounds([]);
    let hasValidCoords = false;
    
    items.forEach(item => {
      const coords = parseCoordinates(item[coordKey]);
      if (coords) {
        bounds.extend(coords);
        hasValidCoords = true;
      }
    });
    
    if (hasValidCoords) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [items, map, coordKey]);
  
  return null;
}
