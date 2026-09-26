import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { useNavigation } from '@granite-js/react-native';
import { RadarPanel } from '../src/components/RadarPanel';
import { NavLink } from '../src/components/ui';
import { useNavigationAccessory } from '../src/hooks/useNavigationAccessory';
import { useScreenContentStyle } from '../src/hooks/useScreenContentStyle';
import { useTossHeader } from '../src/hooks/useTossHeader';
import { TOSS_SCREEN_OPTIONS } from '../src/navigation/screenOptions';
import { sharedStyles } from '../src/theme';

function RadarScreen() {
  useTossHeader();
  useNavigationAccessory();
  const navigation = useNavigation();
  const [radarGesturing, setRadarGesturing] = useState(false);
  const contentStyle = useScreenContentStyle();

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={contentStyle}
      scrollEnabled={!radarGesturing}
      nestedScrollEnabled
    >
      <RadarPanel onGestureActive={setRadarGesturing} />
      <NavLink
        label="시간별 중계표 보기"
        onPress={() => navigation.navigate('/timeline')}
      />
    </ScrollView>
  );
}

RadarScreen.screenOptions = TOSS_SCREEN_OPTIONS;

export default RadarScreen;
