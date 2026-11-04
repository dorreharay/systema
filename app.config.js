// app.json holds the settings that stay the same. This adds what depends on the environment. Google Sign-In needs the
// iOS client ID, read backwards, as a URL scheme of the app. Taking it from the client ID means the one setting,
// EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in .env, serves both the build and the app (see docs/google-sign-in.md). And a build
// that goes to other people's phones is stopped if it does not know where the backend is (see docs/release.md).

// "123-abc.apps.googleusercontent.com" -> "com.googleusercontent.apps.123-abc"
const urlSchemeOf = (clientId) => clientId.split('.').reverse().join('.');

// Without a client ID the app still builds, and its Google button says that sign-in is not set up. The plugin insists
// on a scheme, so it gets one that matches no real client.
const UNSET_SCHEME = 'com.googleusercontent.apps.not-set-up';

// The build profiles of eas.json whose apps are finished apps: installed on other people's phones, or run in a simulator
// with no Metro. Nothing is there to show such an app the backend, so it is told the address, and a build without it would
// be uploaded to the store and then fail on every request.
const SHIPPED_PROFILES = ['preview', 'simulator', 'production'];

module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  if (iosClientId && !iosClientId.endsWith('.apps.googleusercontent.com')) {
    throw new Error(
      `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID should look like 1234567890-abc.apps.googleusercontent.com, not "${iosClientId}"`
    );
  }

  const profile = process.env.EAS_BUILD_PROFILE;
  if (SHIPPED_PROFILES.includes(profile) && !process.env.EXPO_PUBLIC_API_URL?.trim().startsWith('https://')) {
    throw new Error(
      `The "${profile}" build needs EXPO_PUBLIC_API_URL, the https:// address of the backend. Set it for this ` +
        `environment: npx eas-cli@latest env:set --name EXPO_PUBLIC_API_URL --value https://... ` +
        `--environment ${profile} --visibility plaintext`
    );
  }

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      [
        '@react-native-google-signin/google-signin',
        { iosUrlScheme: iosClientId ? urlSchemeOf(iosClientId) : UNSET_SCHEME },
      ],
    ],
  };
};
