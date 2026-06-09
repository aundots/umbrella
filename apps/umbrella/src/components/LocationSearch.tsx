import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ListRow, SearchField, Txt } from '@toss/tds-react-native';
import { COLORS, RADIUS } from '../theme';
import { GeocodePlace, searchPlaces } from '../services/geocode';

interface Props {
  placeholder?: string;
  onSelect: (place: GeocodePlace) => void;
}

export function LocationSearch({
  placeholder = '지역명 검색 (예: 강남역, 해운대)',
  onSelect,
}: Props) {
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
      <SearchField
        placeholder={placeholder}
        value={query}
        onChangeText={setQuery}
        hasClearButton
        style={styles.search}
      />
      {loading ? <ActivityIndicator color={COLORS.primary} style={styles.loader} /> : null}
      {error && !loading ? (
        <Txt typography="t7" color={COLORS.sub} style={styles.error}>
          {error}
        </Txt>
      ) : null}
      {results.length > 0 ? (
        <View style={styles.results}>
          {results.map((place) => (
            <TouchableOpacity
              key={`${place.lat}-${place.lng}-${place.address}`}
              activeOpacity={0.7}
              onPress={() => {
                onSelect(place);
                setQuery('');
                setResults([]);
              }}
            >
              <ListRow
                contents={
                  <ListRow.Texts
                    type="2RowTypeA"
                    top={place.name}
                    bottom={place.address}
                  />
                }
                verticalPadding="small"
              />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  search: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.sm,
  },
  loader: { marginTop: 12 },
  error: { marginTop: 8 },
  results: {
    marginTop: 8,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
});
