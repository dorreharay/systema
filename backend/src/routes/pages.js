import express from 'express';
import { LANGUAGES } from '../utils/messages/index.js';
import { SITE_URL, resetPasswordPage } from '../utils/pages.js';

const router = express.Router();

// GET /: someone who typed the domain of the server (myrestring.com) into a browser lands on the website.
router.get('/', (req, res) => {
  res.redirect(302, SITE_URL);
});

// GET /reset-password?token=…: the address in a password reset email, which opens the app (see utils/pages.js).
router.get('/reset-password', (req, res) => {
  // The page is in the language of the visitor, when it is one of the app's; Ukrainian when the browser does not ask for any of
  // them (and first in the list, so that a browser that says nothing gets it too).
  const language = req.acceptsLanguages('uk', ...LANGUAGES.filter((code) => code !== 'uk')) || 'uk';
  // The token is in the address: neither the page nor where the person goes from it is kept.
  res.set({ 'Cache-Control': 'no-store', Vary: 'Accept-Language' }).type('html').send(resetPasswordPage(req.query.token, language));
});

export default router;
