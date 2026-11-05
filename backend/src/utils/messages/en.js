// The texts the server sends in English: the password reset email and the page behind its link. Every language of the app has
// a file of this shape in this folder (see index.js); en.js is the one the others are translated from.
export default {
  email: {
    // {name} is the name of the person, {minutes} how long the link works, {appName} the name of the app.
    greeting: 'Hello, {name}!',
    greetingAnonymous: 'Hello!',
    instructionText: 'To change your password, open the link:',
    instructionHtml: 'To change your password, tap the button:',
    button: 'Change password',
    expiry: 'The link is valid for {minutes} min. If you did not ask to change your password, just ignore this email.',
    subject: 'Password reset for {appName}',
  },
  page: {
    // {name} is the name of the app.
    opening: 'Opening {name}',
    explain: 'The app will open so you can choose a new password.',
    open: 'Open {name}',
    hint: 'Nothing happened? Make sure {name} is installed on this phone, then tap the button. Open this link on your phone.',
    brokenTitle: 'This link doesn’t work',
    broken: 'It has expired or was already used. Ask for a new one in the app: “Forgot password?”.',
  },
};
