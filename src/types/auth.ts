export type UserRole = 
  | 'admin' 
  | 'export_manager' 
  | 'export_staff' 
  | 'domestic_manager' 
  | 'domestic_staff' 
  | 'subcontractor';

export const VALID_ROLES: readonly UserRole[] = [
  'admin',
  'export_manager',
  'export_staff',
  'domestic_manager',
  'domestic_staff',
  'subcontractor'
] as const;

export function isValidRole(role: unknown): role is UserRole {
  return typeof role === 'string' && VALID_ROLES.includes(role as UserRole);
}

export interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}
