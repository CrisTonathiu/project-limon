import { FeatureKey, type MealPlanDto } from '@limon/types';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { Box } from '../../design-system';
import { nextMeal } from '../../features/home/next-meal';
import { t } from '../../i18n/es-MX';
import { isScreenEnabled, type TabScreenProps } from '../../navigation/types';
import { api } from '../../services/api';
import { useSession } from '../../state/session-context';
import { InicioView } from './InicioView';

/**
 * Inicio, with what the API has today: the greeting and the next meal of the plan. The rings,
 * tiles and weight card stay hidden until the goal tracker and meal check-off ship.
 */
export function HomeScreen({ navigation }: TabScreenProps<'Home'>) {
  const session = useSession();
  const mealPlanOn = session.hasFeature(FeatureKey.MEAL_PLAN);
  const canOpenMeal = isScreenEnabled('MealDetail', session.hasFeature);
  // undefined while loading, so the greeting doesn't change from "Hola" to "Hola, Ana" on screen.
  const [firstName, setFirstName] = useState<string | null | undefined>(undefined);
  const [plan, setPlan] = useState<MealPlanDto | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    api.patients
      .me()
      .then((patient) => setFirstName(patient.firstName))
      .catch((err) => {
        console.error('[home] loading the patient failed', err);
        setFirstName(null);
      });
  }, []);

  // On every visit: the next meal moves with the clock, and the day may have new recipes.
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      if (!mealPlanOn) return;
      api.mealPlans
        .current()
        .then((week) => setPlan(week.status === 'READY' ? week.plan : null))
        .catch((err) => console.error('[home] loading the plan failed', err));
    }, [mealPlanOn]),
  );

  const next = plan ? nextMeal(plan, now) : null;
  const mealLabel = next ? t.recipes.mealTypes[next.meal.mealType] : '';

  return (
    <Box flex={1} backgroundColor="background">
      {firstName === undefined ? null : (
        <InicioView
          today={now}
          firstName={firstName}
          ring={null}
          planAdherence={null}
          streakDays={null}
          mealsToday={null}
          calories={null}
          weight={null}
          nextMeal={
            next
              ? { when: next.tomorrow ? t.home.tomorrow(mealLabel) : mealLabel, title: next.meal.recipe.title }
              : null
          }
          onOpenProfile={() => navigation.navigate('Profile')}
          onOpenNextMeal={
            next && canOpenMeal
              ? () => navigation.navigate('MealDetail', { mealId: next.meal.id, title: next.meal.recipe.title })
              : undefined
          }
        />
      )}
    </Box>
  );
}
