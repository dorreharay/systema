// The texts the server sends in French: the password reset email and the page behind its link (see en.js).
export default {
  email: {
    greeting: 'Bonjour {name},',
    greetingAnonymous: 'Bonjour,',
    instructionText: 'Pour modifier votre mot de passe, ouvrez le lien suivant :',
    instructionHtml: 'Pour modifier votre mot de passe, appuyez sur le bouton :',
    button: 'Modifier le mot de passe',
    expiry: 'Ce lien est valable {minutes} min. Si vous n’avez pas demandé la modification de votre mot de passe, ignorez simplement cet e-mail.',
    subject: 'Réinitialisation du mot de passe pour {appName}',
  },
  verification: {
    // The email with the code that confirms an address: {code} is the six digits, {minutes} how long the code works, {appName} the name of the app.
    subject: 'Votre code de confirmation {appName} : {code}',
    intro: 'Votre code de confirmation :',
    expiry: 'Ce code est valable {minutes} min. Si vous n’avez pas créé de compte, ignorez simplement cet e-mail.',
  },
  page: {
    opening: 'Ouverture de {name}',
    explain: 'L’application va s’ouvrir pour que vous puissiez choisir un nouveau mot de passe.',
    open: 'Ouvrir {name}',
    hint: 'Rien ne s’est passé ? Vérifiez que l’application {name} est installée sur ce téléphone, puis appuyez sur le bouton. Ouvrez ce lien directement sur votre téléphone.',
    brokenTitle: 'Ce lien ne fonctionne pas',
    broken: 'Il a expiré ou a déjà été utilisé. Demandez-en un nouveau dans l’application : « Mot de passe oublié ? ».',
  },
  services: {
    labor: 'Service principal',
    grip: 'Remplacement du grip',
    overgrip: 'Pose de surgrip',
  },
};
