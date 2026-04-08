export type AppUser = {
  id?: number;
  name?: string;
  email?: string;
  role?: string;
  permissions?: any;
} | null | undefined;

export function isAdmin(user: AppUser): boolean {
  return user?.role === 'admin';
}

export function canAccessSection(user: AppUser, sectionKey: string): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  const sections = user?.permissions?.sections;
  if (!sections || typeof sections !== 'object') return user?.role === 'user' ? false : true;
  return !!sections?.[sectionKey];
}

export function canAction(user: AppUser, sectionKey: string, actionKey: string): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  const section = user?.permissions?.[sectionKey];
  if (!section || typeof section !== 'object') return false;
  return !!section?.[actionKey];
}

export const canAccessFeature = canAction;

export function getSectionPermissions(user: AppUser, sectionKey: string) {
  if (!user) return {};
  if (isAdmin(user)) return {};
  return user?.permissions?.[sectionKey] || {};
}

const LINES_ACTIONS = ['linesAdd', 'linesAddPackage', 'linesSell', 'linesSalesLog', 'linesReports', 'linesInventoryMovement', 'linesAddNumbers', 'linesSectionReports'];

export function canAccessLines(user: AppUser): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  if (!canAccessSection(user, 'office')) return false;
  const officePerms = user?.permissions?.office;
  if (!officePerms || typeof officePerms !== 'object') return false;
  return LINES_ACTIONS.some(a => !!officePerms[a]);
}
