import { createContext } from 'react';

// Provided by AuthLayout: fades the screen's content out, then runs the navigation. Without a
// provider the navigation runs at once.
export const AuthLeaveContext = createContext<(navigate: () => void) => void>((navigate) =>
  navigate()
);
