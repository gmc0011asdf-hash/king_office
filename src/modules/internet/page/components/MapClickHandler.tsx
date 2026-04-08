import { useMapEvents } from 'react-leaflet';

interface MapClickHandlerProps {
  onLocationSelect: (lat: number, lng: number) => void;
}

export function MapClickHandler({ onLocationSelect }: MapClickHandlerProps) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}
