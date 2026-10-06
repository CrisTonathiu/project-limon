import Svg, { Circle, Path } from 'react-native-svg';
import { useAppTheme } from '../restyle';
import type { AppTheme } from '../theme';

/** Line icons from the mockups (24 px grid, 1.8 stroke, round caps). */
const glyphs = {
  home: <Path d="M4 11l8-7 8 7v9H4z" />,
  meals: (
    <>
      <Circle cx={12} cy={12} r={8} />
      <Circle cx={12} cy={12} r={4} />
    </>
  ),
  recipes: (
    <>
      <Path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <Path d="M5 17a3 3 0 0 1 3-3h11" />
    </>
  ),
  progress: <Path d="M4 19h16M7 16v-5M12 16V7M17 16v-8" />,
  profile: (
    <>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
  flame: <Path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 2 3 3 0-2 0-4 0-6z" />,
  energy: <Path d="M13 3L5 13h6l-1 8 8-10h-6z" />,
  chevronRight: <Path d="M9 6l6 6-6 6" />,
} as const;

export type IconName = keyof typeof glyphs;

export type IconProps = {
  name: IconName;
  color?: keyof AppTheme['colors'];
  size?: number;
};

export function Icon({ name, color = 'text', size = 24 }: IconProps) {
  const { colors } = useAppTheme();
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors[color]}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {glyphs[name]}
    </Svg>
  );
}
