/**
 * The password just typed on sign-up or sign-in, held in memory (never saved)
 * until the email code is entered. The server makes it the account's password
 * only then, for whoever proves they own the address.
 */
let pending: { email: string; password: string } | null = null;

export function holdPassword(email: string, password: string) {
  pending = { email, password };
}

export function heldPassword(email: string) {
  return pending?.email === email ? pending.password : null;
}

export function forgetPassword() {
  pending = null;
}
