import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka';
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold } from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';

/** Loads the design system's fonts; render nothing (keep the splash) until it returns true. */
export function useDesignFonts(): boolean {
  const [loaded, error] = useFonts({
    Fredoka_600SemiBold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });
  // On a load error, carry on with the system font rather than blocking the app.
  return loaded || error != null;
}
