import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/react';

/** Accounts are optional: without a Clerk key the game still runs and these controls stay hidden. */
export const AUTH_ENABLED = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/** Sign in / Sign up when signed out, the profile button when signed in. */
export function AuthControls() {
  if (!AUTH_ENABLED) return null;
  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal"><button className="btn small">Sign in</button></SignInButton>
        <SignUpButton mode="modal"><button className="btn small">Sign up</button></SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </>
  );
}
