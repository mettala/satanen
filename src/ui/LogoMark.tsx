import { Rect, Svg } from 'react-native-svg';

import { colors, useTheme } from '../theme';

// The mark's palette is fixed by the logo spec (design-system/assets/Logos/README.md):
// each digit in a section colour on the graphite tile, and never recoloured. Those exact
// values are the dark-theme section colours, so they are read from the token set.
const GRAPHITE = colors.dark.bg;
const DIGIT_COLORS = [
  colors.dark['section-news'],
  colors.dark['section-sport'],
  colors.dark['section-business'],
] as const;

const CELL = 7.6;
const CELL_RADIUS = 2.13;
const PITCH = 9;
const ORIGIN_Y = 38.2;
const ORIGIN_X = [15.6, 47.2, 78.8];

// Raster per digit: "." empty, "X" filled mosaic block (matches satanen-icon.svg).
const DIGIT_SHAPES = [
  ['.X.', 'XX.', '.X.', '.X.', 'XXX'],
  ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
];

const BLOCKS: { x: number; y: number; fill: string }[] = [];
DIGIT_SHAPES.forEach((shape, digit) => {
  shape.forEach((row, r) => {
    for (let c = 0; c < row.length; c += 1) {
      if (row[c] === 'X') {
        BLOCKS.push({
          x: ORIGIN_X[digit] + c * PITCH,
          y: ORIGIN_Y + r * PITCH,
          fill: DIGIT_COLORS[digit],
        });
      }
    }
  });
});

export function LogoMark({ size }: { size: number }) {
  const { scheme, colors: themeColors } = useTheme();
  // On dark the graphite tile is the same colour as the screen, so it gets a visible edge
  // (about 1 px on screen) from an existing token; on light the tile stands out by itself.
  const dark = scheme === 'dark';
  const stroke = dark ? themeColors['ink-muted'] : GRAPHITE;
  const strokeWidth = dark ? 4 : 1;
  const inset = strokeWidth / 2;

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Rect
        x={inset}
        y={inset}
        width={120 - strokeWidth}
        height={120 - strokeWidth}
        rx={27}
        fill={GRAPHITE}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {BLOCKS.map((block, i) => (
        <Rect
          key={i}
          x={block.x}
          y={block.y}
          width={CELL}
          height={CELL}
          rx={CELL_RADIUS}
          fill={block.fill}
        />
      ))}
    </Svg>
  );
}
