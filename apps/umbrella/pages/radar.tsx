import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@granite-js/react-native';
import { Button, Txt } from '@toss/tds-react-native';
import { navigateWithAd } from '../src/ads/navigateWithAd';
import { COLORS } from '../src/components/RelayCard';
import { BackLink, ErrorBanner, NavLink } from '../src/components/ui';
import { sharedStyles, RADIUS } from '../src/theme';
import { fetchRadar, formatTime, radarImageUrl, RadarFrame } from '../src/services/api';

export default function RadarScreen() {
  const navigation = useNavigation();
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
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.content}>
      <BackLink onPress={() => navigation.navigate('/')} />
      <Txt typography="t2" fontWeight="bold" color={COLORS.text}>
        레이더
      </Txt>
      <Txt typography="t7" color={COLORS.sub} style={styles.sub}>
        기상청 종합 레이더 · 전국 강수 이동
      </Txt>

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
          <NavLink
            label="시간별 중계표 보기"
            onPress={() => navigateWithAd((r) => navigation.navigate(r), '/timeline')}
          />
        </>
      ) : (
        <Txt typography="t6" color={COLORS.sub} style={styles.empty}>
          표시할 레이더 영상이 없어요.
        </Txt>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: 4, marginBottom: 20 },
  loader: { marginTop: 32 },
  imageWrap: {
    backgroundColor: '#1B1D27',
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    alignItems: 'center',
  },
  timeLabel: { textAlign: 'center', marginTop: 16 },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 20,
  },
  empty: { marginTop: 32, textAlign: 'center' },
});
