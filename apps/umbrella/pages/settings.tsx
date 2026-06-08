import { Accuracy, useGeolocation } from '@apps-in-toss/framework';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@granite-js/react-native';
import { COLORS } from '../src/components/RelayCard';
import { USER_KEY } from '../src/config';
import { useLocations } from '../src/hooks/useLocations';
import {
  deleteLocation,
  registerUser,
  saveLocation,
  SavedLocation,
} from '../src/services/api';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { locations, reload } = useLocations();
  const geo = useGeolocation({
    accuracy: Accuracy.Balanced,
    timeInterval: 30_000,
    distanceInterval: 50,
  });
  const [notify, setNotify] = useState(true);
  const [beforeMin, setBeforeMin] = useState<30 | 60>(30);
  const [name, setName] = useState('');
  const [lat, setLat] = useState('37.4979');
  const [lng, setLng] = useState('127.0276');

  useEffect(() => {
    registerUser(USER_KEY, notify);
  }, [notify]);

  const saved = locations.filter((l) => l.id !== 'current');

  const onUseCurrentLocation = () => {
    if (!geo) {
      Alert.alert('위치 확인 중', 'GPS 신호를 받는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    setLat(String(geo.coords.latitude));
    setLng(String(geo.coords.longitude));
    Alert.alert('적용됨', '현재 위치 좌표가 입력되었습니다.');
  };

  const onAdd = async () => {
    if (!name.trim()) {
      Alert.alert('이름을 입력해 주세요');
      return;
    }
    const latN = Number(lat);
    const lngN = Number(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      Alert.alert('위도·경도를 확인해 주세요');
      return;
    }
    try {
      await saveLocation(USER_KEY, {
        name: name.trim(),
        lat: latN,
        lng: lngN,
        notifyEnabled: notify,
        notifyBeforeMin: beforeMin,
      });
      setName('');
      await reload();
      Alert.alert('저장됨', `${name} 위치가 추가되었습니다.`);
    } catch {
      Alert.alert('저장 실패', '최대 5곳까지 등록할 수 있습니다.');
    }
  };

  const onDelete = async (loc: SavedLocation) => {
    await deleteLocation(USER_KEY, loc.id);
    await reload();
  };

  const goBack = () => {
    navigation.navigate('/');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={goBack}>
        <Text style={styles.back}>← 돌아가기</Text>
      </TouchableOpacity>
      <Text style={styles.title}>설정</Text>

      <View style={styles.row}>
        <Text style={styles.label}>강수 알림</Text>
        <Switch value={notify} onValueChange={setNotify} />
      </View>

      <Text style={styles.section}>알림 시점</Text>
      <View style={styles.row}>
        {[30, 60].map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.chip, beforeMin === m && styles.chipActive]}
            onPress={() => setBeforeMin(m as 30 | 60)}
          >
            <Text style={[styles.chipText, beforeMin === m && styles.chipTextActive]}>
              {m}분 전
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.section}>즐겨찾기 추가</Text>
      <TouchableOpacity style={styles.gpsBtn} onPress={onUseCurrentLocation}>
        <Text style={styles.gpsBtnText}>현재 위치 좌표 가져오기</Text>
      </TouchableOpacity>
      <TextInput
        style={styles.input}
        placeholder="이름 (집, 회사…)"
        value={name}
        onChangeText={setName}
      />
      <View style={styles.coordRow}>
        <TextInput
          style={[styles.input, styles.coord]}
          placeholder="위도"
          value={lat}
          onChangeText={setLat}
          keyboardType="decimal-pad"
        />
        <TextInput
          style={[styles.input, styles.coord]}
          placeholder="경도"
          value={lng}
          onChangeText={setLng}
          keyboardType="decimal-pad"
        />
      </View>
      <TouchableOpacity style={styles.addBtn} onPress={onAdd}>
        <Text style={styles.addBtnText}>위치 추가</Text>
      </TouchableOpacity>

      {saved.length > 0 && (
        <>
          <Text style={styles.section}>등록된 위치</Text>
          {saved.map((loc) => (
            <View key={loc.id} style={styles.locRow}>
              <View>
                <Text style={styles.locName}>{loc.name}</Text>
                <Text style={styles.locCoord}>
                  {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => onDelete(loc)}>
                <Text style={styles.delete}>삭제</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      <View style={styles.info}>
        <Text style={styles.infoText}>
          API: {USER_KEY}{'\n'}
          토스 출시 시 userKey·GPS·푸시(mTLS) 연동 예정
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 40 },
  back: { color: COLORS.primary, marginBottom: 12, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  label: { fontSize: 16, color: COLORS.text, fontWeight: '600' },
  section: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.sub,
    marginTop: 16,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#E8EEF4',
    marginRight: 8,
  },
  chipActive: { backgroundColor: COLORS.primary },
  chipText: { color: COLORS.sub, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  gpsBtn: {
    backgroundColor: '#EEF4FB',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  gpsBtnText: { color: COLORS.primary, fontWeight: '700' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    fontSize: 16,
  },
  coordRow: { flexDirection: 'row', gap: 10 },
  coord: { flex: 1 },
  addBtn: {
    backgroundColor: COLORS.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  locRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  locName: { fontWeight: '700', color: COLORS.text },
  locCoord: { fontSize: 12, color: COLORS.sub, marginTop: 2 },
  delete: { color: '#E53E3E', fontWeight: '600' },
  info: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#EEF4FB',
    borderRadius: 12,
  },
  infoText: { fontSize: 13, color: COLORS.sub, lineHeight: 20 },
});
