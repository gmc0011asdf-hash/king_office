import { ZONE_COLORS } from './constants';

export function parseCoordinates(coordStr: string): [number, number] | null {
  if (!coordStr) return null;
  
  // Try simple comma separated decimals first
  if (coordStr.includes(',')) {
    const parts = coordStr.split(',');
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lng)) {
      return [lat, lng];
    }
  }

  // Try parsing DMS format like 32°28'02.2"N 46°41'22.5"E
  const dmsRegex = /(\d+)\s*°\s*(\d+)\s*'\s*([\d.]+)\s*"\s*([NS])\s+(\d+)\s*°\s*(\d+)\s*'\s*([\d.]+)\s*"\s*([EW])/i;
  const match = coordStr.match(dmsRegex);
  
  if (match) {
    const latDeg = parseInt(match[1]);
    const latMin = parseInt(match[2]);
    const latSec = parseFloat(match[3]);
    const latDir = match[4].toUpperCase();
    
    const lngDeg = parseInt(match[5]);
    const lngMin = parseInt(match[6]);
    const lngSec = parseFloat(match[7]);
    const lngDir = match[8].toUpperCase();
    
    let lat = latDeg + (latMin / 60) + (latSec / 3600);
    if (latDir === 'S') lat = -lat;
    
    let lng = lngDeg + (lngMin / 60) + (lngSec / 3600);
    if (lngDir === 'W') lng = -lng;
    
    return [lat, lng];
  }
  
  // Try parsing decimal with N/E like 32.467278N 46.689583E
  const decRegex = /([\d.]+)([NS])\s+([\d.]+)([EW])/i;
  const matchDec = coordStr.match(decRegex);
  if (matchDec) {
    let lat = parseFloat(matchDec[1]);
    if (matchDec[2].toUpperCase() === 'S') lat = -lat;
    let lng = parseFloat(matchDec[3]);
    if (matchDec[4].toUpperCase() === 'W') lng = -lng;
    return [lat, lng];
  }

  return null;
}

export function getZoneColor(zoneId: number): string {
  return ZONE_COLORS[zoneId % ZONE_COLORS.length];
}
