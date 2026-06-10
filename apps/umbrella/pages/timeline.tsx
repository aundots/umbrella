import React from 'react';

import {

  ActivityIndicator,

  ScrollView,

  StyleSheet,

  View,

} from 'react-native';

import { Txt } from '@toss/tds-react-native';

import { COLORS } from '../src/components/RelayCard';

import { Card, SectionHeader } from '../src/components/ui';

import { useLocations, useRelay } from '../src/hooks/useLocations';

import { sharedStyles, RADIUS, SPACING } from '../src/theme';

import { formatTime, precipLabel } from '../src/services/api';



function DetailRow({ label, value }: { label: string; value: string }) {

  return (

    <View style={styles.detailRow}>

      <Txt typography="t6" color={COLORS.sub}>

        {label}

      </Txt>

      <Txt typography="t6" fontWeight="semibold" color={COLORS.text}>

        {value}

      </Txt>

    </View>

  );

}



export default function TimelineScreen() {

  const { active } = useLocations();

  const { report, loading, error } = useRelay();



  const detail = report?.detail;

  const vilageHours = detail?.vilageHourly?.slice(0, 12) ?? [];



  return (

    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.content}>

      <Txt typography="t2" fontWeight="bold" color={COLORS.text}>

        시간별 중계표

      </Txt>

      <Txt typography="t7" color={COLORS.sub} style={styles.sub}>

        {active.name} · 초단기·동네예보

      </Txt>



      {error ? (

        <Txt typography="t6" color={COLORS.danger} style={styles.error}>

          {error}

        </Txt>

      ) : null}



      {loading && !report ? (

        <ActivityIndicator color={COLORS.primary} style={styles.loader} />

      ) : (

        <>

          {detail?.nowObs && (

            <Card style={styles.nowCard}>

              <Txt typography="t5" fontWeight="bold" color={COLORS.text} style={styles.cardTitle}>

                현재 관측

              </Txt>

              {detail.nowObs.tempC != null && (

                <DetailRow label="기온" value={`${detail.nowObs.tempC}°C`} />

              )}

              {detail.nowObs.humidity != null && (

                <DetailRow label="습도" value={`${detail.nowObs.humidity}%`} />

              )}

              {detail.nowObs.sky ? <DetailRow label="하늘" value={detail.nowObs.sky} /> : null}

            </Card>

          )}



          <SectionHeader title="10분 간격 중계" description="향후 1시간" />

          <View style={styles.grid}>

            {report?.timeline.map((slot) => {

              const ultra = detail?.ultraHourly.find(

                (h) =>

                  Math.abs(new Date(h.at).getTime() - Date.now() - slot.offsetMin * 60000) <

                  8 * 60000,

              );

              const hasRain = slot.type !== 'none' && slot.rateMmH > 0;

              return (

                <View

                  key={slot.offsetMin}

                  style={[styles.slot, hasRain && styles.slotRain]}

                >

                  <Txt typography="t7" fontWeight="semibold" color={COLORS.sub}>

                    {slot.offsetMin === 0 ? '지금' : `+${slot.offsetMin}분`}

                  </Txt>

                  {hasRain ? (

                    <>

                      <Txt typography="t5" fontWeight="bold" color={COLORS.text} style={styles.slotMain}>

                        {precipLabel(slot.type)}

                      </Txt>

                      <Txt typography="t7" fontWeight="semibold" color={COLORS.primary}>

                        {slot.rateMmH} mm/h

                      </Txt>

                    </>

                  ) : (

                    <Txt typography="t6" color={COLORS.sub} style={styles.slotMain}>

                      없음

                    </Txt>

                  )}

                  {ultra?.tempC != null && (

                    <Txt typography="t7" fontWeight="semibold" color={COLORS.text} style={styles.extra}>

                      {ultra.tempC}°

                    </Txt>

                  )}

                  {ultra?.sky ? (

                    <Txt typography="t7" color={COLORS.sub}>

                      {ultra.sky}

                    </Txt>

                  ) : null}

                </View>

              );

            })}

          </View>



          {detail?.vilageAvailable && vilageHours.length > 0 ? (

            <>

              <SectionHeader title="동네예보" description="시간별" />

              {vilageHours.map((h) => (

                <View key={h.at} style={styles.hourRow}>

                  <Txt typography="t6" fontWeight="bold" color={COLORS.primary} style={styles.hourTime}>

                    {formatTime(h.at)}

                  </Txt>

                  <View style={styles.hourBody}>

                    <Txt typography="t6" fontWeight="semibold" color={COLORS.text}>

                      {h.sky ?? '—'} · {precipLabel(h.type)}

                      {h.pop != null ? ` · ${h.pop}%` : ''}

                    </Txt>

                    <Txt typography="t7" color={COLORS.sub} style={styles.hourSub}>

                      {h.tempC != null ? `${h.tempC}°C` : ''}

                      {h.humidity != null ? ` · 습도 ${h.humidity}%` : ''}

                      {h.windMs != null ? ` · 바람 ${h.windMs}m/s` : ''}

                      {h.pcp && h.pcp !== '없음' && h.pcp !== '강수없음' ? ` · ${h.pcp}` : ''}

                    </Txt>

                  </View>

                </View>

              ))}

            </>

          ) : (

            <Txt typography="t7" color={COLORS.sub} style={styles.hint}>

              동네예보는 공공데이터포털에서 「동네예보 조회서비스」 활용신청 후 표시돼요.

            </Txt>

          )}

        </>

      )}

    </ScrollView>

  );

}



const styles = StyleSheet.create({

  sub: { marginTop: 4, marginBottom: SPACING.section },

  loader: { marginTop: 32 },

  error: { marginTop: 16, lineHeight: 22 },

  nowCard: { marginBottom: SPACING.section },

  cardTitle: { marginBottom: 8 },

  detailRow: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    marginTop: 8,

  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  slot: {

    width: '30%',

    backgroundColor: COLORS.card,

    borderRadius: RADIUS.sm,

    padding: 12,

    alignItems: 'center',

    minWidth: 100,

  },

  slotRain: {

    backgroundColor: COLORS.weakBlue,

  },

  slotMain: { marginTop: 8 },

  extra: { marginTop: 4 },

  hourRow: {

    flexDirection: 'row',

    backgroundColor: COLORS.card,

    borderRadius: RADIUS.sm,

    padding: 14,

    marginBottom: 8,

    gap: 12,

  },

  hourTime: { minWidth: 44 },

  hourBody: { flex: 1 },

  hourSub: { marginTop: 4, lineHeight: 18 },

  hint: { marginTop: 16, lineHeight: 20 },

});


