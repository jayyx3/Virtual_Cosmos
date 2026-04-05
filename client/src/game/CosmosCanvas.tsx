import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import type { CosmosUser, Position, WorldConfig } from "../types";
import { WORLD_ZONES } from "./worldTheme";

type Props = {
  self: CosmosUser | null;
  users: Record<string, CosmosUser>;
  connectedUserIds: string[];
  world: WorldConfig;
  onMove: (position: Position) => void;
  zoom?: number;
};

const SPEED = 4;

type AvatarParts = {
  container: Container;
  label: Text;
  shadow: Graphics;
  body: Graphics;
  head: Graphics;
};

type AmbientOrb = {
  x: number;
  y: number;
  radius: number;
  speed: number;
  offset: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const safe = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(safe, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function rgbToPixiHex(r: number, g: number, b: number): number {
  return ((clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255)) >>> 0;
}

function shade(hex: string, multiplier: number): number {
  const base = hexToRgb(hex);
  return rgbToPixiHex(base.r * multiplier, base.g * multiplier, base.b * multiplier);
}

export function CosmosCanvas({ self, users, connectedUserIds, world, onMove, zoom = 1 }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const usersRef = useRef(users);
  const connectedUserIdsRef = useRef(connectedUserIds);
  const onMoveRef = useRef(onMove);
  const zoomRef = useRef(zoom);
  const selfUserId = self?.userId ?? null;

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    connectedUserIdsRef.current = connectedUserIds;
  }, [connectedUserIds]);

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (!mountRef.current || !selfUserId) return;
    const currentSelfUserId = selfUserId;
    const app = new Application();
    let mounted = true;
    let initialized = false;
    let canvasElement: HTMLCanvasElement | null = null;

    const pressed = new Set<string>();
    const avatarMap = new Map<string, AvatarParts>();
    const localSelfPosition: Position = {
      x: usersRef.current[currentSelfUserId]?.position.x ?? self?.position.x ?? world.width / 2,
      y: usersRef.current[currentSelfUserId]?.position.y ?? self?.position.y ?? world.height / 2
    };

    async function boot() {
      await app.init({
        resizeTo: mountRef.current ?? undefined,
        antialias: false,
        background: "#0b1124"
      });

      initialized = true;

      if (!mounted || !mountRef.current) return;
      canvasElement = app.canvas;
      mountRef.current.appendChild(canvasElement);

      const worldContainer = new Container();
      app.stage.addChild(worldContainer);

      const bg = new Graphics();
      bg.rect(0, 0, world.width, world.height).fill(0x0b1124);
      worldContainer.addChild(bg);

      const upperBand = new Graphics();
      upperBand.rect(0, 0, world.width, world.height * 0.5).fill({ color: 0x152646, alpha: 0.44 });
      worldContainer.addChild(upperBand);

      const tileLayer = new Graphics();
      const tileSize = 48;
      for (let x = 0; x < world.width; x += tileSize) {
        for (let y = 0; y < world.height; y += tileSize) {
          const parity = ((x / tileSize + y / tileSize) % 2) === 0;
          tileLayer
            .rect(x, y, tileSize - 1, tileSize - 1)
            .fill({ color: parity ? 0x12203b : 0x0f1a31, alpha: 0.54 });
        }
      }
      worldContainer.addChild(tileLayer);

      const zoneLayer = new Container();
      worldContainer.addChild(zoneLayer);

      for (const zone of WORLD_ZONES) {
        const zoneSurface = new Graphics();
        zoneSurface.roundRect(zone.x, zone.y, zone.width, zone.height, 20).fill({ color: zone.color, alpha: 0.55 });
        zoneSurface.roundRect(zone.x, zone.y, zone.width, zone.height, 20).stroke({ color: zone.accent, alpha: 0.5, width: 3 });
        zoneLayer.addChild(zoneSurface);

        const stripe = new Graphics();
        for (let i = 0; i < zone.width; i += 26) {
          stripe
            .moveTo(zone.x + i, zone.y)
            .lineTo(zone.x + i - 42, zone.y + zone.height)
            .stroke({ color: zone.accent, alpha: 0.08, width: 2 });
        }
        zoneLayer.addChild(stripe);

        const tag = new Graphics();
        tag.roundRect(zone.x + 12, zone.y + 10, 170, 32, 9).fill({ color: 0x040814, alpha: 0.45 });
        zoneLayer.addChild(tag);

        const text = new Text({
          text: zone.name.toUpperCase(),
          style: {
            fill: "#deedff",
            fontFamily: "Sora, Segoe UI",
            fontWeight: "700",
            fontSize: 12,
            letterSpacing: 0.4
          }
        });
        text.x = zone.x + 22;
        text.y = zone.y + 18;
        zoneLayer.addChild(text);
      }

      const decorLayer = new Graphics();
      for (let x = 120; x < world.width; x += 300) {
        decorLayer.roundRect(x, world.height - 180, 128, 90, 12).fill({ color: 0x192640, alpha: 0.38 });
      }
      for (let y = 160; y < world.height; y += 280) {
        decorLayer.roundRect(world.width - 260, y, 180, 60, 10).fill({ color: 0x2c1f3f, alpha: 0.34 });
      }
      worldContainer.addChild(decorLayer);

      const ambientLayer = new Graphics();
      worldContainer.addChild(ambientLayer);

      const ambientOrbs: AmbientOrb[] = Array.from({ length: 44 }, (_, idx) => ({
        x: Math.random() * world.width,
        y: Math.random() * world.height,
        radius: 1.8 + Math.random() * 2.6,
        speed: 0.008 + Math.random() * 0.03,
        offset: idx * 0.31
      }));

      function ensureAvatar(user: CosmosUser): void {
        if (avatarMap.has(user.userId)) return;

        const container = new Container();
        container.x = user.position.x;
        container.y = user.position.y;

        const shadow = new Graphics();
        shadow.ellipse(0, 20, user.userId === selfUserId ? 18 : 15, 7).fill({ color: 0x02060d, alpha: 0.42 });

        const body = new Graphics();
        body.roundRect(-13, -6, 26, 24, 9).fill(shade(user.avatarColor, 0.72));
        body.roundRect(-13, -6, 26, 24, 9).stroke({ color: shade(user.avatarColor, 1.08), alpha: 0.75, width: 1.5 });

        const head = new Graphics();
        head.circle(0, -18, user.userId === selfUserId ? 12 : 10).fill(shade(user.avatarColor, 1.2));

        const eyeLeft = new Graphics();
        eyeLeft.circle(-4, -19, 1.4).fill(0x080f1d);
        const eyeRight = new Graphics();
        eyeRight.circle(4, -19, 1.4).fill(0x080f1d);

        const labelBg = new Graphics();
        labelBg.roundRect(-46, 28, 92, 19, 8).fill({ color: 0x000000, alpha: 0.4 });

        const label = new Text({
          text: user.name,
          style: {
            fill: "#f7fbff",
            fontSize: 11,
            fontFamily: "Sora, Segoe UI",
            fontWeight: user.userId === selfUserId ? "700" : "600"
          }
        });
        label.anchor.set(0.5, 0);
        label.y = 30;

        container.addChild(shadow);
        container.addChild(body);
        container.addChild(head);
        container.addChild(eyeLeft);
        container.addChild(eyeRight);
        container.addChild(labelBg);
        container.addChild(label);

        worldContainer.addChild(container);
        avatarMap.set(user.userId, { container, label, shadow, body, head });
      }

      function removeAvatar(userId: string): void {
        const avatar = avatarMap.get(userId);
        if (!avatar) return;
        worldContainer.removeChild(avatar.container);
        avatarMap.delete(userId);
      }

      function syncAvatars(): void {
        const visibleUsers = Object.values(usersRef.current);
        const visibleSet = new Set(visibleUsers.map((u) => u.userId));

        for (const user of visibleUsers) {
          ensureAvatar(user);
          const avatar = avatarMap.get(user.userId);
          if (!avatar) continue;
          const x = user.userId === currentSelfUserId ? localSelfPosition.x : user.position.x;
          const y = user.userId === currentSelfUserId ? localSelfPosition.y : user.position.y;
          avatar.container.x = x;
          avatar.container.y = y;
          avatar.label.text = user.name;
        }

        for (const existingId of [...avatarMap.keys()]) {
          if (!visibleSet.has(existingId)) {
            removeAvatar(existingId);
          }
        }

        const me = usersRef.current[currentSelfUserId];
        if (me) {
          const currentZoom = zoomRef.current;
          const viewportWidth = app.renderer.width;
          const viewportHeight = app.renderer.height;
          worldContainer.scale.set(currentZoom);
          const scaledWorldWidth = world.width * currentZoom;
          const scaledWorldHeight = world.height * currentZoom;
          worldContainer.x = Math.min(
            0,
            Math.max(viewportWidth - scaledWorldWidth, viewportWidth / 2 - localSelfPosition.x * currentZoom)
          );
          worldContainer.y = Math.min(
            0,
            Math.max(viewportHeight - scaledWorldHeight, viewportHeight / 2 - localSelfPosition.y * currentZoom)
          );
        }
      }

      const proximityLayer = new Graphics();
      worldContainer.addChild(proximityLayer);

      const connectionLayer = new Graphics();
      worldContainer.addChild(connectionLayer);

      const pulseLayer = new Graphics();
      worldContainer.addChild(pulseLayer);

      let tick = 0;
      let ambientTickGate = 0;

      app.ticker.add(() => {
        const me = usersRef.current[currentSelfUserId];
        if (!me) return;

        let dx = 0;
        let dy = 0;

        if (pressed.has("w") || pressed.has("arrowup")) dy -= SPEED;
        if (pressed.has("s") || pressed.has("arrowdown")) dy += SPEED;
        if (pressed.has("a") || pressed.has("arrowleft")) dx -= SPEED;
        if (pressed.has("d") || pressed.has("arrowright")) dx += SPEED;

        if (dx !== 0 || dy !== 0) {
          localSelfPosition.x = clamp(localSelfPosition.x + dx, 0, world.width);
          localSelfPosition.y = clamp(localSelfPosition.y + dy, 0, world.height);
          onMoveRef.current({ x: localSelfPosition.x, y: localSelfPosition.y });
        } else {
          const reconcile = 0.22;
          localSelfPosition.x += (me.position.x - localSelfPosition.x) * reconcile;
          localSelfPosition.y += (me.position.y - localSelfPosition.y) * reconcile;
        }

        proximityLayer.clear();
        proximityLayer.circle(localSelfPosition.x, localSelfPosition.y, world.proximityRadius).stroke({
          color: 0x9be7ff,
          alpha: 0.34,
          width: 2
        });

        tick += 0.032;

        pulseLayer.clear();
        pulseLayer
          .circle(localSelfPosition.x, localSelfPosition.y, 28 + Math.sin(tick) * 5)
          .stroke({ color: 0xf4fbff, alpha: 0.5, width: 2.4 });

        connectionLayer.clear();
        for (const userId of connectedUserIdsRef.current) {
          const peer = usersRef.current[userId];
          if (!peer) continue;
          connectionLayer
            .moveTo(localSelfPosition.x, localSelfPosition.y)
            .lineTo(peer.position.x, peer.position.y)
            .stroke({ color: 0x56ffe0, alpha: 0.72, width: 2.4 });
        }

        ambientTickGate += 1;
        if (ambientTickGate % 2 === 0) {
          ambientLayer.clear();
          for (const orb of ambientOrbs) {
            const wave = Math.sin(tick * (orb.speed * 60) + orb.offset);
            const x = orb.x + wave * 26;
            const y = orb.y + Math.cos(tick * (orb.speed * 48) + orb.offset) * 24;
            ambientLayer.circle(x, y, orb.radius).fill({ color: 0xb7d9ff, alpha: 0.08 + (wave + 1) * 0.05 });
          }
        }

        syncAvatars();
      });
    }

    function onKeyDown(event: KeyboardEvent): void {
      pressed.add(event.key.toLowerCase());
    }

    function onKeyUp(event: KeyboardEvent): void {
      pressed.delete(event.key.toLowerCase());
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    boot().catch((error) => {
      console.error("[pixi] boot failed", error);
    });

    return () => {
      mounted = false;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);

      if (canvasElement?.parentElement) {
        canvasElement.parentElement.removeChild(canvasElement);
      }

      if (initialized) {
        try {
          app.destroy();
        } catch (error) {
          console.error("[pixi] cleanup failed", error);
        }
      }
    };
  }, [selfUserId, world.height, world.proximityRadius, world.width]);

  return <div className="cosmos-canvas" ref={mountRef} />;
}
