import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@granite-js/react-native';
import { preloadInterstitial } from '../src/ads/interstitial';
import { navigateWithAd } from '../src/ads/navigateWithAd';
import { useAuth } from '../src/auth/AuthContext';
import { COLORS, MetaLine, RelayCard } from '../src/components/RelayCard';
import { LocationSearch } from '../src/components/LocationSearch';
import { useLocations, useRelay } from '../src/hooks/useLocations';
import {
  formatTime,
  precipLabel,
  statusLabel,
} from '../src/services/api';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { userKey, loading: authLoading, error: authError, login } = useAuth();
  const { locations, active, activeId, activeAddress, setActiveId, addSearchedPlace } =
    useLocations();
  const { report, loading, error, reload } = useRelay(active);

  useEffect(() => {
    if (!report || loading) return;
    const timer = setTimeout(() => preloadInterstitial(), 2500);
    return () => clearTimeout(timer);
  }, [report, loading]);

  const statusColor =
    report?.relayStatus === 'live'
      ? COLORS.live
      : report?.relayStatus === 'approaching'
        ? COLORS.approaching
        : COLORS.clear;

  if (authLoading && !userKey) {
    return (
      <View style={styles.authGate}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.authGateText}>토스 로그인 연결 중…</Text>
        <Text style={styles.authGateHint}>강수 알림을 받으려면 로그인이 필요해요</Text>
      </View>
    );
  }

  if (!userKey) {
    return (
      <View style={styles.authGate}>
        <Text style={styles.authGateTitle}>토스 로그인이 필요해요</Text>
        <Text style={styles.authGateText}>
          우산챙겨는 강수 알림이 핵심 기능이에요.{'\n'}
          토스 계정으로 로그인해야 알림을 받을 수 있어요.
        </Text>
        {authError ? <Text style={styles.authError}>{authError}</Text> : null}
        <TouchableOpacity style={styles.loginBtn} onPress={login}>
          <Text style={styles.loginBtnText}>토스로 로그인</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
    >
      <Text style={styles.header}>우산챙겨</Text>
      <Text style={styles.subtitle}>비 언제 오고 언제 그치는지</Text>
      <Text style={styles.address}>📍 {activeAddress}</Text>

      <LocationSearch
        placeholder="다른 지역 검색 (예: 부산, 제주, 강릉)"
        onSelect={addSearchedPlace}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
        {locations.map((loc) => (
          <TouchableOpacity
            key={loc.id}
            style={[styles.tab, activeId === loc.id && styles.tabActive]}
            onPress={() => setActiveId(loc.id)}
          >
            <Text style={[styles.tabText, activeId === loc.id && styles.tabTextActive]}>
              {loc.name}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={styles.tab}
          onPress={() => navigateWithAd((r) => navigation.navigate(r), '/settings')}
        >
          <Text style={styles.tabText}>+</Text>
        </TouchableOpacity>
      </ScrollView>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorHint}>
            네트워크 연결을 확인한 뒤 다시 시도해 주세요.
          </Text>
          <TouchableOpacity onPress={reload}>
            <Text style={styles.retry}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {loading && !report ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 24, marginBottom: 8 }} />
          ) : null}
          {report ? (
            <>
              <RelayCard title="● 지금" accent={statusColor}>
                <Text style={styles.main}>{statusLabel(report.relayStatus)}</Text>
                {report.now.precipitating ? (
                  <Text style={styles.value}>
                    {precipLabel(report.now.type)} · 시간당 {report.now.rateMmH} mm
                  </Text>
                ) : (
                  <Text style={styles.value}>강수 없음</Text>
                )}
                <MetaLine text={`${formatTime(report.observedAt)} 관측 · 500m 구역 기준`} />
                {report.detail?.nowObs?.tempC != null && (
                  <Text style={styles.value}>
                    기온 {report.detail.nowObs.tempC}°C
                    {report.detail.nowObs.humidity != null
                      ? ` · 습도 ${report.detail.nowObs.humidity}%`
                      : ''}
                  </Text>
                )}
              </RelayCard>

              <RelayCard title="→ 도달" accent={COLORS.approaching}>
                {report.now.precipitating ? (
                  <Text style={styles.value}>— (이미 내리는 중)</Text>
                ) : report.arrival.willArrive && report.arrival.inMinutes != null ? (
                  <>
                    <Text style={styles.main}>
                      {report.arrival.inMinutes}분 후 {precipLabel(report.arrival.type)} 도달
                    </Text>
                    <Text style={styles.value}>최대 시간당 {report.arrival.peakRateMmH} mm</Text>
                  </>
                ) : (
                  <Text style={styles.value}>1시간 내 도달 없음</Text>
                )}
              </RelayCard>

              <RelayCard title="↓ 종료" accent={COLORS.primary}>
                {report.end.at ? (
                  <>
                    <Text style={styles.main}>약 {formatTime(report.end.at)}</Text>
                    {report.end.remainingMinutes != null && (
                      <Text style={styles.value}>({report.end.remainingMinutes}분 후)</Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.value}>—</Text>
                )}
              </RelayCard>

              <View style={styles.footer}>
                <MetaLine text={`신뢰도 ${report.confidence}%`} />
                {report.terrain?.note ? <MetaLine text={`지형: ${report.terrain.note}`} /> : null}
              </View>

              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => navigateWithAd((r) => navigation.navigate(r), '/timeline')}
              >
                <Text style={styles.linkText}>시간별 중계표 보기 →</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => navigateWithAd((r) => navigation.navigate(r), '/radar')}
              >
                <Text style={styles.linkText}>레이더 영상 보기 →</Text>
              </TouchableOpacity>
            </>
          ) : !loading ? (
            <RelayCard title="● 지금" accent={COLORS.primary}>
              <Text style={styles.value}>아직 표시할 중계 정보가 없어요.</Text>
            </RelayCard>
          ) : null}
        </>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 40 },
  header: { fontSize: 28, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.sub, marginBottom: 8 },
  address: { fontSize: 14, color: COLORS.text, marginBottom: 12, lineHeight: 20 },
  tabs: { flexDirection: 'row', marginBottom: 16 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#E8EEF4',
    marginRight: 8,
  },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { color: COLORS.sub, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  main: { fontSize: 22, fontWeight: '700', color: COLORS.text },
  value: { fontSize: 16, color: COLORS.text, marginTop: 4 },
  footer: { marginTop: 8, gap: 4 },
  linkBtn: { marginTop: 16, alignItems: 'center' },
  linkText: { color: COLORS.primary, fontWeight: '600', fontSize: 15 },
  errorBox: {
    backgroundColor: '#FFF5F5',
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
  },
  errorText: { color: '#E53E3E', fontWeight: '600' },
  errorHint: { color: COLORS.sub, fontSize: 12, marginTop: 8 },
  retry: { color: COLORS.primary, marginTop: 12, fontWeight: '600' },
  authGate: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  authGateTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  authGateText: {
    fontSize: 14,
    color: COLORS.sub,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  authGateHint: { fontSize: 13, color: COLORS.sub, marginTop: 12, textAlign: 'center' },
  authError: { fontSize: 13, color: '#E53E3E', marginTop: 12, textAlign: 'center' },
  loginBtn: {
    marginTop: 20,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  loginBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
