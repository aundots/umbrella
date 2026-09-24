import { InlineAd } from '@apps-in-toss/framework';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BANNER_AD_GROUP_ID } from '../config';
import { SPACING } from '../theme';

/** 앱인토스 이미지형(피드형) 배너 — 홈 등 스크롤 영역에 삽입 */
export function BannerAd() {
  if (!BANNER_AD_GROUP_ID) return null;

  return (
    <View style={styles.wrap}>
      <InlineAd
        adGroupId={BANNER_AD_GROUP_ID}
        theme="auto"
        tone="grey"
        variant="card"
        impressFallbackOnMount
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: SPACING.section,
    overflow: 'hidden',
  },
});
