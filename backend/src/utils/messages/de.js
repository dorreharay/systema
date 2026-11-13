// The texts the server sends in German: the password reset email and the page behind its link (see en.js).
export default {
  email: {
    greeting: 'Hallo {name}!',
    greetingAnonymous: 'Hallo!',
    instructionText: 'Um Ihr Passwort zu ändern, öffnen Sie diesen Link:',
    instructionHtml: 'Um Ihr Passwort zu ändern, tippen Sie auf die Schaltfläche:',
    button: 'Passwort ändern',
    expiry: 'Der Link ist {minutes} Min. gültig. Falls Sie keine Änderung Ihres Passworts angefordert haben, können Sie diese E-Mail einfach ignorieren.',
    subject: 'Passwort für {appName} zurücksetzen',
  },
  verification: {
    // The email with the code that confirms an address: {code} is the six digits, {minutes} how long the code works, {appName} the name of the app.
    subject: 'Ihr Bestätigungscode für {appName}: {code}',
    intro: 'Ihr Bestätigungscode:',
    expiry: 'Der Code ist {minutes} Min. gültig. Falls Sie kein Konto erstellt haben, ignorieren Sie diese E-Mail einfach.',
  },
  page: {
    opening: '{name} wird geöffnet',
    explain: 'Die App öffnet sich, damit Sie ein neues Passwort festlegen können.',
    open: '{name} öffnen',
    hint: 'Nichts passiert? Stellen Sie sicher, dass {name} auf diesem Telefon installiert ist, und tippen Sie dann auf die Schaltfläche. Öffnen Sie diesen Link direkt auf Ihrem Telefon.',
    brokenTitle: 'Dieser Link funktioniert nicht',
    broken: 'Der Link ist abgelaufen oder wurde bereits verwendet. Tippen Sie in der App auf „Passwort vergessen?“, um einen neuen anzufordern.',
  },
  services: {
    labor: 'Bespannung',
    grip: 'Griffbandwechsel',
    overgrip: 'Overgrip anbringen',
  },
};
