import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@granite-js/react-native';
import { COLORS } from '../src/components/RelayCard';
import { useNavigationAccessory } from '../src/hooks/useNavigationAccessory';
import { useScreenTopInset } from '../src/hooks/useScreenContentStyle';
import { useTossHeader } from '../src/hooks/useTossHeader';
import { TOSS_SCREEN_OPTIONS } from '../src/navigation/screenOptions';

function NotFoundScreen() {
  useTossHeader();
  useNavigationAccessory();
  const navigation = useNavigation();
  const topInset = useScreenTopInset();

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <Text style={styles.title}>페이지를 찾을 수 없어요</Text>
      <Text style={styles.sub}>요청한 화면이 존재하지 않습니다.</Text>
      <Text style={styles.link} onPress={() => navigation.navigate('/')}>
        홈으로 돌아가기
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  sub: { fontSize: 14, color: COLORS.sub, marginTop: 8 },
  link: { fontSize: 15, color: COLORS.primary, marginTop: 20, fontWeight: '600' },
});

NotFoundScreen.screenOptions = TOSS_SCREEN_OPTIONS;

export default NotFoundScreen;
