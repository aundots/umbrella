import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  StyleSheet,
  View,
} from 'react-native';
import { Button, Txt } from '@toss/tds-react-native';
import { COLORS } from './RelayCard';
import { ErrorBanner, SectionHeader } from './ui';
import { RADIUS } from '../theme';
import { fetchRadar, formatTime, radarImageUrl, RadarFrame } from '../services/api';

export function RadarPanel() {
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRadar()
      .then((data) => {
        setFrames(data.frames);
        setIndex(data.latestIndex);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '레이더를 불러오지 못했어요'))
      .finally(() => setLoading(false));
  }, []);

  const current = frames[index];
  const width = Dimensions.get('window').width - 48;

  return (
    <View style={styles.wrap}>
      <SectionHeader
        title="레이더"
        description="기상청 종합 레이더 · 전국 강수 이동"
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
          <View style={styles.imageWrap}>
            <Image
              source={{ uri: radarImageUrl(current.proxyUrl) }}
              style={{ width, height: width * 0.85 }}
              resizeMode="contain"
            />
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
    alignItems: 'center',
  },
  timeLabel: { textAlign: 'center', marginTop: 12 },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
  },
  empty: { marginVertical: 16, textAlign: 'center' },
});
