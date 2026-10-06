import Svg, { Circle, Path, Rect } from 'react-native-svg';
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
  chevronLeft: <Path d="M15 6l-6 6 6 6" />,
  heart: <Path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  search: (
    <>
      <Circle cx={11} cy={11} r={6} />
      <Path d="M20 20l-4.5-4.5" />
    </>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
  water: <Path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z" />,
  bowl: (
    <>
      <Path d="M4 12h16a8 8 0 0 1-16 0z" />
      <Path d="M9 8c0-2 1-3 3-4M13 8c0-1.5.8-2.5 2.5-3" />
    </>
  ),
  card: (
    <>
      <Rect x={3} y={6} width={18} height={13} rx={3} />
      <Path d="M3 10h18" />
    </>
  ),
  signOut: <Path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" />,
  trash: <Path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />,
  cart: (
    <>
      <Path d="M3 4h2l2.4 11h10.2L20 8H6.2" />
      <Circle cx={9} cy={19} r={1.4} />
      <Circle cx={17} cy={19} r={1.4} />
    </>
  ),
} as const;

export type IconName = keyof typeof glyphs;

export type IconProps = {
  name: IconName;
  color?: keyof AppTheme['colors'];
  /** Fills the shape too, e.g. a favourite heart. */
  fill?: keyof AppTheme['colors'];
  size?: number;
  strokeWidth?: number;
};

export function Icon({ name, color = 'text', fill, size = 24, strokeWidth = 1.8 }: IconProps) {
  const { colors } = useAppTheme();
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? colors[fill] : 'none'}
      stroke={colors[color]}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {glyphs[name]}
    </Svg>
  );
}
