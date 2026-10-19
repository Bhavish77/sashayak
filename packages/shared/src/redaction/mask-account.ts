/** F06: a display mask such as "XXXX1234" — always 4 Xs, regardless of the original length. */
export function maskAccount(value: string): string {
  return `XXXX${value.slice(-4)}`;
}
