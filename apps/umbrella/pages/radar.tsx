import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { useNavigation } from '@granite-js/react-native';
import { RadarPanel } from '../src/components/RadarPanel';
import { BackLink, NavLink } from '../src/components/ui';
import { sharedStyles } from '../src/theme';

export default function RadarScreen() {
  const navigation = useNavigation();
  const [radarGesturing, setRadarGesturing] = useState(false);

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.content}
      scrollEnabled={!radarGesturing}
      nestedScrollEnabled
    >
      <BackLink onPress={() => navigation.navigate('/')} />
      <RadarPanel onGestureActive={setRadarGesturing} />
      <NavLink
        label="시간별 중계표 보기"
        onPress={() => navigation.navigate('/timeline')}
      />
    </ScrollView>
  );
}
