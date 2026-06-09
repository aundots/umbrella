import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@granite-js/react-native';
import { navigateWithAd } from '../src/ads/navigateWithAd';
import { COLORS } from '../src/components/RelayCard';
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
  const width = Dimensions.get('window').width - 40;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.navigate('/')}>
        <Text style={styles.back}>← 돌아가기</Text>
      </TouchableOpacity>
      <Text style={styles.title}>레이더</Text>
      <Text style={styles.sub}>기상청 종합 레이더 · 전국 강수 이동</Text>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 32 }} />
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorHint}>
            공공데이터포털에서 「레이더영상 조회서비스」 활용신청 후 다시 시도해 주세요.
          </Text>
        </View>
      ) : current ? (
        <>
          <View style={styles.imageWrap}>
            <Image
              source={{ uri: radarImageUrl(current.proxyUrl) }}
              style={{ width, height: width * 0.85 }}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.timeLabel}>
            {current.time ? formatTime(current.time) : `프레임 ${index + 1}/${frames.length}`}
          </Text>
          <View style={styles.controls}>
            <TouchableOpacity
              style={[styles.ctrlBtn, index <= 0 && styles.ctrlDisabled]}
              disabled={index <= 0}
              onPress={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <Text style={styles.ctrlText}>◀ 이전</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ctrlBtn, index >= frames.length - 1 && styles.ctrlDisabled]}
              disabled={index >= frames.length - 1}
              onPress={() => setIndex((i) => Math.min(frames.length - 1, i + 1))}
            >
              <Text style={styles.ctrlText}>다음 ▶</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => navigateWithAd((r) => navigation.navigate(r), '/timeline')}
          >
            <Text style={styles.linkText}>시간별 중계표 보기 →</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={styles.empty}>표시할 레이더 영상이 없어요.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 40 },
  back: { color: COLORS.primary, marginBottom: 12, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.sub, marginBottom: 16 },
  imageWrap: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
  },
  timeLabel: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
  },
  ctrlBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
  },
  ctrlDisabled: { opacity: 0.4 },
  ctrlText: { color: '#fff', fontWeight: '600' },
  linkBtn: { marginTop: 20, alignItems: 'center' },
  linkText: { color: COLORS.primary, fontWeight: '600', fontSize: 15 },
  errorBox: {
    backgroundColor: '#FFF5F5',
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
  },
  errorText: { color: '#E53E3E', fontWeight: '600' },
  errorHint: { color: COLORS.sub, fontSize: 12, marginTop: 8, lineHeight: 18 },
  empty: { color: COLORS.sub, marginTop: 24, textAlign: 'center' },
});
