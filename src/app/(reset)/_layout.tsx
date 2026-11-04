import AuthShell from '@/components/auth-shell';

// The page of the password reset link, on the photo of the sign-in screens. It has a group of its own, in neither of the
// two the root layout guards (one lets in the signed-out, the other the signed-in), so that the link opens whoever is
// signed in on this phone.
export default function ResetGroupLayout() {
  return <AuthShell />;
}
