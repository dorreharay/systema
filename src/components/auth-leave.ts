import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { createContext, use } from 'react';

// Provided by AuthLayout: fades the screen's content out, then runs the navigation. Without a
// provider the navigation runs at once.
export const AuthLeaveContext = createContext<(navigate: () => void) => void>((navigate) =>
  navigate()
);

// Navigation for code inside an AuthLayout that is not a link, for example a form submit.
export function useAuthRouter() {
  const router = useRouter();
  const leave = use(AuthLeaveContext);

  return {
    push: (href: Href) => leave(() => router.push(href)),
    replace: (href: Href) => leave(() => router.replace(href)),
    dismissTo: (href: Href) => leave(() => router.dismissTo(href)),
  };
}
