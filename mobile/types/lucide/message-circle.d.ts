/**
 * One icon's hand-written face. The package's own type barrel chains every
 * icon through a ~1500-export surface that overflows tsc's default stack;
 * tsconfig `paths` points each deep import here instead — one tiny file per
 * icon, so eslint's resolver also sees distinct modules.
 */
import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
declare const Icon: ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;
export default Icon;
