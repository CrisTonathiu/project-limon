import type { ShoppingListItemDto, ShoppingListResponse } from '@limon/types';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { formatShoppingAmount, progress, withChecked } from '../../features/shopping-list/shopping-list-format';
import { t } from '../../i18n/es-MX';
import { formatNumber } from '../../i18n/format';
import { api } from '../../services/api';
import { useTenantTheme } from '../../theme/theme-context';

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; list: ShoppingListResponse };

/**
 * This week's shopping list, added up from the meal plan by the API (after swaps and
 * portions), by store section. Items can be checked off; the checks are kept per week.
 */
export function ShoppingListScreen() {
  const { theme } = useTenantTheme();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [checkFailed, setCheckFailed] = useState(false);

  const fetchList = useCallback(() => {
    setLoad((l) => (l.status === 'loaded' ? l : { status: 'loading' }));
    api.shoppingList
      .current()
      .then((list) => setLoad({ status: 'loaded', list }))
      .catch((err) => {
        console.error('[shopping-list] loading the list failed', err);
        setLoad((l) => (l.status === 'loaded' ? l : { status: 'failed' }));
      });
  }, []);
  // Reloads when coming back, so the list follows changes made to the plan meanwhile.
  useFocusEffect(fetchList);

  /** Optimistic: the box flips at once and flips back if the API call fails. */
  const toggle = (item: ShoppingListItemDto) => {
    const apply = (checked: boolean) =>
      setLoad((prev) =>
        prev.status === 'loaded' && prev.list.status === 'READY'
          ? { ...prev, list: { ...prev.list, sections: withChecked(prev.list.sections, item.foodId, checked) } }
          : prev,
      );
    apply(!item.checked);
    setCheckFailed(false);
    api.shoppingList.setChecked(item.foodId, !item.checked).catch((err) => {
      console.error('[shopping-list] saving the check failed', err);
      apply(item.checked);
      setCheckFailed(true);
    });
  };

  const Muted = ({ children }: { children: string }) => <Text style={{ color: theme.colors.textMuted }}>{children}</Text>;

  const itemRow = (item: ShoppingListItemDto) => (
    <Pressable
      key={item.foodId}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: item.checked }}
      onPress={() => toggle(item)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xs }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: theme.radius.sm,
          borderWidth: 2,
          borderColor: theme.colors.primary,
          backgroundColor: item.checked ? theme.colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {item.checked ? <Text style={{ color: theme.colors.onPrimary, fontWeight: '700' }}>✓</Text> : null}
      </View>
      <Text style={{ flex: 1, color: item.checked ? theme.colors.textMuted : theme.colors.text, textDecorationLine: item.checked ? 'line-through' : 'none' }}>
        {item.name}
      </Text>
      <Text style={{ color: theme.colors.textMuted }}>{formatShoppingAmount(item.unit, item.amount)}</Text>
    </Pressable>
  );

  const listView = (list: Extract<ShoppingListResponse, { status: 'READY' }>) => {
    if (!list.sections.length) return <Muted>{t.shoppingList.empty}</Muted>;
    const done = progress(list.sections);
    return (
      <>
        <Muted>{t.shoppingList.intro}</Muted>
        <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{t.shoppingList.progress(formatNumber(done.checked), formatNumber(done.total))}</Text>
        {checkFailed ? <Text style={{ color: theme.colors.danger }}>{t.shoppingList.checkFailed}</Text> : null}
        {list.sections.map((section) => (
          <View
            key={section.category}
            style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: theme.spacing.xs }}
          >
            <Text accessibilityRole="header" style={{ color: theme.colors.primary, fontWeight: '700' }}>
              {t.shoppingList.sections[section.category]}
            </Text>
            {section.items.map(itemRow)}
          </View>
        ))}
      </>
    );
  };

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
      {load.status === 'loading' ? <ActivityIndicator /> : null}
      {load.status === 'failed' ? (
        <>
          <Text style={{ color: theme.colors.text }}>{t.shoppingList.loadFailed}</Text>
          <Button label={t.shoppingList.retry} onPress={fetchList} />
        </>
      ) : null}
      {load.status === 'loaded' && load.list.status === 'CONSULT_NUTRITIONIST' ? (
        <>
          <Text style={{ color: theme.colors.text }}>{t.profile.target.hold[load.list.reason]}</Text>
          <Muted>{t.shoppingList.consult}</Muted>
        </>
      ) : null}
      {load.status === 'loaded' && load.list.status === 'READY' ? listView(load.list) : null}
    </ScrollView>
  );
}
