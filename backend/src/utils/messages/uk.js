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
  page: {
    opening: 'Відкриваємо {name}',
    explain: 'Зараз відкриється застосунок, де ви зможете задати новий пароль.',
    open: 'Відкрити {name}',
    hint: 'Не відкрилося? Переконайтеся, що {name} встановлено на цьому телефоні, і натисніть кнопку. Це посилання треба відкривати саме на телефоні.',
    brokenTitle: 'Посилання не працює',
    broken: 'Воно застаріло або вже використане. Запросіть нове в застосунку: «Забули пароль?».',
  },
};
