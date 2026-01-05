/**
 * The main navigation routes
 */
export type Path = 'Home' | 'OpenHAB' | 'EVCC' | 'Protect';

export class NavigationEntry {
  name: string;
  icon: string;
  path: Path;
}
