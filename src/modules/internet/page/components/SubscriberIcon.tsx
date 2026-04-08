import L from 'leaflet';
import { getZoneColor } from './mapUtils';

export function createSubscriberIcon(status: string, zoneId: number) {
  const zoneColor = getZoneColor(zoneId);
  // Use black for expired, emerald for active
  const statusColor = status === 'منتهي' ? '#000000' : '#10b981';
  const fillColor = status === 'منتهي' ? '#000000' : zoneColor;
  return L.divIcon({
    className: 'custom-sub-icon',
    html: `
      <div style="
        background-color: ${fillColor};
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 3px solid ${statusColor};
        box-shadow: 0 2px 6px rgba(0,0,0,0.5);
        transform: translate(-50%, -50%);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="width: 8px; height: 8px; border-radius: 50%; background-color: white;"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}
