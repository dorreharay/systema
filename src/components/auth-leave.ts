import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import type { ComponentRef } from 'react';
import { createContext, use } from 'react';
import type { View } from 'react-native';

/** What a ref to a View holds. */
export type AuthViewRef = ComponentRef<typeof View>;

// Provided by AuthLayout: fades the screen's content out, then runs the navigation. Without a
// provider the navigation runs at once.
export const AuthLeaveContext = createContext<(navigate: () => void) => void>((navigate) =>
  navigate()
);

// Provided by AuthLayout: the button that sends the form (see AuthSubmit) says where it is, so that the keyboard (see AuthLayout)
// goes just under it and not under the other ways in below it. Without a provider (a button somewhere else) it does nothing.
export type AuthSubmitRegistry = {
  measure: (button: AuthViewRef) => void;
  forget: () => void;
};
export const AuthSubmitContext = createContext<AuthSubmitRegistry | null>(null);

// A sign-in screen keeps its content hidden while it is not in focus. The stack's back swipe shows the screen under the one
// being dragged, and that screen shows its content for as long as the swipe lasts. If the swipe is let go too soon, only
// the screen that was dragged hears of it, so it tells all the others (to hide again).
const covers = new Set<() => void>();
export const addCover = (cover: () => void) => {
  covers.add(cover);
  return () => {
    covers.delete(cover);
  };
};
export const coverAll = () => covers.forEach((cover) => cover());

// Navigation for code inside an AuthLayout that is not a link, for example a form submit.
export function useAuthRouter() {
  const router = useRouter();
  const leave = use(AuthLeaveContext);

  return {
    push: (href: Href) => leave(() => router.push(href)),
    replace: (href: Href) => leave(() => router.replace(href)),
    dismissTo: (href: Href) => leave(() => router.dismissTo(href)),
    // Back to where the person was, or to `fallback` when this screen is the first one (opened by a link).
    back: (fallback: Href) => leave(() => (router.canGoBack() ? router.back() : router.replace(fallback))),
  };
}
