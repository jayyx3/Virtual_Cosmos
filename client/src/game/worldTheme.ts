import type { Position } from "../types";

export type WorldZone = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
  accent: number;
};

export const WORLD_ZONES: WorldZone[] = [
  {
    id: "blue-dock",
    name: "Blue Dock",
    x: 80,
    y: 80,
    width: 620,
    height: 420,
    color: 0x16406d,
    accent: 0x4cc2ff
  },
  {
    id: "green-commons",
    name: "Green Commons",
    x: 820,
    y: 250,
    width: 540,
    height: 500,
    color: 0x315b39,
    accent: 0x75e29a
  },
  {
    id: "terra-stage",
    name: "Terra Stage",
    x: 1500,
    y: 100,
    width: 560,
    height: 460,
    color: 0x684126,
    accent: 0xffc18a
  },
  {
    id: "north-grid",
    name: "North Grid",
    x: 1560,
    y: 720,
    width: 430,
    height: 300,
    color: 0x513768,
    accent: 0xddb4ff
  }
];

export function getZoneForPosition(position: Position): WorldZone | null {
  for (const zone of WORLD_ZONES) {
    const insideX = position.x >= zone.x && position.x <= zone.x + zone.width;
    const insideY = position.y >= zone.y && position.y <= zone.y + zone.height;
    if (insideX && insideY) return zone;
  }

  return null;
}
