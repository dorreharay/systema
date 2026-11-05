// The texts the server sends in Japanese: the password reset email and the page behind its link (see en.js).
export default {
  email: {
    greeting: '{name}様、こんにちは。',
    greetingAnonymous: 'こんにちは。',
    instructionText: 'パスワードを変更するには、次のリンクを開いてください。',
    instructionHtml: 'パスワードを変更するには、下のボタンをタップしてください。',
    button: 'パスワードを変更する',
    expiry: 'リンクの有効期限は{minutes}分です。パスワードの変更をリクエストしていない場合は、このメールを破棄してください。',
    subject: '{appName}のパスワード再設定',
  },
  page: {
    opening: '{name}を開いています',
    explain: 'アプリが開きますので、新しいパスワードを設定してください。',
    open: '{name}を開く',
    hint: '何も起こらない場合は、お使いのスマートフォンに{name}がインストールされていることを確認し、ボタンをタップしてください。このリンクは必ずスマートフォンで開いてください。',
    brokenTitle: 'このリンクは使用できません',
    broken: '有効期限が切れているか、すでに使用されています。アプリの「パスワードをお忘れですか？」から、新しいリンクを発行してください。',
  },
};
