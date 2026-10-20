import { FeatureKey, type MealPlanDto, type MealProgressDto, type ProgressResponse, type WaterTodayDto } from '@limon/types';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { Box } from '../../design-system';
import { nextMeal } from '../../features/home/next-meal';
import { syncMealReminders } from '../../features/notifications/meal-reminders';
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
 * Inicio: the greeting, the weight goal ring and weight card (goal tracker), today's water
 * (water tracker), and from the meal plan its check-offs (week adherence, streak, meals and
 * calories eaten today) and the next meal. Without a weight goal, the ring shows today's calories.
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
  const [meals, setMeals] = useState<MealProgressDto | null>(null);
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
          .then((week) => {
            setPlan(week.status === 'READY' ? week.plan : null);
            // Every visit, so the phone's reminders follow the plan and answers from elsewhere.
            if (week.status === 'READY') void syncMealReminders(week.plan);
            // After the plan, not alongside it: both generate the week when it doesn't exist yet.
            return week.status === 'READY' ? api.mealPlans.progress() : null;
          })
          .then((res) => setMeals(res?.status === 'READY' ? res : null))
          .catch((err) => console.error('[home] loading the plan or its check-offs failed', err));
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
  // Null when FatSecret can't give an eaten meal's kcal: no partial number.
  const calories = meals && meals.today.kcal !== null ? { eaten: meals.today.kcal, target: meals.today.targetKcal } : null;
  const mealLabel = next ? t.recipes.mealTypes[next.meal.mealType] : '';

  return (
    <Box flex={1} backgroundColor="background">
      {firstName === undefined ? null : (
        <InicioView
          today={now}
          firstName={firstName}
          ring={(progress && goalRing(progress)) ?? (calories ? { kind: 'calories', ...calories } : null)}
          planAdherence={meals?.week.adherence ?? null}
          streakDays={meals ? meals.streak.days : null}
          mealsToday={meals && meals.today.meals > 0 ? { eaten: meals.today.eaten, planned: meals.today.meals } : null}
          calories={calories}
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
