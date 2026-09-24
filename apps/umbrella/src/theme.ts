import { StyleSheet } from 'react-native';

/** Toss-aligned design tokens */
export const COLORS = {
  bg: '#F2F4F6',
  card: '#FFFFFF',
  primary: '#3182F6',
  text: '#191F28',
  sub: '#8B95A1',
  subDark: '#6B7684',
  border: '#E5E8EB',
  chipBg: '#F2F4F6',
  live: '#3182F6',
  approaching: '#FE9800',
  clear: '#30B566',
  danger: '#F04452',
  dangerBg: '#FFF5F5',
  weakBlue: '#E8F3FF',
};

export const RADIUS = {
  sm: 12,
  md: 16,
  lg: 20,
  pill: 100,
};

export const SPACING = {
  screenH: 24,
  screenV: 20,
  card: 20,
  section: 28,
};

export const cardShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius: 8,
  elevation: 1,
};

export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    paddingHorizontal: SPACING.screenH,
    paddingTop: SPACING.screenV,
    paddingBottom: 48,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    padding: SPACING.card,
    ...cardShadow,
  },
  errorBox: {
    backgroundColor: COLORS.dangerBg,
    padding: 16,
    borderRadius: RADIUS.sm,
    marginTop: 20,
  },
});
