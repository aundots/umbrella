import { Accuracy, useGeolocation } from '@apps-in-toss/framework';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { LocationSearch } from '../src/components/LocationSearch';
import { COLORS } from '../src/components/RelayCard';
import { useAuth } from '../src/auth/AuthContext';
import { useLocations } from '../src/hooks/useLocations';
import {
  deleteLocation,
  fetchRelay,
  LiveRelayReport,
  rainChanceAtMinute,
  registerUser,
  saveLocation,
  SavedLocation,
  sendTestPush,
  updateLocationApi,
} from '../src/services/api';
import { GeocodePlace, reverseGeocode } from '../src/services/geocode';
import { requestRainNotificationAgreement } from '../src/notify/agreement';

const NAME_PRESETS = ['집', '회사'] as const;

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { userKey, login } = useAuth();
  const { locations, reload } = useLocations();
  const geo = useGeolocation({
    accuracy: Accuracy.Balanced,
    timeInterval: 30_000,
    distanceInterval: 50,
  });
  const [notify, setNotify] = useState(true);
  const [beforeMin, setBeforeMin] = useState<30 | 60>(30);
  const [name, setName] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<GeocodePlace | null>(null);
  const [pushTesting, setPushTesting] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [previewReport, setPreviewReport] = useState<LiveRelayReport | null>(null);
  const [addressById, setAddressById] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPlace, setEditPlace] = useState<GeocodePlace | null>(null);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const previewCoords = useMemo(() => {
    if (selectedPlace) return { lat: selectedPlace.lat, lng: selectedPlace.lng };
    if (geo) return { lat: geo.coords.latitude, lng: geo.coords.longitude };
    return null;
  }, [selectedPlace, geo]);

  useEffect(() => {
    if (userKey) registerUser(userKey, notify);
  }, [notify, userKey]);

  const onNotifyToggle = (next: boolean) => {
    if (!next) {
      setNotify(false);
      return;
    }
    if (!userKey) {
      Alert.alert('로그인 필요', '알림을 켜려면 토스 로그인이 필요해요.', [
        { text: '취소', style: 'cancel' },
        { text: '로그인', onPress: login },
      ]);
      return;
    }

    requestRainNotificationAgreement((outcome) => {
      if (outcome === 'agreed') {
        setNotify(true);
        return;
      }
      setNotify(false);
      if (outcome === 'rejected') {
        Alert.alert('알림 미동의', '강수 알림을 받으려면 동의가 필요해요.');
      } else if (outcome === 'unsupported') {
        Alert.alert(
          '알림 동의 준비 중',
          '앱 업데이트 후 알림 동의문이 표시돼요. 콘솔에 알림 동의문을 등록했는지 확인해 주세요.',
        );
      } else {
        Alert.alert('오류', '알림 동의 요청에 실패했어요. 잠시 후 다시 시도해 주세요.');
      }
    });
  };

  useEffect(() => {
    if (!previewCoords) {
      setPreviewReport(null);
      return;
    }

    let cancelled = false;
    fetchRelay(previewCoords.lat, previewCoords.lng, '미리보기')
      .then((report) => {
        if (!cancelled) setPreviewReport(report);
      })
      .catch(() => {
        if (!cancelled) setPreviewReport(null);
      });

    return () => {
      cancelled = true;
    };
  }, [previewCoords?.lat, previewCoords?.lng]);

  const saved = locations.filter((l) => l.id !== 'current' && !l.id.startsWith('session-'));

  useEffect(() => {
    saved.forEach((loc) => {
      if (loc.address) {
        setAddressById((prev) => ({ ...prev, [loc.id]: loc.address! }));
        return;
      }
      if (addressById[loc.id]) return;

      reverseGeocode(loc.lat, loc.lng)
        .then((place) => {
          setAddressById((prev) => ({ ...prev, [loc.id]: place.address }));
        })
        .catch(() => {
          setAddressById((prev) => ({ ...prev, [loc.id]: '주소를 불러오지 못했어요' }));
        });
    });
  }, [saved]);

  const chipLabel = (minutes: 30 | 60) => {
    if (!previewReport) return `${minutes}분 전`;
    return `${minutes}분 전 (${rainChanceAtMinute(previewReport, minutes)}%)`;
  };

  const clearAddForm = () => {
    setSelectedPlace(null);
    setName('');
  };

  const onUseCurrentLocation = async () => {
    if (!geo) {
      Alert.alert('위치 확인 중', 'GPS 신호를 받는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    setGeoLoading(true);
    try {
      const place = await reverseGeocode(geo.coords.latitude, geo.coords.longitude);
      cancelEdit();
      setSelectedPlace({
        name: place.address,
        address: place.address,
        lat: geo.coords.latitude,
        lng: geo.coords.longitude,
      });
      setName('');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      Alert.alert('주소 확인 실패', '잠시 후 다시 시도해 주세요.');
    } finally {
      setGeoLoading(false);
    }
  };

  const onSelectPlace = (place: GeocodePlace) => {
    cancelEdit();
    setSelectedPlace(place);
    setName('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const onAdd = async () => {
    if (!name.trim()) {
      Alert.alert('이름을 입력해 주세요', '저장할 위치의 별명을 입력해 주세요.');
      return;
    }
    if (!selectedPlace) {
      Alert.alert('지역을 검색해서 선택해 주세요');
      return;
    }
    try {
      if (!userKey) {
        Alert.alert('로그인 필요', '토스 로그인 후 저장할 수 있어요.', [
          { text: '취소', style: 'cancel' },
          { text: '로그인', onPress: login },
        ]);
        return;
      }
      setSaving(true);
      const savedName = name.trim();
      await saveLocation(userKey, {
        name: savedName,
        lat: selectedPlace.lat,
        lng: selectedPlace.lng,
        address: selectedPlace.address,
        notifyEnabled: notify,
        notifyBeforeMin: beforeMin,
      });
      clearAddForm();
      await reload();
      Alert.alert('저장됨', `「${savedName}」 위치가 추가되었습니다.`);
    } catch {
      Alert.alert('저장 실패', '최대 5곳까지 등록할 수 있습니다.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (loc: SavedLocation) => {
    clearAddForm();
    setEditingId(loc.id);
    setEditName(loc.name);
    setEditPlace({
      name: loc.name,
      address: loc.address ?? addressById[loc.id] ?? '',
      lat: loc.lat,
      lng: loc.lng,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditPlace(null);
  };

  const onSaveEdit = async () => {
    if (!editingId || !editPlace) return;
    if (!editName.trim()) {
      Alert.alert('이름을 입력해 주세요');
      return;
    }
    if (!userKey) return;

    setSaving(true);
    try {
      await updateLocationApi(userKey, editingId, {
        name: editName.trim(),
        lat: editPlace.lat,
        lng: editPlace.lng,
        address: editPlace.address,
      });
      cancelEdit();
      await reload();
      Alert.alert('수정됨', '위치 정보가 업데이트되었습니다.');
    } catch {
      Alert.alert('수정 실패', '잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (loc: SavedLocation) => {
    if (!userKey) return;
    Alert.alert('위치 삭제', `「${loc.name}」을(를) 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await deleteLocation(userKey, loc.id);
          if (editingId === loc.id) cancelEdit();
          await reload();
        },
      },
    ]);
  };

  const onTestPush = async (kind: 'rain' | 'clear') => {
    if (!userKey) {
      Alert.alert('로그인 필요', '토스 로그인 후 테스트할 수 있어요.');
      return;
    }
    setPushTesting(true);
    try {
      await sendTestPush(userKey, kind);
      Alert.alert(
        '테스트 발송',
        kind === 'clear'
          ? '비 그침 테스트 요청을 보냈어요. 토스 앱 알림을 확인해 주세요.'
          : '비 예고 테스트 요청을 보냈어요. 토스 앱 알림을 확인해 주세요.',
      );
    } catch (e) {
      Alert.alert(
        '테스트 실패',
        e instanceof Error ? e.message : '템플릿 승인·TOSS_PUSH_TEMPLATE_CODE 설정을 확인해 주세요.',
      );
    } finally {
      setPushTesting(false);
    }
  };

  const goBack = () => {
    navigation.navigate('/');
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <TouchableOpacity onPress={goBack}>
        <Text style={styles.back}>← 돌아가기</Text>
      </TouchableOpacity>
      <Text style={styles.title}>설정</Text>

      <View style={styles.row}>
        <Text style={styles.label}>강수 알림</Text>
        <Switch value={notify} onValueChange={onNotifyToggle} />
      </View>

      {userKey ? (
        <>
          <TouchableOpacity
            style={[styles.testPushBtn, pushTesting && styles.testPushBtnDisabled]}
            onPress={() => onTestPush('rain')}
            disabled={pushTesting}
          >
            <Text style={styles.testPushBtnText}>
              {pushTesting ? '테스트 발송 중…' : '비 예고 테스트'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.testPushBtn, pushTesting && styles.testPushBtnDisabled]}
            onPress={() => onTestPush('clear')}
            disabled={pushTesting}
          >
            <Text style={styles.testPushBtnText}>비 그침 테스트</Text>
          </TouchableOpacity>
        </>
      ) : null}

      <Text style={styles.section}>알림 시점</Text>
      <Text style={styles.sectionHint}>선택 위치 기준 강수 가능성</Text>
      <View style={styles.chipRow}>
        {([30, 60] as const).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.chip, beforeMin === m && styles.chipActive]}
            onPress={() => setBeforeMin(m)}
          >
            <Text style={[styles.chipText, beforeMin === m && styles.chipTextActive]}>
              {chipLabel(m)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.section}>즐겨찾기 추가</Text>
      <Text style={styles.sectionHint}>주소를 검색해 선택한 뒤, 저장할 이름을 입력하세요</Text>

      <View style={styles.savePanel}>
        <Text style={styles.nameLabel}>주소 검색</Text>
        <LocationSearch placeholder="지역 검색 (예: 강남역, 해운대)" onSelect={onSelectPlace} />

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>또는</Text>
          <View style={styles.orLine} />
        </View>

        <TouchableOpacity
          style={[styles.gpsBtn, geoLoading && styles.gpsBtnDisabled]}
          onPress={onUseCurrentLocation}
          disabled={geoLoading}
        >
          {geoLoading ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : (
            <Text style={styles.gpsBtnText}>현재 위치 사용</Text>
          )}
        </TouchableOpacity>

        <View style={styles.panelDivider} />

        <Text style={styles.selectedLabel}>선택된 주소</Text>
        <Text style={[styles.selectedAddress, !selectedPlace && styles.selectedPlaceholder]}>
          {selectedPlace?.address ?? '검색 결과를 선택하면 주소가 표시됩니다'}
        </Text>

        <Text style={styles.nameLabel}>저장할 이름</Text>
        <View style={styles.presetRow}>
          {NAME_PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset}
              style={[styles.presetChip, name === preset && styles.presetChipActive]}
              onPress={() => setName(preset)}
            >
              <Text style={[styles.presetText, name === preset && styles.presetTextActive]}>
                {preset}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder="예: 학교, 할머니 댁"
          value={name}
          onChangeText={setName}
        />

        <TouchableOpacity
          style={[
            styles.addBtn,
            (!selectedPlace || !name.trim() || saving) && styles.btnDisabled,
          ]}
          onPress={onAdd}
          disabled={!selectedPlace || !name.trim() || saving}
        >
          <Text style={styles.addBtnText}>{saving ? '저장 중…' : '위치 저장'}</Text>
        </TouchableOpacity>
        {selectedPlace ? (
          <TouchableOpacity style={styles.cancelBtn} onPress={clearAddForm}>
            <Text style={styles.cancelBtnText}>선택 취소</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {saved.length > 0 && (
        <>
          <Text style={styles.section}>등록된 위치</Text>
          {saved.map((loc) => (
            <View key={loc.id}>
              {editingId === loc.id && editPlace ? (
                <View style={styles.editPanel}>
                  <Text style={styles.editTitle}>위치 수정</Text>

                  <Text style={styles.nameLabel}>저장할 이름</Text>
                  <View style={styles.presetRow}>
                    {NAME_PRESETS.map((preset) => (
                      <TouchableOpacity
                        key={preset}
                        style={[styles.presetChip, editName === preset && styles.presetChipActive]}
                        onPress={() => setEditName(preset)}
                      >
                        <Text
                          style={[
                            styles.presetText,
                            editName === preset && styles.presetTextActive,
                          ]}
                        >
                          {preset}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="예: 학교, 할머니 댁"
                    value={editName}
                    onChangeText={setEditName}
                  />

                  <Text style={styles.nameLabel}>주소 검색으로 변경</Text>
                  <LocationSearch
                    placeholder="새 주소 검색 (예: 부산 해운대)"
                    onSelect={(place) => setEditPlace(place)}
                  />
                  <Text style={styles.editCurrentAddress}>
                    선택된 주소: {editPlace.address || '주소 확인 중…'}
                  </Text>

                  <TouchableOpacity
                    style={[styles.addBtn, saving && styles.btnDisabled]}
                    onPress={onSaveEdit}
                    disabled={saving}
                  >
                    <Text style={styles.addBtnText}>{saving ? '저장 중…' : '변경 저장'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={cancelEdit}>
                    <Text style={styles.cancelBtnText}>취소</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.locRow}>
                  <View style={styles.locInfo}>
                    <Text style={styles.locName}>{loc.name}</Text>
                    <Text style={styles.locCoord} numberOfLines={2}>
                      {loc.address ?? addressById[loc.id] ?? '주소 확인 중…'}
                    </Text>
                  </View>
                  <View style={styles.locActions}>
                    <TouchableOpacity onPress={() => startEdit(loc)}>
                      <Text style={styles.edit}>수정</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => onDelete(loc)}>
                      <Text style={styles.delete}>삭제</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))}
        </>
      )}
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
  testPushBtn: {
    backgroundColor: '#EEF4FB',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  testPushBtnDisabled: { opacity: 0.6 },
  testPushBtnText: { color: COLORS.primary, fontWeight: '700' },
  section: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.sub,
    marginTop: 16,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: COLORS.sub,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#E8EEF4',
  },
  chipActive: { backgroundColor: COLORS.primary },
  chipText: { color: COLORS.sub, fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: '#fff' },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    gap: 10,
  },
  orLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  orText: { fontSize: 12, color: COLORS.sub, fontWeight: '600' },
  panelDivider: { height: 1, backgroundColor: '#EEF2F6', marginVertical: 16 },
  selectedPlaceholder: { color: COLORS.sub, fontStyle: 'italic' },
  gpsBtn: {
    backgroundColor: '#EEF4FB',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  gpsBtnDisabled: { opacity: 0.7 },
  gpsBtnText: { color: COLORS.primary, fontWeight: '700' },
  savePanel: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  editPanel: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  editTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  selectedLabel: { fontSize: 12, color: COLORS.sub, marginBottom: 4 },
  selectedAddress: { fontSize: 15, color: COLORS.text, lineHeight: 22, marginBottom: 16 },
  nameLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#E8EEF4',
  },
  presetChipActive: { backgroundColor: COLORS.primary },
  presetText: { color: COLORS.sub, fontWeight: '600', fontSize: 14 },
  presetTextActive: { color: '#fff' },
  input: {
    backgroundColor: '#F7F9FC',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  editCurrentAddress: {
    fontSize: 13,
    color: COLORS.sub,
    marginBottom: 8,
    lineHeight: 18,
  },
  addBtn: {
    backgroundColor: COLORS.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnDisabled: { opacity: 0.6 },
  cancelBtn: {
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelBtnText: { color: COLORS.sub, fontWeight: '600' },
  locRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  locInfo: { flex: 1, paddingRight: 12 },
  locName: { fontWeight: '700', color: COLORS.text },
  locCoord: { fontSize: 12, color: COLORS.sub, marginTop: 2 },
  locActions: { flexDirection: 'row', gap: 16 },
  edit: { color: COLORS.primary, fontWeight: '600' },
  delete: { color: '#E53E3E', fontWeight: '600' },
});
