import { FeatureKey, type MealPlanDto, type ProgressResponse, type WaterTodayDto } from '@limon/types';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { Box } from '../../design-system';
import { nextMeal } from '../../features/home/next-meal';
import { goalRing, weeklyWeights } from '../../features/home/weekly-weights';
import { t } from '../../i18n/es-MX';
import { toDateOnly } from '../../i18n/format';
import { isScreenEnabled, type TabScreenProps } from '../../navigation/types';
import { api } from '../../services/api';
import { useSession } from '../../state/session-context';
import { InicioView } from './InicioView';

/** Weeks of weigh-ins in the sparkline. */
const WEIGHT_WEEKS = 8;

/**
 * Inicio, with what the API has today: the greeting, the weight goal ring and weight card
 * (goal tracker), today's water (water tracker) and the next meal of the plan. Plan adherence,
 * the streak and meals eaten stay hidden until meal check-off ships.
 */
export function HomeScreen({ navigation }: TabScreenProps<'Home'>) {
  const session = useSession();
  const mealPlanOn = session.hasFeature(FeatureKey.MEAL_PLAN);
  const goalsOn = session.hasFeature(FeatureKey.GOAL_TRACKER);
  const waterOn = session.hasFeature(FeatureKey.WATER_TRACKER);
  const canOpenMeal = isScreenEnabled('MealDetail', session.hasFeature);
  // undefined while loading, so the greeting doesn't change from "Hola" to "Hola, Ana" on screen.
  const [firstName, setFirstName] = useState<string | null | undefined>(undefined);
  const [plan, setPlan] = useState<MealPlanDto | null>(null);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [water, setWater] = useState<WaterTodayDto | null>(null);
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
      // Each block loads on its own; one failing leaves the others on screen.
      if (mealPlanOn) {
        api.mealPlans
          .current()
          .then((week) => setPlan(week.status === 'READY' ? week.plan : null))
          .catch((err) => console.error('[home] loading the plan failed', err));
      }
      if (goalsOn) {
        api.patients
          .myProgress('weeks8')
          .then(setProgress)
          .catch((err) => console.error('[home] loading the progress failed', err));
      }
      if (waterOn) {
        api.water
          .get(1)
          .then(setWater)
          .catch((err) => console.error('[home] loading the water failed', err));
      }
    }, [mealPlanOn, goalsOn, waterOn]),
  );

  const next = plan ? nextMeal(plan, now) : null;
  const mealLabel = next ? t.recipes.mealTypes[next.meal.mealType] : '';

  return (
    <Box flex={1} backgroundColor="background">
      {firstName === undefined ? null : (
        <InicioView
          today={now}
          firstName={firstName}
          ring={progress ? goalRing(progress) : null}
          planAdherence={null}
          streakDays={null}
          mealsToday={null}
          calories={null}
          weight={
            progress
              ? { valuesKg: weeklyWeights(progress.weights, toDateOnly(now)), weeks: WEIGHT_WEEKS }
              : null
          }
          water={water ? { drunkMl: water.totalMl, goalMl: water.targetMl } : null}
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
