import React from 'react';
import { ScrollView } from 'react-native';
import { useNavigation } from '@granite-js/react-native';
import { navigateWithAd } from '../src/ads/navigateWithAd';
import { RadarPanel } from '../src/components/RadarPanel';
import { BackLink, NavLink } from '../src/components/ui';
import { sharedStyles } from '../src/theme';

export default function RadarScreen() {
  const navigation = useNavigation();

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.content}>
      <BackLink onPress={() => navigation.navigate('/')} />
      <RadarPanel />
      <NavLink
        label="시간별 중계표 보기"
        onPress={() => navigateWithAd((r) => navigation.navigate(r), '/timeline')}
      />
    </ScrollView>
  );
}
