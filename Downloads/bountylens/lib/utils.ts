export function pts(amount: number): string {
  return `${amount} pts`;
}

export function usd(points: number): string {
  return `${points} pts`;
}

export const theme = {
  bg: '#000000',
  card: '#1C1C1E',
  text: '#FFFFFF',
  subtext: '#8E8E93',
  tint: '#0A84FF',
  danger: '#FF453A',
  success: '#30D158',
  border: '#2C2C2E',
};
export function humanError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err || 'Произошла неизвестная ошибка');
}