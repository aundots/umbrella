import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  GestureResponderEvent,
  Image,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button, Txt } from '@toss/tds-react-native';
import { COLORS } from './RelayCard';
import { ErrorBanner, SectionHeader } from './ui';
import { RADIUS } from '../theme';
import { fetchRadar, formatTime, radarImageUrl, RadarFrame } from '../services/api';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

type TouchMode = 'none' | 'pan' | 'pinch';

interface RadarPanelProps {
  /** 메인 ScrollView 스크롤 잠금 (확대·드래그 중) */
  onGestureActive?: (active: boolean) => void;
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 10) / 10));
}

function touchDistance(touches: GestureResponderEvent['nativeEvent']['touches']): number | null {
  if (touches.length < 2) return null;
  const [a, b] = [touches[0], touches[1]];
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

function clampPan(x: number, y: number, zoom: number, baseW: number, baseH: number) {
  const maxX = (baseW * (zoom - 1)) / 2;
  const maxY = (baseH * (zoom - 1)) / 2;
  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y)),
  };
}

export function RadarPanel({ onGestureActive }: RadarPanelProps) {
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const touchRef = useRef<{
    mode: TouchMode;
    startDist: number;
    startZoom: number;
    startPanX: number;
    startPanY: number;
    startX: number;
    startY: number;
  }>({
    mode: 'none',
    startDist: 0,
    startZoom: MIN_ZOOM,
    startPanX: 0,
    startPanY: 0,
    startX: 0,
    startY: 0,
  });
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);

  const baseWidth = Dimensions.get('window').width - 48;
  const baseHeight = baseWidth * 0.85;

  zoomRef.current = zoom;
  panRef.current = pan;

  useEffect(() => {
    fetchRadar()
      .then((data) => {
        setFrames(data.frames);
        setIndex(data.latestIndex);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '레이더를 불러오지 못했어요'))
      .finally(() => setLoading(false));
  }, []);

  const setGestureActive = (active: boolean) => {
    onGestureActive?.(active);
  };

  const applyZoom = (next: number) => {
    const z = clampZoom(next);
    setZoom(z);
    if (z <= MIN_ZOOM) {
      setPan({ x: 0, y: 0 });
    } else {
      setPan((p) => clampPan(p.x, p.y, z, baseWidth, baseHeight));
    }
  };

  const endGesture = () => {
    touchRef.current.mode = 'none';
    setGestureActive(false);
  };

  const shouldCapture = (touches: GestureResponderEvent['nativeEvent']['touches']) =>
    touches.length >= 2 || zoomRef.current > MIN_ZOOM;

  const onResponderGrant = (e: GestureResponderEvent) => {
    setGestureActive(true);
    const t = e.nativeEvent.touches;
    if (t.length >= 2) {
      const dist = touchDistance(t);
      if (dist) {
        touchRef.current = {
          mode: 'pinch',
          startDist: dist,
          startZoom: zoomRef.current,
          startPanX: panRef.current.x,
          startPanY: panRef.current.y,
          startX: 0,
          startY: 0,
        };
      }
    } else if (t.length === 1 && zoomRef.current > MIN_ZOOM) {
      touchRef.current = {
        mode: 'pan',
        startDist: 0,
        startZoom: zoomRef.current,
        startPanX: panRef.current.x,
        startPanY: panRef.current.y,
        startX: t[0].pageX,
        startY: t[0].pageY,
      };
    }
  };

  const onResponderMove = (e: GestureResponderEvent) => {
    const t = e.nativeEvent.touches;
    const state = touchRef.current;

    if (state.mode === 'pinch' && t.length >= 2) {
      const dist = touchDistance(t);
      if (!dist) return;
      const ratio = dist / state.startDist;
      const nextZoom = clampZoom(state.startZoom * ratio);
      setZoom(nextZoom);
      setPan(clampPan(state.startPanX, state.startPanY, nextZoom, baseWidth, baseHeight));
      return;
    }

    if (state.mode === 'pan' && t.length === 1) {
      const dx = t[0].pageX - state.startX;
      const dy = t[0].pageY - state.startY;
      setPan(
        clampPan(
          state.startPanX + dx,
          state.startPanY + dy,
          zoomRef.current,
          baseWidth,
          baseHeight,
        ),
      );
    }
  };

  const current = frames[index];

  return (
    <View style={styles.wrap}>
      <SectionHeader
        title="레이더"
        description="버튼 또는 핀치로 확대 · 확대 후 드래그"
      />

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={styles.loader} />
      ) : error ? (
        <ErrorBanner
          message={error}
          hint="공공데이터포털에서 「레이더영상 조회서비스」 활용신청 후 다시 시도해 주세요."
        />
      ) : current ? (
        <>
          <View style={[styles.imageWrap, { width: baseWidth, height: baseHeight }]}>
            <View
              style={[
                styles.imageStage,
                {
                  width: baseWidth,
                  height: baseHeight,
                  transform: [
                    { translateX: pan.x },
                    { translateY: pan.y },
                    { scale: zoom },
                  ],
                },
              ]}
              onStartShouldSetResponder={(e) => shouldCapture(e.nativeEvent.touches)}
              onMoveShouldSetResponder={(e) => shouldCapture(e.nativeEvent.touches)}
              onResponderTerminationRequest={() => false}
              onResponderGrant={onResponderGrant}
              onResponderMove={onResponderMove}
              onResponderRelease={endGesture}
              onResponderTerminate={endGesture}
            >
              <Image
                source={{ uri: radarImageUrl(current.proxyUrl) }}
                style={{ width: baseWidth, height: baseHeight }}
                resizeMode="contain"
              />
            </View>
          </View>

          <View style={styles.zoomRow}>
            <TouchableOpacity
              style={[styles.zoomBtn, zoom <= MIN_ZOOM && styles.zoomBtnDisabled]}
              disabled={zoom <= MIN_ZOOM}
              onPress={() => applyZoom(zoom - ZOOM_STEP)}
              activeOpacity={0.7}
            >
              <Txt typography="t4" fontWeight="bold" color={COLORS.text}>
                −
              </Txt>
            </TouchableOpacity>
            <Txt typography="t6" fontWeight="semibold" color={COLORS.text} style={styles.zoomLabel}>
              {Math.round(zoom * 100)}%
            </Txt>
            <TouchableOpacity
              style={[styles.zoomBtn, zoom >= MAX_ZOOM && styles.zoomBtnDisabled]}
              disabled={zoom >= MAX_ZOOM}
              onPress={() => applyZoom(zoom + ZOOM_STEP)}
              activeOpacity={0.7}
            >
              <Txt typography="t4" fontWeight="bold" color={COLORS.text}>
                +
              </Txt>
            </TouchableOpacity>
            {zoom > MIN_ZOOM ? (
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={() => applyZoom(MIN_ZOOM)}
                activeOpacity={0.7}
              >
                <Txt typography="t7" fontWeight="semibold" color={COLORS.primary}>
                  원래
                </Txt>
              </TouchableOpacity>
            ) : null}
          </View>

          <Txt typography="t5" fontWeight="semibold" color={COLORS.text} style={styles.timeLabel}>
            {current.time ? formatTime(current.time) : `프레임 ${index + 1}/${frames.length}`}
          </Txt>
          <View style={styles.controls}>
            <Button
              size="medium"
              style="weak"
              type="primary"
              disabled={index <= 0}
              onPress={() => setIndex((i) => Math.max(0, i - 1))}
            >
              ◀ 이전
            </Button>
            <Button
              size="medium"
              disabled={index >= frames.length - 1}
              onPress={() => setIndex((i) => Math.min(frames.length - 1, i + 1))}
            >
              다음 ▶
            </Button>
          </View>
        </>
      ) : (
        <Txt typography="t6" color={COLORS.sub} style={styles.empty}>
          표시할 레이더 영상이 없어요.
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  loader: { marginVertical: 24 },
  imageWrap: {
    backgroundColor: '#1B1D27',
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  imageStage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 12,
  },
  zoomBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnDisabled: { opacity: 0.35 },
  resetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.weakBlue,
  },
  zoomLabel: { minWidth: 48, textAlign: 'center' },
  timeLabel: { textAlign: 'center', marginTop: 12 },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
  },
  empty: { marginVertical: 16, textAlign: 'center' },
});
