import { useState, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { Navigation, Layers } from 'lucide-react';
import L from 'leaflet';

export function MapControls() {
  const map = useMap();
  const [isSatellite, setIsSatellite] = useState(false);
  const satelliteLayerRef = useRef<L.TileLayer | null>(null);

  const toggleSatellite = () => {
    if (!isSatellite) {
      const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
      });
      satelliteLayer.addTo(map);
      satelliteLayerRef.current = satelliteLayer;
    } else {
      if (satelliteLayerRef.current) {
        map.removeLayer(satelliteLayerRef.current);
        satelliteLayerRef.current = null;
      }
    }
    setIsSatellite(!isSatellite);
  };

  const locateUser = () => {
    map.locate({ setView: true, maxZoom: 16 });
  };

  return (
    <div className="leaflet-top leaflet-left" style={{ marginTop: '80px' }}>
      <div className="leaflet-control leaflet-bar shadow-md border-none flex flex-col gap-1 bg-transparent">
        <button 
          onClick={(e) => { e.preventDefault(); locateUser(); }} 
          title="موقعي الحالي"
          className="flex items-center justify-center w-[34px] h-[34px] bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors rounded-md border border-slate-200 dark:border-slate-600"
        >
          <Navigation size={18} />
        </button>
        <button 
          onClick={(e) => { e.preventDefault(); toggleSatellite(); }} 
          title={isSatellite ? "عرض الخريطة" : "عرض الستلايت"}
          className={`flex items-center justify-center w-[34px] h-[34px] transition-colors rounded-md border border-slate-200 dark:border-slate-600 ${isSatellite ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
        >
          <Layers size={18} />
        </button>
      </div>
    </div>
  );
}
