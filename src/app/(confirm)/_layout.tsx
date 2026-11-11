import AuthShell from '@/components/auth-shell';

// The screen for the code that confirms the email address of a new account, on the photo of the sign-in screens. It has a group of its
// own: the root layout opens it for someone who is signed in and has not confirmed the address yet, and for nobody else.
export default function ConfirmGroupLayout() {
  return <AuthShell />;
}
