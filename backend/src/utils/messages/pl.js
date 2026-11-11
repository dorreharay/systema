// The texts the server sends in Polish: the password reset email and the page behind its link (see en.js).
export default {
  email: {
    greeting: 'Dzień dobry, {name}!',
    greetingAnonymous: 'Dzień dobry!',
    instructionText: 'Aby zmienić hasło, otwórz link:',
    instructionHtml: 'Aby zmienić hasło, kliknij przycisk:',
    button: 'Zmień hasło',
    expiry: 'Link jest ważny przez {minutes} min. Jeśli prośba o zmianę hasła nie pochodzi od Ciebie, po prostu zignoruj tę wiadomość.',
    subject: 'Resetowanie hasła do {appName}',
  },
  verification: {
    // The email with the code that confirms an address: {code} is the six digits, {minutes} how long the code works, {appName} the name of the app.
    subject: 'Twój kod potwierdzający {appName}: {code}',
    intro: 'Twój kod potwierdzający:',
    expiry: 'Kod jest ważny przez {minutes} min. Jeśli nie zakładasz konta, po prostu zignoruj tę wiadomość.',
  },
  page: {
    opening: 'Otwieramy aplikację {name}',
    explain: 'Za chwilę otworzy się aplikacja, w której ustawisz nowe hasło.',
    open: 'Otwórz {name}',
    hint: 'Aplikacja się nie otworzyła? Upewnij się, że aplikacja {name} jest zainstalowana na tym telefonie, i naciśnij przycisk. Ten link trzeba otworzyć na telefonie.',
    brokenTitle: 'Ten link nie działa',
    broken: 'Wygasł lub został już użyty. Poproś o nowy w aplikacji: „Nie pamiętasz hasła?”.',
  },
  services: {
    labor: 'Usługa podstawowa',
    grip: 'Wymiana gripu',
    overgrip: 'Założenie overgripu',
  },
};
