import { Accuracy, useGeolocation } from '@apps-in-toss/framework';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@granite-js/react-native';
import { Button, ListRow, Switch, TextButton, Txt } from '@toss/tds-react-native';
import { LocationSearch } from '../src/components/LocationSearch';
import { COLORS } from '../src/components/RelayCard';
import { BackLink, Card, Chip, SectionHeader } from '../src/components/ui';
import { useAuth } from '../src/auth/AuthContext';
import { useLocations } from '../src/hooks/useLocations';
import { sharedStyles, RADIUS } from '../src/theme';
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

  return (
    <ScrollView
      ref={scrollRef}
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.content}
    >
      <BackLink onPress={() => navigation.navigate('/')} />
      <Txt typography="t2" fontWeight="bold" color={COLORS.text} style={styles.title}>
        설정
      </Txt>

      <Card style={styles.notifyCard}>
        <ListRow
          contents={
            <ListRow.Texts type="1RowTypeA" top="강수 알림" topProps={{ fontWeight: 'semibold' }} />
          }
          right={<Switch checked={notify} onCheckedChange={onNotifyToggle} />}
          verticalPadding="small"
        />
      </Card>

      {userKey ? (
        <View style={styles.testRow}>
          <Button
            size="medium"
            style="weak"
            type="primary"
            display="block"
            disabled={pushTesting}
            loading={pushTesting}
            onPress={() => onTestPush('rain')}
            viewStyle={styles.testBtn}
          >
            비 예고 테스트
          </Button>
          <Button
            size="medium"
            style="weak"
            type="primary"
            display="block"
            disabled={pushTesting}
            onPress={() => onTestPush('clear')}
            viewStyle={styles.testBtn}
          >
            비 그침 테스트
          </Button>
        </View>
      ) : null}

      <SectionHeader title="알림 시점" description="선택 위치 기준 강수 가능성" />
      <View style={styles.chipRow}>
        {([30, 60] as const).map((m) => (
          <Chip
            key={m}
            label={chipLabel(m)}
            active={beforeMin === m}
            onPress={() => setBeforeMin(m)}
          />
        ))}
      </View>

      <SectionHeader
        title="즐겨찾기 추가"
        description="주소를 검색해 선택한 뒤, 저장할 이름을 입력하세요"
      />

      <Card>
        <Txt typography="t7" fontWeight="semibold" color={COLORS.subDark} style={styles.fieldLabel}>
          주소 검색
        </Txt>
        <LocationSearch placeholder="지역 검색 (예: 강남역, 해운대)" onSelect={onSelectPlace} />

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Txt typography="t7" fontWeight="semibold" color={COLORS.sub}>
            또는
          </Txt>
          <View style={styles.orLine} />
        </View>

        <Button
          size="medium"
          style="weak"
          type="primary"
          display="block"
          disabled={geoLoading}
          loading={geoLoading}
          onPress={onUseCurrentLocation}
        >
          현재 위치 사용
        </Button>

        <View style={styles.divider} />

        <Txt typography="t7" fontWeight="semibold" color={COLORS.sub} style={styles.fieldLabel}>
          선택된 주소
        </Txt>
        <Txt
          typography="t5"
          color={selectedPlace ? COLORS.text : COLORS.sub}
          style={styles.selectedAddress}
        >
          {selectedPlace?.address ?? '검색 결과를 선택하면 주소가 표시됩니다'}
        </Txt>

        <Txt typography="t7" fontWeight="semibold" color={COLORS.subDark} style={styles.fieldLabel}>
          저장할 이름
        </Txt>
        <View style={styles.presetRow}>
          {NAME_PRESETS.map((preset) => (
            <Chip
              key={preset}
              label={preset}
              active={name === preset}
              onPress={() => setName(preset)}
              compact
            />
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder="예: 학교, 할머니 댁"
          placeholderTextColor={COLORS.sub}
          value={name}
          onChangeText={setName}
        />

        <Button
          display="block"
          disabled={!selectedPlace || !name.trim() || saving}
          loading={saving}
          onPress={onAdd}
          viewStyle={styles.submitBtn}
        >
          위치 저장
        </Button>
        {selectedPlace ? (
          <TextButton
            typography="t6"
            fontWeight="semibold"
            color={COLORS.sub}
            onPress={clearAddForm}
            style={styles.cancelBtn}
          >
            선택 취소
          </TextButton>
        ) : null}
      </Card>

      {saved.length > 0 && (
        <>
          <SectionHeader title="등록된 위치" />
          {saved.map((loc) => (
            <View key={loc.id}>
              {editingId === loc.id && editPlace ? (
                <Card style={styles.editPanel}>
                  <Txt typography="t5" fontWeight="bold" color={COLORS.text} style={styles.editTitle}>
                    위치 수정
                  </Txt>

                  <Txt typography="t7" fontWeight="semibold" color={COLORS.subDark} style={styles.fieldLabel}>
                    저장할 이름
                  </Txt>
                  <View style={styles.presetRow}>
                    {NAME_PRESETS.map((preset) => (
                      <Chip
                        key={preset}
                        label={preset}
                        active={editName === preset}
                        onPress={() => setEditName(preset)}
                        compact
                      />
                    ))}
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="예: 학교, 할머니 댁"
                    placeholderTextColor={COLORS.sub}
                    value={editName}
                    onChangeText={setEditName}
                  />

                  <Txt typography="t7" fontWeight="semibold" color={COLORS.subDark} style={styles.fieldLabel}>
                    주소 검색으로 변경
                  </Txt>
                  <LocationSearch
                    placeholder="새 주소 검색 (예: 부산 해운대)"
                    onSelect={(place) => setEditPlace(place)}
                  />
                  <Txt typography="t7" color={COLORS.sub} style={styles.editAddress}>
                    선택된 주소: {editPlace.address || '주소 확인 중…'}
                  </Txt>

                  <Button
                    display="block"
                    disabled={saving}
                    loading={saving}
                    onPress={onSaveEdit}
                    viewStyle={styles.submitBtn}
                  >
                    변경 저장
                  </Button>
                  <TextButton
                    typography="t6"
                    fontWeight="semibold"
                    color={COLORS.sub}
                    onPress={cancelEdit}
                    style={styles.cancelBtn}
                  >
                    취소
                  </TextButton>
                </Card>
              ) : (
                <Card style={styles.locCard}>
                  <ListRow
                    contents={
                      <ListRow.Texts
                        type="2RowTypeA"
                        top={loc.name}
                        bottom={loc.address ?? addressById[loc.id] ?? '주소 확인 중…'}
                      />
                    }
                    right={
                      <View style={styles.locActions}>
                        <TextButton
                          typography="t7"
                          fontWeight="semibold"
                          color={COLORS.primary}
                          onPress={() => startEdit(loc)}
                        >
                          수정
                        </TextButton>
                        <TextButton
                          typography="t7"
                          fontWeight="semibold"
                          color={COLORS.danger}
                          onPress={() => onDelete(loc)}
                        >
                          삭제
                        </TextButton>
                      </View>
                    }
                    verticalPadding="small"
                  />
                </Card>
              )}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 20 },
  notifyCard: { paddingVertical: 4, paddingHorizontal: 0, marginBottom: 12 },
  testRow: { gap: 8, marginBottom: 8 },
  testBtn: { flex: 1 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  fieldLabel: { marginBottom: 8 },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 12,
  },
  orLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 20 },
  selectedAddress: { lineHeight: 24, marginBottom: 20 },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.sm,
    padding: 14,
    marginBottom: 16,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  submitBtn: { marginTop: 4 },
  cancelBtn: { alignSelf: 'center', marginTop: 8 },
  editPanel: {
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  editTitle: { marginBottom: 16 },
  editAddress: { marginBottom: 16, lineHeight: 20 },
  locCard: { paddingVertical: 0, paddingHorizontal: 0, marginBottom: 8 },
  locActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
