// Strong-password policy, mirrored from the backend (UsersService).
// Each rule has a label (for the live checklist) and a test.
export const PASSWORD_RULES: { label: string; test: (pw: string) => boolean }[] =
  [
    { label: "Al menos 8 caracteres", test: (pw) => pw.length >= 8 },
    { label: "Una letra minúscula", test: (pw) => /[a-z]/.test(pw) },
    { label: "Una letra mayúscula", test: (pw) => /[A-Z]/.test(pw) },
    { label: "Un número", test: (pw) => /[0-9]/.test(pw) },
    {
      label: "Un carácter especial (! @ # $ %…)",
      test: (pw) => /[^A-Za-z0-9]/.test(pw),
    },
  ];

/** Returns true when the password meets every rule. */
export function isPasswordStrong(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(pw));
}
