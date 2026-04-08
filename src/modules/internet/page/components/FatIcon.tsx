import L from 'leaflet';
import { getZoneColor } from './mapUtils';

export function createFatIcon(fatName: string, zoneName: string, zoneId: number) {
  const color = getZoneColor(zoneId);
  return L.divIcon({
    className: 'custom-fat-icon',
    html: `
      <div style="
        background-color: ${color};
        color: white;
        padding: 6px 12px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 900;
        white-space: nowrap;
        border: 2px solid white;
        box-shadow: 0 4px 8px rgba(0,0,0,0.4);
        transform: translate(-50%, -100%);
        display: flex;
        flex-direction: column;
        align-items: center;
      ">
        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 2px;">${zoneName}</div>
        <div>${fatName}</div>
        <div style="
          position: absolute;
          bottom: -8px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-top: 8px solid ${color};
        "></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}
