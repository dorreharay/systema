import express from 'express';
import { SITE_URL, resetPasswordPage } from '../utils/pages.js';

const router = express.Router();

// GET /: someone who typed the domain of the server (myrestring.com) into a browser lands on the website.
router.get('/', (req, res) => {
  res.redirect(302, SITE_URL);
});

// GET /reset-password?token=…: the address in a password reset email, which opens the app (see utils/pages.js).
router.get('/reset-password', (req, res) => {
  // The page is in the language of the visitor: Ukrainian, or English when that is what the browser asks for first.
  const language = req.acceptsLanguages('uk', 'en') || 'uk';
  // The token is in the address: neither the page nor where the person goes from it is kept.
  res.set({ 'Cache-Control': 'no-store', Vary: 'Accept-Language' }).type('html').send(resetPasswordPage(req.query.token, language));
});

export default router;
