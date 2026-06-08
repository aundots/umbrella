import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from './RelayCard';
import { GeocodePlace, searchPlaces } from '../services/geocode';

interface Props {
  placeholder?: string;
  onSelect: (place: GeocodePlace) => void;
}

export function LocationSearch({ placeholder = '지역명 검색 (예: 강남역, 해운대)', onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodePlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await searchPlaces(trimmed);
        setResults(list);
        if (list.length === 0) setError('검색 결과가 없습니다');
      } catch {
        setResults([]);
        setError('검색에 실패했습니다');
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={COLORS.sub}
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
      />
      {loading ? <ActivityIndicator color={COLORS.primary} style={styles.loader} /> : null}
      {error && !loading ? <Text style={styles.error}>{error}</Text> : null}
      {results.map((place) => (
        <TouchableOpacity
          key={`${place.lat}-${place.lng}-${place.address}`}
          style={styles.result}
          onPress={() => {
            onSelect(place);
            setQuery('');
            setResults([]);
          }}
        >
          <Text style={styles.resultName}>{place.name}</Text>
          <Text style={styles.resultAddress} numberOfLines={2}>
            {place.address}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
  },
  loader: { marginTop: 10 },
  error: { color: COLORS.sub, fontSize: 13, marginTop: 8 },
  result: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  resultName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  resultAddress: { fontSize: 13, color: COLORS.sub, marginTop: 4 },
});
