import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@granite-js/react-native';
import { COLORS } from '../src/components/RelayCard';
import { useLocations } from '../src/hooks/useLocations';
import { fetchRelay, LiveRelayReport, precipLabel } from '../src/services/api';

export default function TimelineScreen() {
  const navigation = useNavigation();
  const { active } = useLocations();
  const [report, setReport] = useState<LiveRelayReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRelay(active.lat, active.lng, active.name)
      .then(setReport)
      .finally(() => setLoading(false));
  }, [active]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.navigate('/')}>
        <Text style={styles.back}>← 돌아가기</Text>
      </TouchableOpacity>
      <Text style={styles.title}>시간별 중계표</Text>
      <Text style={styles.sub}>{active.name} · 레이더 이동 중계 · 10분 간격</Text>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 32 }} />
      ) : (
        <View style={styles.grid}>
          {report?.timeline.map((slot) => (
            <View key={slot.offsetMin} style={styles.slot}>
              <Text style={styles.offset}>
                {slot.offsetMin === 0 ? '지금' : `+${slot.offsetMin}분`}
              </Text>
              {slot.rateMmH > 0 || slot.type !== 'none' ? (
                <>
                  <Text style={styles.precip}>{precipLabel(slot.type)}</Text>
                  <Text style={styles.rate}>{slot.rateMmH} mm/h</Text>
                </>
              ) : (
                <Text style={styles.none}>없음</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20 },
  back: { color: COLORS.primary, marginBottom: 12, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.sub, marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slot: {
    width: '30%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    minWidth: 100,
  },
  offset: { fontSize: 12, color: COLORS.sub, fontWeight: '600' },
  precip: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 6 },
  rate: { fontSize: 12, color: COLORS.primary },
  none: { fontSize: 14, color: COLORS.sub, marginTop: 8 },
});
