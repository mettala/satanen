import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { usePage } from '../../data';
import { favouritePreview } from '../../favourites/preview';
import { t } from '../../i18n';
import { sectionOf } from '../../sections/sectionOf';
import { useTheme } from '../../theme';
import { SectionLabel } from '../lists/SectionLabel';
import { clockTime } from '../page/format';
import { FavouriteSkeleton, UpdatedMeta } from '../states';
import { moveFlags, unavailableText } from './model';

export interface FavouriteCardProps {
  page: number;
  index: number;
  count: number;
  editing: boolean;
  onOpen: (page: number) => void;
  onRemove: (page: number) => void;
  onMoveUp: (page: number) => void;
  onMoveDown: (page: number) => void;
}

function IconButton({
  icon,
  label,
  disabled,
  onPress,
  danger,
}: {
  icon: 'chevron-up' | 'chevron-down' | 'trash-outline';
  label: string;
  disabled?: boolean;
  onPress: () => void;
  danger?: boolean;
}) {
  const { colors, size } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size.touch,
        height: size.touch,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={24} color={danger ? colors.danger : colors.ink} />
    </Pressable>
  );
}

/** One favourite as a live card: section label, headline, second line. */
export function FavouriteCard({
  page,
  index,
  count,
  editing,
  onOpen,
  onRemove,
  onMoveUp,
  onMoveDown,
}: FavouriteCardProps) {
  const { colors, type, radius, space } = useTheme();
  const state = usePage(page);

  if (state.status === 'loading') {
    return <FavouriteSkeleton label={t.favouritesScreen.cardLoading(page)} />;
  }

  const preview = favouritePreview(state.page ?? undefined, page);
  const failed = state.status === 'error';
  const headline = failed ? unavailableText(state.reason) : preview.headline;
  const section = sectionOf(page);
  const flags = moveFlags(index, count);
  const updated = state.updatedAt ? clockTime(state.updatedAt) : null;

  const updatedNote =
    (state.offline || state.stale) && updated
      ? [
          state.offline ? t.states.offlineMeta(updated) : t.states.updated(updated),
          state.stale ? t.states.staleCopy : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';
  const spoken = [
    t.favouritesScreen.open(preview.label, page, headline),
    !failed && preview.sub,
    updatedNote,
  ]
    .filter(Boolean)
    .join('. ');

  const content = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['space-2'] }}>
        <View style={{ flex: 1 }}>
          <SectionLabel section={section.id} label={preview.label} suffix={page} />
        </View>
        {preview.time ? (
          <Text style={[type.styles.meta, { color: colors['ink-muted'] }]}>{preview.time}</Text>
        ) : null}
      </View>
      {headline ? (
        <Text
          numberOfLines={3}
          style={[
            type.styles.headline,
            { color: failed ? colors['ink-muted'] : colors.ink },
            !failed && { fontFamily: type.styles.label.fontFamily },
          ]}
        >
          {headline}
        </Text>
      ) : null}
      {preview.sub && !failed ? (
        <Text numberOfLines={2} style={[type.styles['body-sm'], { color: colors['ink-muted'] }]}>
          {preview.sub}
        </Text>
      ) : null}
      {(state.offline || state.stale) && updated ? (
        <UpdatedMeta time={updated} offline={state.offline} stale={state.stale} />
      ) : null}
    </>
  );

  const cardStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius['radius-lg'],
    paddingVertical: space['space-4'],
    paddingHorizontal: space['space-5'],
    gap: space['space-2'],
  } as const;

  if (editing) {
    return (
      <View style={cardStyle}>
        {content}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <IconButton
            icon="chevron-up"
            label={t.favouritesScreen.moveUp(preview.label, page)}
            disabled={!flags.up}
            onPress={() => onMoveUp(page)}
          />
          <IconButton
            icon="chevron-down"
            label={t.favouritesScreen.moveDown(preview.label, page)}
            disabled={!flags.down}
            onPress={() => onMoveDown(page)}
          />
          <IconButton
            icon="trash-outline"
            danger
            label={t.favouritesScreen.remove(preview.label, page)}
            onPress={() => onRemove(page)}
          />
        </View>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={spoken}
      onPress={() => onOpen(page)}
      style={({ pressed }) => ({ ...cardStyle, opacity: pressed ? 0.8 : 1 })}
    >
      {content}
    </Pressable>
  );
}
