export const passwordMinLength = 9;
export const passwordMaxLength = 128;
export const passwordRules = '密码至少 9 位，须同时包含大写字母、小写字母和数字。';

export function meetsPasswordRules(password: string) {
  return password.length >= passwordMinLength && password.length <= passwordMaxLength &&
    /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password);
}
