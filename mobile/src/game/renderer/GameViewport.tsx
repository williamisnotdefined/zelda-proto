import {
  Canvas,
  Circle,
  Fill,
  Group,
  Image as SkiaImage,
  Line,
  Rect,
  useImage,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useMobileGameStore } from '../../store/gameStore';
import {
  getBossAnimationFrame,
  getEnemyAnimationFrame,
  getPlayerAnimationFrame,
} from '../animation/frames';
import {
  blobSpriteSheet,
  decorTileSheet,
  dragonSpriteSheet,
  franklySpriteSheet,
  gelehkSpriteSheet,
  getBossAsset,
  getDropAsset,
  getEnemyAsset,
  getHazardPalette,
  getInstanceTheme,
  getPortalPalette,
  handSpriteSheet,
  heartLargeSprite,
  heartSmallSprite,
  playerSpriteSheet,
  plainsTileSheet,
  silverbackSpriteSheet,
  slimMaioliSpriteSheet,
  slimeSpriteSheet,
} from '../assets/catalog';
import { getChunkDecor } from '../render/worldDecor';

const TILE_WORLD_SIZE = 32;
const TILE_SPRITE_SIZE = 16;
const DEFAULT_VIEWPORT_WIDTH = 352;
const DEFAULT_VIEWPORT_HEIGHT = 264;

interface Props {
  fullscreen?: boolean;
}

export function GameViewport({ fullscreen = false }: Props) {
  const [viewportSize, setViewportSize] = useState({
    width: DEFAULT_VIEWPORT_WIDTH,
    height: DEFAULT_VIEWPORT_HEIGHT,
  });
  const renderPlayers = useMobileGameStore((state) => state.renderPlayers);
  const enemies = useMobileGameStore((state) => state.enemies);
  const bosses = useMobileGameStore((state) => state.bosses);
  const drops = useMobileGameStore((state) => state.drops);
  const portals = useMobileGameStore((state) => state.portals);
  const hazards = useMobileGameStore((state) => state.hazards);
  const iceZones = useMobileGameStore((state) => state.iceZones);
  const aoeIndicators = useMobileGameStore((state) => state.aoeIndicators);
  const safeZoneFx = useMobileGameStore((state) => state.safeZoneFx);
  const mapWidth = useMobileGameStore((state) => state.mapWidth);
  const mapHeight = useMobileGameStore((state) => state.mapHeight);
  const currentInstanceId = useMobileGameStore((state) => state.currentInstanceId);
  const predictedLocalPlayer = useMobileGameStore((state) => state.predictedLocalPlayer);

  const playerSheet = useImage(playerSpriteSheet);
  const plainsSheet = useImage(plainsTileSheet);
  const decorSheet = useImage(decorTileSheet);
  const heartSmall = useImage(heartSmallSprite);
  const heartLarge = useImage(heartLargeSprite);
  const blobImage = useImage(blobSpriteSheet);
  const slimeImage = useImage(slimeSpriteSheet);
  const handImage = useImage(handSpriteSheet);
  const gelehkImage = useImage(gelehkSpriteSheet);
  const dragonImage = useImage(dragonSpriteSheet);
  const silverbackImage = useImage(silverbackSpriteSheet);
  const slimMaioliImage = useImage(slimMaioliSpriteSheet);
  const franklyImage = useImage(franklySpriteSheet);

  const theme = getInstanceTheme(currentInstanceId);
  const viewportWidth = Math.max(1, viewportSize.width);
  const viewportHeight = Math.max(1, viewportSize.height);
  const camera = predictedLocalPlayer
    ? { x: predictedLocalPlayer.x, y: predictedLocalPlayer.y }
    : { x: mapWidth / 2, y: mapHeight / 2 };

  const worldToScreen = (x: number, y: number) => ({
    x: x - camera.x + viewportWidth / 2,
    y: y - camera.y + viewportHeight / 2,
  });

  const isVisible = (x: number, y: number, margin = 48) =>
    x >= -margin && y >= -margin && x <= viewportWidth + margin && y <= viewportHeight + margin;

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) {
      return;
    }

    setViewportSize((current) =>
      current.width === width && current.height === height ? current : { width, height }
    );
  };

  const grid = useMemo(() => {
    const cells: Array<{ x: number; y: number }> = [];
    const startX = Math.floor((camera.x - viewportWidth / 2) / TILE_WORLD_SIZE) - 1;
    const endX = Math.floor((camera.x + viewportWidth / 2) / TILE_WORLD_SIZE) + 1;
    const startY = Math.floor((camera.y - viewportHeight / 2) / TILE_WORLD_SIZE) - 1;
    const endY = Math.floor((camera.y + viewportHeight / 2) / TILE_WORLD_SIZE) + 1;

    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        const screen = worldToScreen(x * TILE_WORLD_SIZE, y * TILE_WORLD_SIZE);
        if (isVisible(screen.x, screen.y, TILE_WORLD_SIZE)) {
          cells.push({ x, y });
        }
      }
    }

    return cells;
  }, [camera.x, camera.y, viewportHeight, viewportWidth]);

  const decor = useMemo(
    () =>
      getChunkDecor(currentInstanceId, mapWidth, mapHeight)
        .map((item, index) => ({ ...item, key: index, screen: worldToScreen(item.x, item.y) }))
        .filter((item) => isVisible(item.screen.x, item.screen.y, 32)),
    [currentInstanceId, mapWidth, mapHeight, camera.x, camera.y]
  );

  const visibleHazards = useMemo(
    () =>
      hazards
        .map((hazard) => ({ ...hazard, screen: worldToScreen(hazard.renderX, hazard.renderY) }))
        .filter((hazard) => isVisible(hazard.screen.x, hazard.screen.y, 40)),
    [hazards, camera.x, camera.y]
  );

  const visibleDrops = useMemo(
    () =>
      drops
        .map((drop) => ({ ...drop, screen: worldToScreen(drop.renderX, drop.renderY) }))
        .filter((drop) => isVisible(drop.screen.x, drop.screen.y, 24)),
    [drops, camera.x, camera.y]
  );

  const visiblePortals = useMemo(
    () =>
      portals
        .map((portal) => ({ ...portal, screen: worldToScreen(portal.renderX, portal.renderY) }))
        .filter((portal) => isVisible(portal.screen.x, portal.screen.y, 40)),
    [portals, camera.x, camera.y]
  );

  const visibleEnemies = useMemo(
    () =>
      enemies
        .map((enemy) => ({ ...enemy, screen: worldToScreen(enemy.renderX, enemy.renderY) }))
        .filter((enemy) => isVisible(enemy.screen.x, enemy.screen.y, 56)),
    [enemies, camera.x, camera.y]
  );

  const visibleBosses = useMemo(
    () =>
      bosses
        .map((boss) => ({ ...boss, screen: worldToScreen(boss.renderX, boss.renderY) }))
        .filter((boss) => isVisible(boss.screen.x, boss.screen.y, 96)),
    [bosses, camera.x, camera.y]
  );

  const visiblePlayers = useMemo(
    () =>
      renderPlayers
        .map((player) => ({ ...player, screen: worldToScreen(player.renderX, player.renderY) }))
        .filter((player) => isVisible(player.screen.x, player.screen.y, 64)),
    [renderPlayers, camera.x, camera.y]
  );

  const visibleIceZones = useMemo(
    () =>
      iceZones
        .map((zone, index) => ({
          ...zone,
          key: index,
          screen: worldToScreen(zone.x, zone.y),
        }))
        .filter((zone) =>
          isVisible(zone.screen.x, zone.screen.y, Math.max(zone.width, zone.height))
        ),
    [iceZones, camera.x, camera.y]
  );

  const visibleAoeIndicators = useMemo(
    () =>
      aoeIndicators
        .map((aoe, index) => ({ ...aoe, key: index, screen: worldToScreen(aoe.x, aoe.y) }))
        .filter((aoe) => isVisible(aoe.screen.x, aoe.screen.y, aoe.radius + 12)),
    [aoeIndicators, camera.x, camera.y]
  );

  const screenSafeZone = useMemo(
    () =>
      safeZoneFx
        ? {
            ...safeZoneFx,
            screen: worldToScreen(safeZoneFx.x, safeZoneFx.y),
            remainingRatio: Math.max(0, (safeZoneFx.expiresAtMs - Date.now()) / 3000),
          }
        : null,
    [safeZoneFx, camera.x, camera.y]
  );

  const enemyImageByKind = {
    blob: blobImage,
    slime: slimeImage,
    hand: handImage,
  } as const;

  const bossImageByKind = {
    gelehk: gelehkImage,
    dragon_lord: dragonImage,
    silverback_wainer: silverbackImage,
    slim_maioli: slimMaioliImage,
    frankly_stein: franklyImage,
  } as const;

  useEffect(() => {
    useMobileGameStore.getState().setPerformance({
      visibleTiles: grid.length,
      visibleDecor: decor.length,
      visibleEntities:
        visiblePlayers.length +
        visibleEnemies.length +
        visibleBosses.length +
        visibleDrops.length +
        visiblePortals.length +
        visibleHazards.length,
    });
  }, [
    decor.length,
    grid.length,
    visibleBosses.length,
    visibleDrops.length,
    visibleEnemies.length,
    visibleHazards.length,
    visiblePlayers.length,
    visiblePortals.length,
  ]);
  const frameStyle = fullscreen ? styles.frameFullscreen : styles.frameWindowed;

  return (
    <View style={[styles.frameBase, frameStyle]} onLayout={handleLayout}>
      <Canvas style={styles.canvas}>
        <Fill color={theme.fallback} />
        <Group>
          {grid.map((cell) => {
            const screen = worldToScreen(cell.x * TILE_WORLD_SIZE, cell.y * TILE_WORLD_SIZE);

            if (!plainsSheet) {
              return (
                <Rect
                  key={`${cell.x}-${cell.y}`}
                  x={screen.x}
                  y={screen.y}
                  width={TILE_WORLD_SIZE}
                  height={TILE_WORLD_SIZE}
                  color={theme.accent}
                />
              );
            }

            return (
              <SkiaImage
                key={`${cell.x}-${cell.y}`}
                image={plainsSheet}
                x={screen.x}
                y={screen.y}
                width={TILE_WORLD_SIZE}
                height={TILE_WORLD_SIZE}
                fit="fill"
                rect={{ x: 0, y: 0, width: TILE_SPRITE_SIZE, height: TILE_SPRITE_SIZE }}
              />
            );
          })}

          {screenSafeZone &&
          isVisible(screenSafeZone.screen.x, screenSafeZone.screen.y, screenSafeZone.radius) ? (
            <Group>
              <Circle
                cx={screenSafeZone.screen.x}
                cy={screenSafeZone.screen.y}
                r={screenSafeZone.radius}
                color="#4dff88"
                opacity={0.08 + screenSafeZone.remainingRatio * 0.12}
              />
              <Circle
                cx={screenSafeZone.screen.x}
                cy={screenSafeZone.screen.y}
                r={screenSafeZone.radius}
                color="#86ffb0"
                opacity={0.18 + screenSafeZone.remainingRatio * 0.18}
              />
            </Group>
          ) : null}

          {visibleIceZones.map((zone) => (
            <Rect
              key={`ice-${zone.key}`}
              x={zone.screen.x}
              y={zone.screen.y}
              width={zone.width}
              height={zone.height}
              color="#88ccff"
              opacity={0.24}
            />
          ))}

          {visibleAoeIndicators.map((aoe) => (
            <Group key={`aoe-${aoe.key}`}>
              <Circle
                cx={aoe.screen.x}
                cy={aoe.screen.y}
                r={aoe.radius}
                color={aoe.hit ? '#9f6cff' : '#8f8f8f'}
                opacity={aoe.hit ? 0.32 : 0.22}
              />
              <Circle
                cx={aoe.screen.x}
                cy={aoe.screen.y}
                r={Math.max(8, aoe.radius - ((aoe.timer % 1000) / 1000) * aoe.radius)}
                color={aoe.hit ? '#d2b1ff' : '#d6d6d6'}
                opacity={0.18}
              />
              {aoe.hit
                ? Array.from({ length: 10 }).map((_, index) => {
                    const angle = (Math.PI * 2 * index) / 10;
                    const distance = aoe.radius * 0.58;
                    return (
                      <Circle
                        key={`aoe-hit-${aoe.key}-${index}`}
                        cx={aoe.screen.x + Math.cos(angle) * distance}
                        cy={aoe.screen.y + Math.sin(angle) * distance}
                        r={6}
                        color="#b48dff"
                        opacity={0.24}
                      />
                    );
                  })
                : null}
            </Group>
          ))}

          {decorSheet
            ? decor.map((item) => (
                <Group
                  key={`decor-${item.key}`}
                  transform={[
                    { translateX: item.screen.x },
                    { translateY: item.screen.y },
                    { rotate: (item.rotation * Math.PI) / 180 },
                    { scale: item.scale },
                  ]}
                >
                  <SkiaImage
                    image={decorSheet}
                    x={-16}
                    y={-16}
                    width={32}
                    height={32}
                    fit="fill"
                    rect={{ x: 0, y: 0, width: TILE_SPRITE_SIZE, height: TILE_SPRITE_SIZE }}
                  />
                </Group>
              ))
            : null}

          {visibleHazards.map((hazard) => {
            const palette = getHazardPalette(hazard.kind);
            const pulse = 0.8 + Math.sin(hazard.animationTimeMs / 160) * 0.15;
            const ttlRatio = Math.max(0.2, Math.min(1, hazard.ttlMs / 3000));
            return (
              <Group key={hazard.id}>
                <Circle
                  cx={hazard.screen.x}
                  cy={hazard.screen.y}
                  r={palette.radius * pulse}
                  color={palette.fill}
                  opacity={0.14 + ttlRatio * 0.12}
                />
                <Circle
                  cx={hazard.screen.x}
                  cy={hazard.screen.y}
                  r={Math.max(8, palette.radius - 4)}
                  color={palette.fill}
                  opacity={0.22 + ttlRatio * 0.2}
                />
                <Circle
                  cx={hazard.screen.x}
                  cy={hazard.screen.y}
                  r={palette.radius + 3}
                  color={palette.stroke}
                  opacity={0.1 + ttlRatio * 0.08}
                />
              </Group>
            );
          })}

          {visiblePortals.map((portal) => {
            const palette = getPortalPalette(portal.kind);
            const pulse = 1 + Math.sin(portal.animationTimeMs / 220) * 0.08;
            return (
              <Group key={portal.id}>
                <Circle
                  cx={portal.screen.x}
                  cy={portal.screen.y}
                  r={palette.radius * pulse}
                  color={palette.outer}
                  opacity={0.28}
                />
                <Circle
                  cx={portal.screen.x}
                  cy={portal.screen.y}
                  r={palette.radius * 0.56}
                  color={palette.inner}
                  opacity={0.72}
                />
                <Circle
                  cx={
                    portal.screen.x +
                    Math.cos(portal.animationTimeMs / 280) * (palette.radius * 0.72)
                  }
                  cy={
                    portal.screen.y +
                    Math.sin(portal.animationTimeMs / 280) * (palette.radius * 0.72)
                  }
                  r={4}
                  color={palette.inner}
                  opacity={0.65}
                />
              </Group>
            );
          })}

          {visibleDrops.map((drop) => {
            const asset = getDropAsset(drop.kind);
            const image = asset.source === heartLargeSprite ? heartLarge : heartSmall;
            const bobOffset = Math.sin(drop.animationTimeMs / 180) * 2;

            if (!image) {
              return (
                <Circle
                  key={drop.id}
                  cx={drop.screen.x}
                  cy={drop.screen.y + bobOffset}
                  r={8}
                  color="#ff6f7d"
                />
              );
            }

            return (
              <SkiaImage
                key={drop.id}
                image={image}
                x={drop.screen.x - asset.size / 2}
                y={drop.screen.y - asset.size / 2 + bobOffset}
                width={asset.size}
                height={asset.size}
                fit="contain"
              />
            );
          })}

          {visibleEnemies.map((enemy) => {
            const asset = getEnemyAsset(enemy.kind);
            const image = enemyImageByKind[enemy.kind];
            const frame = getEnemyAnimationFrame(enemy.kind, enemy.state, enemy.animationTimeMs);
            const width = frame.width * asset.scale;
            const height = frame.height * asset.scale;
            const hpRatio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;

            return (
              <Group key={enemy.id}>
                <Circle
                  cx={enemy.screen.x}
                  cy={enemy.screen.y + 8}
                  r={enemy.kind === 'blob' ? 12 : 18}
                  color="#000000"
                  opacity={0.2}
                />
                {image ? (
                  <SkiaImage
                    image={image}
                    x={enemy.screen.x - width / 2}
                    y={enemy.screen.y - height / 2}
                    width={width}
                    height={height}
                    fit="fill"
                    rect={frame}
                  />
                ) : (
                  <Circle cx={enemy.screen.x} cy={enemy.screen.y} r={12} color="#d9e4db" />
                )}
                <Line
                  p1={{ x: enemy.screen.x - 14, y: enemy.screen.y - height / 2 - 8 }}
                  p2={{ x: enemy.screen.x + 14, y: enemy.screen.y - height / 2 - 8 }}
                  color="#203024"
                  strokeWidth={4}
                />
                <Line
                  p1={{ x: enemy.screen.x - 14, y: enemy.screen.y - height / 2 - 8 }}
                  p2={{ x: enemy.screen.x - 14 + 28 * hpRatio, y: enemy.screen.y - height / 2 - 8 }}
                  color="#df5959"
                  strokeWidth={4}
                />
              </Group>
            );
          })}

          {visibleBosses.map((boss) => {
            const asset = getBossAsset(boss.kind);
            const frame = getBossAnimationFrame(boss.kind, boss.state, boss.animationTimeMs);
            const image = bossImageByKind[boss.kind];
            const width = frame.width * asset.scale;
            const height = frame.height * asset.scale;
            const hpRatio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
            const auraColor =
              boss.state === 'charging'
                ? '#ff8a2a'
                : boss.state === 'enraged' || boss.phase === 3
                  ? '#ff5252'
                  : boss.phase === 2
                    ? '#9a6dff'
                    : '#7ab7ff';
            const auraRadius = 30 + Math.sin(boss.animationTimeMs / 180) * 4;

            return (
              <Group key={boss.id}>
                <Circle
                  cx={boss.screen.x}
                  cy={boss.screen.y + 8}
                  r={auraRadius}
                  color={auraColor}
                  opacity={0.12}
                />
                <Circle
                  cx={boss.screen.x}
                  cy={boss.screen.y + 16}
                  r={26}
                  color="#000000"
                  opacity={0.24}
                />
                {image ? (
                  <SkiaImage
                    image={image}
                    x={boss.screen.x - width / 2}
                    y={boss.screen.y - height / 2}
                    width={width}
                    height={height}
                    fit="fill"
                    rect={frame}
                  />
                ) : (
                  <Circle cx={boss.screen.x} cy={boss.screen.y} r={20} color="#d8b587" />
                )}
                <Line
                  p1={{ x: boss.screen.x - 34, y: boss.screen.y - height / 2 - 10 }}
                  p2={{ x: boss.screen.x + 34, y: boss.screen.y - height / 2 - 10 }}
                  color="#241812"
                  strokeWidth={6}
                />
                <Line
                  p1={{ x: boss.screen.x - 34, y: boss.screen.y - height / 2 - 10 }}
                  p2={{ x: boss.screen.x - 34 + 68 * hpRatio, y: boss.screen.y - height / 2 - 10 }}
                  color={auraColor}
                  strokeWidth={6}
                />
              </Group>
            );
          })}

          {visiblePlayers.map((player) => {
            const frame = getPlayerAnimationFrame(
              player.direction,
              player.state === 'moving' && player.animationTimeMs === 0 ? 'idle' : player.state,
              player.animationTimeMs
            );
            const width = 42;
            const height = 42;
            const hpRatio = player.maxHp > 0 ? player.hp / player.maxHp : 0;

            return (
              <Group key={player.id}>
                <Circle
                  cx={player.screen.x}
                  cy={player.screen.y + 12}
                  r={14}
                  color="#000000"
                  opacity={0.24}
                />
                {playerSheet ? (
                  <SkiaImage
                    image={playerSheet}
                    x={player.screen.x - width / 2}
                    y={player.screen.y - height / 2 - 8}
                    width={width}
                    height={height}
                    fit="fill"
                    rect={frame}
                  />
                ) : (
                  <Circle
                    cx={player.screen.x}
                    cy={player.screen.y}
                    r={12}
                    color={player.isLocal ? '#f8de7e' : '#dbe7d5'}
                  />
                )}
                <Line
                  p1={{ x: player.screen.x - 16, y: player.screen.y - 28 }}
                  p2={{ x: player.screen.x + 16, y: player.screen.y - 28 }}
                  color="#203024"
                  strokeWidth={4}
                />
                <Line
                  p1={{ x: player.screen.x - 16, y: player.screen.y - 28 }}
                  p2={{ x: player.screen.x - 16 + 32 * hpRatio, y: player.screen.y - 28 }}
                  color={hpRatio > 0.5 ? '#4fe16d' : hpRatio > 0.25 ? '#f3af44' : '#df5959'}
                  strokeWidth={4}
                />
                {player.isLocal ? (
                  <Circle
                    cx={player.screen.x + 18}
                    cy={player.screen.y - 18}
                    r={4}
                    color="#f8de7e"
                  />
                ) : null}
              </Group>
            );
          })}
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  frameBase: {
    overflow: 'hidden',
  },
  frameWindowed: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#365241',
    backgroundColor: '#10221a',
  },
  frameFullscreen: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: '#10221a',
  },
  canvas: {
    flex: 1,
  },
});
