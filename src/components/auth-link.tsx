import { Link, useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { use } from 'react';

import { AuthLeaveContext } from '@/components/auth-leave';

type AuthLinkProps = ComponentProps<typeof Link>;

// A Link that lets the screen's content fade out before navigating. The stack does not animate
// between the auth screens, so their content never shows on top of each other.
export default function AuthLink({ onPress, ...props }: AuthLinkProps) {
  const router = useRouter();
  const leave = use(AuthLeaveContext);

  return (
    <Link
      {...props}
      onPress={(event) => {
        onPress?.(event);
        event.preventDefault();
        leave(() => {
          if (props.dismissTo) {
            router.dismissTo(props.href);
          } else if (props.replace) {
            router.replace(props.href);
          } else {
            router.push(props.href);
          }
        });
      }}
    />
  );
}
