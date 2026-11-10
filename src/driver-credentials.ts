// Reserved internal identifiers let drivers use a phone username without SMS.
export const driverLoginEmail = (phone: string) =>
 `driver-${phone.replace(/^\+/, '')}@drivers.yalla-nrouh.invalid`;

export function validDriverPassword(password: unknown): password is string {
 return typeof password === 'string' && password.length >= 8 &&
  new TextEncoder().encode(password).length <= 72 && !/[\x00-\x1f\x7f]/.test(password);
}
