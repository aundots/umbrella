import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@granite-js/react-native';
import { Button, Txt } from '@toss/tds-react-native';
import { preloadInterstitial } from '../src/ads/interstitial';
import { BannerAd } from '../src/ads/BannerAd';
import { useAuth } from '../src/auth/AuthContext';
import { COLORS, MetaLine, RelayCard } from '../src/components/RelayCard';
import { LocationSearch } from '../src/components/LocationSearch';
import { Chip, ErrorBanner, NavLink } from '../src/components/ui';
import { RadarPanel } from '../src/components/RadarPanel';
import { useLocations, useRelay } from '../src/hooks/useLocations';
import { useTossHeader } from '../src/hooks/useTossHeader';
import { TOSS_SCREEN_OPTIONS } from '../src/navigation/screenOptions';
import { sharedStyles, SPACING } from '../src/theme';
import {
  dataSourceLabel,
  formatTime,
  precipLabel,
  statusLabel,
} from '../src/services/api';

function HomeScreen() {
  useTossHeader();
  const navigation = useNavigation();
  const { userKey, loading: authLoading, error: authError, login } = useAuth();
  const { locations, active, activeId, activeAddress, setActiveId, addSearchedPlace } =
    useLocations();
  const { report, loading, error, reload } = useRelay();
  const [radarGesturing, setRadarGesturing] = useState(false);

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
        <Txt typography="t5" fontWeight="semibold" color={COLORS.text} style={styles.authTitle}>
          토스 로그인 연결 중…
        </Txt>
        <Txt typography="t6" color={COLORS.sub} style={styles.authHint}>
          강수 알림을 받으려면 로그인이 필요해요
        </Txt>
      </View>
    );
  }

  if (!userKey) {
    return (
      <View style={styles.authGate}>
        <Txt typography="t3" fontWeight="bold" color={COLORS.text}>
          토스 로그인이 필요해요
        </Txt>
        <Txt typography="t6" color={COLORS.sub} style={styles.authBody}>
          우산챙겨는 강수 알림이 핵심 기능이에요.{'\n'}
          토스 계정으로 로그인해야 알림을 받을 수 있어요.
        </Txt>
        {authError ? (
          <Txt typography="t7" color={COLORS.danger} style={styles.authError}>
            {authError}
          </Txt>
        ) : null}
        <Button display="block" onPress={login} viewStyle={styles.loginBtn}>
          토스로 로그인
        </Button>
      </View>
    );
  }

  return (
    <View style={sharedStyles.screen}>
      <ScrollView
        style={sharedStyles.screen}
        contentContainerStyle={sharedStyles.content}
        scrollEnabled={!radarGesturing}
        nestedScrollEnabled
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
      >
        <Txt typography="t6" color={COLORS.text} style={styles.address}>
          📍 {activeAddress}
        </Txt>

        <LocationSearch
          placeholder="다른 지역 검색 (예: 부산, 제주, 강릉)"
          onSelect={addSearchedPlace}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
          {locations.map((loc) => (
            <Chip
              key={loc.id}
              label={loc.name}
              active={activeId === loc.id}
              onPress={() => setActiveId(loc.id)}
              compact
            />
          ))}
        </ScrollView>

        {error ? (
          <ErrorBanner
            message={error}
            hint="네트워크 연결을 확인한 뒤 다시 시도해 주세요."
            onRetry={reload}
          />
        ) : (
          <>
            {loading && !report ? (
              <ActivityIndicator
                size="large"
                color={COLORS.primary}
                style={styles.loader}
              />
            ) : null}
            {report ? (
              <>
                <RelayCard title="지금" accent={statusColor}>
                  <Txt typography="t3" fontWeight="bold" color={COLORS.text}>
                    {statusLabel(report.relayStatus)}
                  </Txt>
                  {report.now.precipitating ? (
                    <Txt typography="t5" color={COLORS.text} style={styles.value}>
                      {precipLabel(report.now.type)} · 시간당 {report.now.rateMmH} mm
                    </Txt>
                  ) : (
                    <Txt typography="t5" color={COLORS.text} style={styles.value}>
                      강수 없음
                    </Txt>
                  )}
                  <MetaLine
                    text={`${formatTime(report.observedAt)} 관측 · ${report.spatial.resolutionM}m · ${dataSourceLabel(report.spatial.dataSource)}`}
                  />
                  {report.detail?.nowObs?.tempC != null && (
                    <Txt typography="t5" color={COLORS.text} style={styles.value}>
                      기온 {report.detail.nowObs.tempC}°C
                      {report.detail.nowObs.humidity != null
                        ? ` · 습도 ${report.detail.nowObs.humidity}%`
                        : ''}
                    </Txt>
                  )}
                </RelayCard>

                <RelayCard title="도달" accent={COLORS.approaching}>
                  {report.now.precipitating ? (
                    <Txt typography="t5" color={COLORS.sub}>
                      — (이미 내리는 중)
                    </Txt>
                  ) : report.arrival.willArrive && report.arrival.inMinutes != null ? (
                    <>
                      <Txt typography="t4" fontWeight="bold" color={COLORS.text}>
                        {report.arrival.inMinutes}분 후 {precipLabel(report.arrival.type)} 도달
                      </Txt>
                      <Txt typography="t5" color={COLORS.text} style={styles.value}>
                        최대 시간당 {report.arrival.peakRateMmH} mm
                      </Txt>
                    </>
                  ) : (
                    <Txt typography="t5" color={COLORS.text}>
                      1시간 내 도달 없음
                    </Txt>
                  )}
                </RelayCard>

                <RelayCard title="종료" accent={report.end.soon ? COLORS.approaching : COLORS.primary}>
                  {report.end.at ? (
                    <>
                      <Txt typography="t4" fontWeight="bold" color={COLORS.text}>
                        {report.end.soon ? '곧 그침 · ' : ''}약 {formatTime(report.end.at)}
                      </Txt>
                      {report.end.remainingMinutes != null && (
                        <Txt typography="t5" color={COLORS.sub} style={styles.value}>
                          ({report.end.remainingMinutes}분 후)
                        </Txt>
                      )}
                    </>
                  ) : (
                    <Txt typography="t5" color={COLORS.sub}>
                      —
                    </Txt>
                  )}
                </RelayCard>

                <View style={styles.footer}>
                  <MetaLine text={`신뢰도 ${report.confidence}%`} />
                  {report.terrain?.note ? (
                    <MetaLine text={`지형: ${report.terrain.note}`} />
                  ) : null}
                </View>

                <NavLink
                  label="시간별 중계표 보기"
                  onPress={() => navigation.navigate('/timeline')}
                />
              </>
            ) : !loading ? (
              <RelayCard title="지금" accent={COLORS.primary}>
                <Txt typography="t5" color={COLORS.sub}>
                  아직 표시할 중계 정보가 없어요.
                </Txt>
              </RelayCard>
            ) : null}
          </>
        )}

        <RadarPanel onGestureActive={setRadarGesturing} />
        <BannerAd />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  address: { marginBottom: 16, lineHeight: 22 },
  tabs: { flexDirection: 'row', marginBottom: 20 },
  value: { marginTop: 4 },
  footer: { marginTop: 4, gap: 4 },
  loader: { marginTop: 32, marginBottom: 8 },
  authGate: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.screenH,
  },
  authTitle: { marginTop: 16 },
  authBody: { textAlign: 'center', marginTop: 12, lineHeight: 24 },
  authHint: { marginTop: 12, textAlign: 'center' },
  authError: { marginTop: 12, textAlign: 'center' },
  loginBtn: { marginTop: 24, width: '100%', maxWidth: 280 },
});

HomeScreen.screenOptions = TOSS_SCREEN_OPTIONS;

export default HomeScreen;
