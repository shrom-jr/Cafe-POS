/**
 * Resolves a display name from any staff-like object.
 * Tries fullName → name → username in order so the code works whether
 * the underlying DB/localStorage schema uses any of those fields.
 */
export function getStaffName(
  user: { fullName?: string; name?: string; username?: string } | null | undefined
): string {
  if (!user) return '';
  if (typeof (user as unknown) === 'string') return user as unknown as string;
  return user.fullName?.trim() || user.name?.trim() || user.username?.trim() || '';
}
