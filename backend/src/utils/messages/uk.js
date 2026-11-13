// The texts the server sends in Ukrainian: the password reset email and the page behind its link (see en.js).
export default {
  email: {
    greeting: 'Вітаємо, {name}!',
    greetingAnonymous: 'Вітаємо!',
    instructionText: 'Щоб змінити пароль, відкрийте посилання:',
    instructionHtml: 'Щоб змінити пароль, натисніть кнопку:',
    button: 'Змінити пароль',
    expiry: 'Посилання діє {minutes} хв. Якщо ви не просили змінити пароль, просто проігноруйте цей лист.',
    subject: 'Відновлення пароля {appName}',
  },
  verification: {
    // The email with the code that confirms an address: {code} is the six digits, {minutes} how long the code works, {appName} the name of the app.
    subject: 'Ваш код підтвердження {appName}: {code}',
    intro: 'Ваш код підтвердження:',
    expiry: 'Код діє {minutes} хв. Якщо ви не створювали акаунт, просто проігноруйте цей лист.',
  },
  page: {
    opening: 'Відкриваємо {name}',
    explain: 'Зараз відкриється застосунок, де ви зможете задати новий пароль.',
    open: 'Відкрити {name}',
    hint: 'Не відкрилося? Переконайтеся, що {name} встановлено на цьому телефоні, і натисніть кнопку. Це посилання треба відкривати саме на телефоні.',
    brokenTitle: 'Посилання не працює',
    broken: 'Воно застаріло або вже використане. Запросіть нове в застосунку: «Забули пароль?».',
  },
  services: {
    labor: 'Робота з перетяжки',
    grip: 'Заміна гріпа',
    overgrip: 'Намотування овергріпа',
  },
};
