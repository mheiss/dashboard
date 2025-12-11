/**
 * A single entry in the dashboard
 */
export interface DashboardEntry {
  title: string;
  icon: string;
  route: string;
}

/**
 * All entries of the navigation bar
 */
export function getEntries(): DashboardEntry[] {
  const entries: DashboardEntry[] = [];
  entries.push(createEntry('Home', 'home', 'home'));
  entries.push(createEntry('OpenHAB', 'openhab.svg', 'openhab'));
  entries.push(createEntry('Wallbox', 'evcc.svg', 'evcc'));
  entries.push(createEntry('Security', 'security', 'security'));
  return entries;
}

/**
 * Creates a single new entry
 */
function createEntry(title: string, icon: string, route: string): DashboardEntry {
  return { title, icon, route };
}
