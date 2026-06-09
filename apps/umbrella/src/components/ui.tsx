import React from 'react';
import {
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { ListHeader, TextButton, Txt } from '@toss/tds-react-native';
import { COLORS, RADIUS, sharedStyles } from '../theme';

export function BackLink({
  label = '← 돌아가기',
  onPress,
}: {
  label?: string;
  onPress: () => void;
}) {
  return (
    <TextButton
      typography="t5"
      fontWeight="semibold"
      color={COLORS.primary}
      onPress={onPress}
      style={styles.backLink}
    >
      {label}
    </TextButton>
  );
}

export function Chip({
  label,
  active,
  onPress,
  compact,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        compact && styles.chipCompact,
        active && styles.chipActive,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Txt
        typography="t6"
        fontWeight={active ? 'semibold' : 'medium'}
        color={active ? '#FFFFFF' : COLORS.subDark}
      >
        {label}
      </Txt>
    </TouchableOpacity>
  );
}

export function IconChip({
  icon,
  onPress,
  accessibilityLabel,
}: {
  icon: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, styles.iconChip]}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      activeOpacity={0.7}
    >
      <Txt typography="t5" color={COLORS.subDark}>
        {icon}
      </Txt>
    </TouchableOpacity>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[sharedStyles.card, style]}>{children}</View>;
}

export function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <ListHeader
      title={
        <ListHeader.TitleParagraph typography="t7" fontWeight="bold" color={COLORS.subDark}>
          {title}
        </ListHeader.TitleParagraph>
      }
      lower={
        description ? (
          <ListHeader.DescriptionParagraph>
            <Txt typography="t7" color={COLORS.sub}>
              {description}
            </Txt>
          </ListHeader.DescriptionParagraph>
        ) : undefined
      }
      style={styles.sectionHeader}
    />
  );
}

export function NavLink({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <TextButton
      typography="t5"
      fontWeight="semibold"
      color={COLORS.primary}
      variant="arrow"
      onPress={onPress}
      style={styles.navLink}
    >
      {label}
    </TextButton>
  );
}

export function ErrorBanner({
  message,
  hint,
  onRetry,
}: {
  message: string;
  hint?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={sharedStyles.errorBox}>
      <Txt typography="t5" fontWeight="semibold" color={COLORS.danger}>
        {message}
      </Txt>
      {hint ? (
        <Txt typography="t7" color={COLORS.sub} style={styles.errorHint}>
          {hint}
        </Txt>
      ) : null}
      {onRetry ? (
        <TextButton
          typography="t6"
          fontWeight="semibold"
          color={COLORS.primary}
          onPress={onRetry}
          style={styles.retryBtn}
        >
          다시 시도
        </TextButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backLink: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.chipBg,
    marginRight: 8,
  },
  chipCompact: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
  },
  iconChip: {
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    marginTop: 8,
    marginBottom: 4,
  },
  navLink: {
    alignSelf: 'center',
    marginTop: 12,
  },
  errorHint: {
    marginTop: 8,
    lineHeight: 18,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
  },
});
