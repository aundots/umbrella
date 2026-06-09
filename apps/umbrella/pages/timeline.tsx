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
import { navigateWithAd } from '../src/ads/navigateWithAd';
import { COLORS } from '../src/components/RelayCard';
import { useLocations } from '../src/hooks/useLocations';
import {
  fetchRelay,
  formatTime,
  LiveRelayReport,
  precipLabel,
} from '../src/services/api';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

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

  const detail = report?.detail;
  const vilageHours = detail?.vilageHourly?.slice(0, 12) ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.navigate('/')}>
        <Text style={styles.back}>← 돌아가기</Text>
      </TouchableOpacity>
      <Text style={styles.title}>시간별 중계표</Text>
      <Text style={styles.sub}>{active.name} · 초단기·동네예보</Text>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 32 }} />
      ) : (
        <>
          {detail?.nowObs && (
            <View style={styles.nowCard}>
              <Text style={styles.sectionTitle}>현재 관측</Text>
              {detail.nowObs.tempC != null && (
                <DetailRow label="기온" value={`${detail.nowObs.tempC}°C`} />
              )}
              {detail.nowObs.humidity != null && (
                <DetailRow label="습도" value={`${detail.nowObs.humidity}%`} />
              )}
              {detail.nowObs.sky ? <DetailRow label="하늘" value={detail.nowObs.sky} /> : null}
            </View>
          )}

          <Text style={styles.sectionTitle}>10분 간격 중계 (1시간)</Text>
          <View style={styles.grid}>
            {report?.timeline.map((slot) => {
              const ultra = detail?.ultraHourly.find(
                (h) =>
                  Math.abs(new Date(h.at).getTime() - Date.now() - slot.offsetMin * 60000) <
                  8 * 60000,
              );
              return (
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
                  {ultra?.tempC != null && (
                    <Text style={styles.extra}>{ultra.tempC}°</Text>
                  )}
                  {ultra?.sky ? <Text style={styles.extraSm}>{ultra.sky}</Text> : null}
                </View>
              );
            })}
          </View>

          {detail?.vilageAvailable && vilageHours.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>동네예보 (시간별)</Text>
              {vilageHours.map((h) => (
                <View key={h.at} style={styles.hourRow}>
                  <Text style={styles.hourTime}>{formatTime(h.at)}</Text>
                  <View style={styles.hourBody}>
                    <Text style={styles.hourMain}>
                      {h.sky ?? '—'} · {precipLabel(h.type)}
                      {h.pop != null ? ` · ${h.pop}%` : ''}
                    </Text>
                    <Text style={styles.hourSub}>
                      {h.tempC != null ? `${h.tempC}°C` : ''}
                      {h.humidity != null ? ` · 습도 ${h.humidity}%` : ''}
                      {h.windMs != null ? ` · 바람 ${h.windMs}m/s` : ''}
                      {h.pcp && h.pcp !== '없음' && h.pcp !== '강수없음' ? ` · ${h.pcp}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.hint}>
              동네예보는 공공데이터포털에서 「동네예보 조회서비스」 활용신청 후 표시돼요.
            </Text>
          )}

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => navigateWithAd((r) => navigation.navigate(r), '/radar')}
          >
            <Text style={styles.linkText}>레이더 영상 보기 →</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 40 },
  back: { color: COLORS.primary, marginBottom: 12, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.sub, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  nowCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  detailLabel: { color: COLORS.sub, fontSize: 14 },
  detailValue: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
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
  extra: { fontSize: 13, color: COLORS.text, marginTop: 4, fontWeight: '600' },
  extraSm: { fontSize: 11, color: COLORS.sub, marginTop: 2 },
  hourRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  hourTime: { fontWeight: '700', color: COLORS.primary, minWidth: 44 },
  hourBody: { flex: 1 },
  hourMain: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  hourSub: { fontSize: 12, color: COLORS.sub, marginTop: 4 },
  hint: { fontSize: 12, color: COLORS.sub, marginTop: 16, lineHeight: 18 },
  linkBtn: { marginTop: 20, alignItems: 'center' },
  linkText: { color: COLORS.primary, fontWeight: '600', fontSize: 15 },
});
