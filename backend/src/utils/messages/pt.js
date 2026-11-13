// The texts the server sends in Portuguese (Brazil): the password reset email and the page behind its link (see en.js).
export default {
  email: {
    greeting: 'Olá, {name}!',
    greetingAnonymous: 'Olá!',
    instructionText: 'Para alterar sua senha, abra o link:',
    instructionHtml: 'Para alterar sua senha, toque no botão:',
    button: 'Alterar senha',
    expiry: 'O link é válido por {minutes} min. Se você não solicitou a alteração da senha, basta ignorar este e-mail.',
    subject: 'Redefinição de senha do {appName}',
  },
  verification: {
    // The email with the code that confirms an address: {code} is the six digits, {minutes} how long the code works, {appName} the name of the app.
    subject: 'Seu código de confirmação do {appName}: {code}',
    intro: 'Seu código de confirmação:',
    expiry: 'O código é válido por {minutes} min. Se você não criou uma conta, basta ignorar este e-mail.',
  },
  page: {
    opening: 'Abrindo o {name}',
    explain: 'O app será aberto para que você escolha uma nova senha.',
    open: 'Abrir o {name}',
    hint: 'Nada aconteceu? Confirme se o {name} está instalado neste celular e toque no botão. Abra este link no celular.',
    brokenTitle: 'Este link não funciona',
    broken: 'Ele expirou ou já foi usado. Peça um novo no app: “Esqueceu a senha?”.',
  },
  services: {
    labor: 'Encordoamento',
    grip: 'Troca de grip',
    overgrip: 'Aplicação de overgrip',
  },
};
