import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { t } from '../../i18n';
import { favourites, useStored } from '../../storage';
import { useTheme } from '../../theme';
import { PageHeader } from '../lists/PageHeader';
import { FavouriteCard } from './FavouriteCard';
import { isEditing } from './model';

export interface FavouritesViewProps {
  onOpenPage: (page: number) => void;
}

/** The Suosikit tab: a live card per favourite, with an edit mode. */
export function FavouritesView({ onOpenPage }: FavouritesViewProps) {
  const { colors, type, space, size } = useTheme();
  const list = useStored(favourites.store);
  const [wantsEdit, setWantsEdit] = useState(false);
  const editing = isEditing(wantsEdit, list.length);
  // Leave edit mode for good once the list is empty, so the tab does not reopen in it.
  if (list.length === 0 && wantsEdit) setWantsEdit(false);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader
        title={t.favourites.title}
        trailing={
          list.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={editing ? t.favouritesScreen.done : t.favourites.edit}
              onPress={() => setWantsEdit(!editing)}
              style={{ minHeight: size.touch, minWidth: size.touch, justifyContent: 'center' }}
            >
              <Text style={[type.styles.headline, { color: colors.link, fontWeight: '600' }]}>
                {editing ? t.favouritesScreen.done : t.favourites.edit}
              </Text>
            </Pressable>
          ) : undefined
        }
      />
      {list.length === 0 ? (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: space['space-5'],
            gap: 10,
          }}
        >
          <Text accessibilityRole="header" style={[type.styles.title, { color: colors.ink }]}>
            {t.favourites.emptyTitle}
          </Text>
          <Text style={[type.styles['body-sm'], { color: colors['ink-muted'] }]}>
            {t.favourites.emptyBody}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: space['space-5'],
            paddingTop: space['space-1'],
            paddingBottom: space['space-8'],
            gap: space['space-3'],
          }}
        >
          {list.map((page, i) => (
            <FavouriteCard
              key={page}
              page={page}
              index={i}
              count={list.length}
              editing={editing}
              onOpen={onOpenPage}
              onRemove={favourites.remove}
              onMoveUp={favourites.moveUp}
              onMoveDown={favourites.moveDown}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
