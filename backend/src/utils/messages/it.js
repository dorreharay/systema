// The texts the server sends in Italian: the password reset email and the page behind its link (see en.js).
export default {
  email: {
    greeting: 'Ciao {name}!',
    greetingAnonymous: 'Ciao!',
    instructionText: 'Per cambiare la password, apri il link:',
    instructionHtml: 'Per cambiare la password, tocca il pulsante:',
    button: 'Cambia password',
    expiry: 'Il link è valido per {minutes} min. Se non hai chiesto di cambiare la password, puoi ignorare questa email.',
    subject: 'Reimposta la password di {appName}',
  },
  verification: {
    // The email with the code that confirms an address: {code} is the six digits, {minutes} how long the code works, {appName} the name of the app.
    subject: 'Il tuo codice di conferma per {appName}: {code}',
    intro: 'Il tuo codice di conferma:',
    expiry: 'Il codice è valido per {minutes} min. Se non hai creato un account, ignora questa email.',
  },
  page: {
    opening: 'Apertura di {name}',
    explain: 'L’app si aprirà e potrai scegliere una nuova password.',
    open: 'Apri {name}',
    hint: 'Non è successo niente? Controlla che l’app {name} sia installata su questo telefono, poi tocca il pulsante. Apri questo link sul tuo telefono.',
    brokenTitle: 'Questo link non funziona',
    broken: 'È scaduto o è già stato usato. Richiedine uno nuovo nell’app: “Password dimenticata?”.',
  },
  services: {
    labor: 'Servizio principale',
    grip: 'Sostituzione del grip',
    overgrip: 'Applicazione dell’overgrip',
  },
};
