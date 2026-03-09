import { Asset } from 'expo-asset';
import { useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { useMobileGameStore } from '../../store/gameStore';
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
  plainsTileSheet,
  playerSpriteSheet,
  silverbackSpriteSheet,
  slimMaioliSpriteSheet,
  slimeSpriteSheet,
  type SpriteFrame,
} from '../assets/catalog';
import {
  getBossAnimationFrame,
  getEnemyAnimationFrame,
  getPlayerAnimationFrame,
} from '../animation/frames';
import { getChunkDecor } from '../render/worldDecor';

const DEFAULT_VIEWPORT_WIDTH = 352;
const DEFAULT_VIEWPORT_HEIGHT = 264;
const TILE_WORLD_SIZE = 32;
const TILE_SPRITE_SIZE = 16;

interface Props {
  fullscreen?: boolean;
}

interface WebSpriteProps {
  source: ResolvedSpriteAsset;
  frame?: SpriteFrame;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
}

interface ResolvedSpriteAsset {
  uri: string;
  width: number;
  height: number;
}

function resolveSpriteAsset(source: number): ResolvedSpriteAsset {
  const asset = Asset.fromModule(source);
  return {
    uri: asset.localUri ?? asset.uri,
    width: asset.width ?? 1,
    height: asset.height ?? 1,
  };
}

const playerSpriteAsset = resolveSpriteAsset(playerSpriteSheet);
const plainsTileAsset = resolveSpriteAsset(plainsTileSheet);
const decorTileAsset = resolveSpriteAsset(decorTileSheet);
const heartSmallAsset = resolveSpriteAsset(heartSmallSprite);
const heartLargeAsset = resolveSpriteAsset(heartLargeSprite);

const enemyImageByKind = {
  blob: resolveSpriteAsset(blobSpriteSheet),
  slime: resolveSpriteAsset(slimeSpriteSheet),
  hand: resolveSpriteAsset(handSpriteSheet),
} as const;

const bossImageByKind = {
  gelehk: resolveSpriteAsset(gelehkSpriteSheet),
  dragon_lord: resolveSpriteAsset(dragonSpriteSheet),
  silverback_wainer: resolveSpriteAsset(silverbackSpriteSheet),
  slim_maioli: resolveSpriteAsset(slimMaioliSpriteSheet),
  frankly_stein: resolveSpriteAsset(franklySpriteSheet),
} as const;

function WebSprite({ source, frame, x, y, width, height, opacity = 1 }: WebSpriteProps) {
  const assetWidth = source.width || frame?.width || width;
  const assetHeight = source.height || frame?.height || height;

  if (!frame) {
    return (
      <Image
        source={{ uri: source.uri }}
        style={[styles.absolute, { left: x, top: y, width, height, opacity }]}
        resizeMode="stretch"
      />
    );
  }

  const scaleX = width / frame.width;
  const scaleY = height / frame.height;

  return (
    <View
      style={[styles.absolute, styles.spriteFrame, { left: x, top: y, width, height, opacity }]}
    >
      <Image
        source={{ uri: source.uri }}
        style={{
          position: 'absolute',
          left: -frame.x * scaleX,
          top: -frame.y * scaleY,
          width: assetWidth * scaleX,
          height: assetHeight * scaleY,
        }}
        resizeMode="stretch"
      />
    </View>
  );
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

  const theme = getInstanceTheme(currentInstanceId);
  const viewportWidth = Math.max(1, viewportSize.width);
  const viewportHeight = Math.max(1, viewportSize.height);
  const frameStyle = fullscreen ? styles.frameFullscreen : styles.frameWindowed;

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
    if (width <= 0 || height <= 0) return;

    setViewportSize((current) =>
      current.width === width && current.height === height ? current : { width, height }
    );
  };

  const decor = useMemo(
    () =>
      getChunkDecor(currentInstanceId, mapWidth, mapHeight)
        .map((item, index) => ({ ...item, key: index, screen: worldToScreen(item.x, item.y) }))
        .filter((item) => isVisible(item.screen.x, item.screen.y, 32)),
    [currentInstanceId, mapWidth, mapHeight, camera.x, camera.y, viewportHeight, viewportWidth]
  );

  const groundStyle = useMemo(
    () =>
      ({
        backgroundImage: `url(${plainsTileAsset.uri})`,
        backgroundRepeat: 'repeat',
        backgroundSize: `${TILE_WORLD_SIZE}px ${TILE_WORLD_SIZE}px`,
        backgroundPositionX: `${Math.round(-camera.x + viewportWidth / 2)}px`,
        backgroundPositionY: `${Math.round(-camera.y + viewportHeight / 2)}px`,
        opacity: 0.96,
      }) as const,
    [camera.x, camera.y, viewportHeight, viewportWidth]
  );

  const visibleHazards = useMemo(
    () =>
      hazards
        .map((hazard) => ({ ...hazard, screen: worldToScreen(hazard.renderX, hazard.renderY) }))
        .filter((hazard) => isVisible(hazard.screen.x, hazard.screen.y, 40)),
    [hazards, camera.x, camera.y, viewportHeight, viewportWidth]
  );

  const visibleDrops = useMemo(
    () =>
      drops
        .map((drop) => ({ ...drop, screen: worldToScreen(drop.renderX, drop.renderY) }))
        .filter((drop) => isVisible(drop.screen.x, drop.screen.y, 24)),
    [drops, camera.x, camera.y, viewportHeight, viewportWidth]
  );

  const visiblePortals = useMemo(
    () =>
      portals
        .map((portal) => ({ ...portal, screen: worldToScreen(portal.renderX, portal.renderY) }))
        .filter((portal) => isVisible(portal.screen.x, portal.screen.y, 40)),
    [portals, camera.x, camera.y, viewportHeight, viewportWidth]
  );

  const visibleEnemies = useMemo(
    () =>
      enemies
        .map((enemy) => ({ ...enemy, screen: worldToScreen(enemy.renderX, enemy.renderY) }))
        .filter((enemy) => isVisible(enemy.screen.x, enemy.screen.y, 56)),
    [enemies, camera.x, camera.y, viewportHeight, viewportWidth]
  );

  const visibleBosses = useMemo(
    () =>
      bosses
        .map((boss) => ({ ...boss, screen: worldToScreen(boss.renderX, boss.renderY) }))
        .filter((boss) => isVisible(boss.screen.x, boss.screen.y, 96)),
    [bosses, camera.x, camera.y, viewportHeight, viewportWidth]
  );

  const visiblePlayers = useMemo(
    () =>
      renderPlayers
        .map((player) => ({ ...player, screen: worldToScreen(player.renderX, player.renderY) }))
        .filter((player) => isVisible(player.screen.x, player.screen.y, 64)),
    [renderPlayers, camera.x, camera.y, viewportHeight, viewportWidth]
  );

  const visibleIceZones = useMemo(
    () =>
      iceZones
        .map((zone, index) => ({ ...zone, key: index, screen: worldToScreen(zone.x, zone.y) }))
        .filter((zone) =>
          isVisible(zone.screen.x, zone.screen.y, Math.max(zone.width, zone.height))
        ),
    [iceZones, camera.x, camera.y, viewportHeight, viewportWidth]
  );

  const visibleAoeIndicators = useMemo(
    () =>
      aoeIndicators
        .map((aoe, index) => ({ ...aoe, key: index, screen: worldToScreen(aoe.x, aoe.y) }))
        .filter((aoe) => isVisible(aoe.screen.x, aoe.screen.y, aoe.radius + 12)),
    [aoeIndicators, camera.x, camera.y, viewportHeight, viewportWidth]
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
    [safeZoneFx, camera.x, camera.y, viewportHeight, viewportWidth]
  );

  return (
    <View
      style={[styles.frameBase, frameStyle, { backgroundColor: theme.fallback }]}
      onLayout={handleLayout}
    >
      <View style={styles.stage}>
        <View style={styles.groundBase} />
        <View style={[styles.groundTexture as never, groundStyle as never]} />

        {decor.slice(0, 32).map((item) => (
          <View
            key={`decor-${item.key}`}
            style={{
              position: 'absolute',
              left: item.screen.x - 16,
              top: item.screen.y - 16,
              width: 32,
              height: 32,
              transform: [{ rotate: `${item.rotation}deg` }, { scale: item.scale }],
            }}
          >
            <WebSprite
              source={decorTileAsset}
              frame={{ x: 0, y: 0, width: TILE_SPRITE_SIZE, height: TILE_SPRITE_SIZE }}
              x={0}
              y={0}
              width={32}
              height={32}
              opacity={0.95}
            />
          </View>
        ))}

        {screenSafeZone &&
        isVisible(screenSafeZone.screen.x, screenSafeZone.screen.y, screenSafeZone.radius) ? (
          <View
            style={[
              styles.circle,
              styles.safeZone,
              {
                left: screenSafeZone.screen.x - screenSafeZone.radius,
                top: screenSafeZone.screen.y - screenSafeZone.radius,
                width: screenSafeZone.radius * 2,
                height: screenSafeZone.radius * 2,
                opacity: 0.15 + screenSafeZone.remainingRatio * 0.18,
              },
            ]}
          />
        ) : null}

        {visibleIceZones.map((zone) => (
          <View
            key={`ice-${zone.key}`}
            style={[
              styles.iceZone,
              {
                left: zone.screen.x,
                top: zone.screen.y,
                width: zone.width,
                height: zone.height,
              },
            ]}
          />
        ))}

        {visibleAoeIndicators.map((aoe) => (
          <View
            key={`aoe-${aoe.key}`}
            style={[
              styles.circle,
              styles.aoe,
              aoe.hit ? styles.aoeHit : null,
              {
                left: aoe.screen.x - aoe.radius,
                top: aoe.screen.y - aoe.radius,
                width: aoe.radius * 2,
                height: aoe.radius * 2,
              },
            ]}
          />
        ))}

        {visibleHazards.map((hazard) => {
          const palette = getHazardPalette(hazard.kind);
          const pulse = 0.8 + Math.sin(hazard.animationTimeMs / 160) * 0.15;
          const radius = palette.radius * pulse;
          return (
            <View
              key={hazard.id}
              style={[
                styles.circle,
                {
                  left: hazard.screen.x - radius,
                  top: hazard.screen.y - radius,
                  width: radius * 2,
                  height: radius * 2,
                  backgroundColor: palette.fill,
                  borderColor: palette.stroke,
                  opacity: 0.34,
                },
              ]}
            />
          );
        })}

        {visiblePortals.map((portal) => {
          const palette = getPortalPalette(portal.kind);
          return (
            <View
              key={portal.id}
              style={[
                styles.circle,
                styles.portal,
                {
                  left: portal.screen.x - palette.radius,
                  top: portal.screen.y - palette.radius,
                  width: palette.radius * 2,
                  height: palette.radius * 2,
                  borderColor: palette.outer,
                  backgroundColor: palette.inner,
                },
              ]}
            />
          );
        })}

        {visibleDrops.map((drop) => {
          const asset = getDropAsset(drop.kind);
          const source = asset.source === heartLargeSprite ? heartLargeAsset : heartSmallAsset;
          const bobOffset = Math.sin(drop.animationTimeMs / 180) * 2;

          return (
            <WebSprite
              key={drop.id}
              source={source}
              x={drop.screen.x - asset.size / 2}
              y={drop.screen.y - asset.size / 2 + bobOffset}
              width={asset.size}
              height={asset.size}
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
            <View key={enemy.id}>
              <View
                style={[
                  styles.shadow,
                  {
                    left: enemy.screen.x - 14,
                    top: enemy.screen.y + 8,
                    width: 28,
                    height: 12,
                  },
                ]}
              />
              <WebSprite
                source={image}
                frame={frame}
                x={enemy.screen.x - width / 2}
                y={enemy.screen.y - height / 2}
                width={width}
                height={height}
              />
              <View
                style={[
                  styles.hpTrack,
                  { left: enemy.screen.x - 14, top: enemy.screen.y - height / 2 - 8 },
                ]}
              >
                <View style={[styles.hpFill, styles.enemyHpFill, { width: 28 * hpRatio }]} />
              </View>
            </View>
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

          return (
            <View key={boss.id}>
              <View
                style={[
                  styles.circle,
                  {
                    left: boss.screen.x - 30,
                    top: boss.screen.y - 14,
                    width: 60,
                    height: 60,
                    backgroundColor: auraColor,
                    borderColor: auraColor,
                    opacity: 0.16,
                  },
                ]}
              />
              <View
                style={[
                  styles.shadow,
                  {
                    left: boss.screen.x - 24,
                    top: boss.screen.y + 14,
                    width: 48,
                    height: 16,
                    opacity: 0.28,
                  },
                ]}
              />
              <WebSprite
                source={image}
                frame={frame}
                x={boss.screen.x - width / 2}
                y={boss.screen.y - height / 2}
                width={width}
                height={height}
              />
              <View
                style={[
                  styles.hpTrackLarge,
                  { left: boss.screen.x - 34, top: boss.screen.y - height / 2 - 10 },
                ]}
              >
                <View
                  style={[styles.hpFill, { width: 68 * hpRatio, backgroundColor: auraColor }]}
                />
              </View>
            </View>
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
            <View key={player.id}>
              <View
                style={[
                  styles.shadow,
                  {
                    left: player.screen.x - 14,
                    top: player.screen.y + 12,
                    width: 28,
                    height: 12,
                    opacity: 0.24,
                  },
                ]}
              />
              <WebSprite
                source={playerSpriteAsset}
                frame={frame}
                x={player.screen.x - width / 2}
                y={player.screen.y - height / 2 - 8}
                width={width}
                height={height}
              />
              <View
                style={[
                  styles.hpTrackPlayer,
                  { left: player.screen.x - 16, top: player.screen.y - 28 },
                ]}
              >
                <View
                  style={[
                    styles.hpFill,
                    {
                      width: 32 * hpRatio,
                      backgroundColor:
                        hpRatio > 0.5 ? '#4fe16d' : hpRatio > 0.25 ? '#f3af44' : '#df5959',
                    },
                  ]}
                />
              </View>
              {player.isLocal ? (
                <View
                  style={[
                    styles.localMarker,
                    {
                      left: player.screen.x + 14,
                      top: player.screen.y - 22,
                    },
                  ]}
                />
              ) : null}
            </View>
          );
        })}

        <View style={styles.webNotice}>
          <Text style={styles.webNoticeText}>Web preview fallback active</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  absolute: {
    position: 'absolute',
  },
  frameBase: {
    overflow: 'hidden',
  },
  frameWindowed: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#365241',
  },
  frameFullscreen: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    borderRadius: 0,
    borderWidth: 0,
  },
  stage: {
    ...StyleSheet.absoluteFillObject,
  },
  groundBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a3428',
  },
  groundTexture: {
    ...StyleSheet.absoluteFillObject,
  },
  spriteFrame: {
    overflow: 'hidden',
  },
  circle: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
  },
  safeZone: {
    backgroundColor: 'rgba(134,255,176,0.16)',
    borderColor: 'rgba(134,255,176,0.45)',
  },
  iceZone: {
    position: 'absolute',
    backgroundColor: 'rgba(136,204,255,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(136,204,255,0.48)',
  },
  aoe: {
    backgroundColor: 'rgba(214,214,214,0.2)',
    borderColor: 'rgba(214,214,214,0.55)',
  },
  aoeHit: {
    backgroundColor: 'rgba(180,141,255,0.22)',
    borderColor: 'rgba(180,141,255,0.6)',
  },
  portal: {
    opacity: 0.82,
  },
  shadow: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#000000',
  },
  hpTrack: {
    position: 'absolute',
    width: 28,
    height: 4,
    backgroundColor: '#203024',
    overflow: 'hidden',
  },
  hpTrackLarge: {
    position: 'absolute',
    width: 68,
    height: 6,
    backgroundColor: '#241812',
    overflow: 'hidden',
  },
  hpTrackPlayer: {
    position: 'absolute',
    width: 32,
    height: 4,
    backgroundColor: '#203024',
    overflow: 'hidden',
  },
  hpFill: {
    height: '100%',
  },
  enemyHpFill: {
    backgroundColor: '#df5959',
  },
  localMarker: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#f8de7e',
  },
  webNotice: {
    position: 'absolute',
    right: 12,
    top: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  webNoticeText: {
    color: '#d7e8ff',
    fontSize: 10,
    fontWeight: '700',
  },
});
