import { config } from '../config.js';

const escapeHtml = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** The email with the link to choose a new password. `name` may be missing. */
export function passwordResetEmail({ name, url, minutes }) {
  const greeting = name ? `Вітаємо, ${name}!` : 'Вітаємо!';
  const lines = [
    greeting,
    '',
    'Щоб змінити пароль, відкрийте посилання:',
    '',
    url,
    '',
    `Посилання діє ${minutes} хв. Якщо ви не просили змінити пароль, просто проігноруйте цей лист.`,
  ];

  return {
    subject: `Відновлення пароля ${config.appName}`,
    text: lines.join('\n'),
    html: [
      '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#111">',
      `<p>${escapeHtml(greeting)}</p>`,
      '<p>Щоб змінити пароль, натисніть кнопку:</p>',
      `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#173c32;color:#fff;text-decoration:none;font-weight:600">Змінити пароль</a></p>`,
      `<p style="color:#555">Посилання діє ${minutes} хв. Якщо ви не просили змінити пароль, просто проігноруйте цей лист.</p>`,
      '</div>',
    ].join(''),
  };
}
