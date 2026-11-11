import { sql } from 'drizzle-orm';
import express from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { studioInterest } from '../db/schema.js';
import { studioInterestLimiter } from '../middleware/rateLimit.js';
import { parseQuery } from '../middleware/validate.js';
import { HttpError } from '../utils/http.js';
import { studioPageUrl } from '../utils/pages.js';
import { optionalText } from '../utils/validators.js';

const router = express.Router();

// Studio (several stringers in one workshop) does not exist yet. The website has a page about it with a form that puts a visitor on the
// list of those who want to hear when it does, and says who they are, so that the demand can be counted before anything is built. It is
// the same list as the one in the app (`users.studio_waitlist_at`) for someone who has no account.
export const STUDIO_ROLES = ['owner', 'master', 'reception', 'club', 'other'];
export const STUDIO_TEAM_SIZES = ['1', '2', '3', '4-6', '7+'];

// A value that is not one of the choices is dropped, not refused: a visitor's address is worth more than a tidy answer.
const oneOf = (choices) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (choices.includes(value) ? value : null));

const body = z.object({
  email: z
    .string({ error: 'Enter your email' })
    .trim()
    .toLowerCase()
    .max(254, 'At most 254 characters')
    .pipe(z.email('Invalid email')),
  role: oneOf(STUDIO_ROLES),
  team_size: oneOf(STUDIO_TEAM_SIZES),
  note: optionalText(1000),
  // The page the form was on, so the visitor is sent back to the same language. Anything but 'en' is Ukrainian.
  lang: z
    .string()
    .optional()
    .transform((value) => (value === 'en' ? 'en' : 'uk')),
  // A box that is ticked in a form (`1`, `on`) or true in JSON.
  talk: z
    .any()
    .optional()
    .transform((value) => value === true || value === '1' || value === 'on' || value === 'true'),
  // A field no person sees (the form hides it): a robot fills it, and then nothing is kept.
  website: z.string().optional(),
});

// POST /api/studio-interest: puts an address on the list. Public. A form of the website posts it as a plain HTML form (the site has no
// script) and is answered with a redirect to a page of the site; anything else sends JSON and gets JSON. Asking twice does not make a second
// row: what the person says the second time replaces what they said the first, and what they leave out stays.
// (The form is read before the limit is checked, so that a visitor who is over it is sent back to the page of their language.)
router.post('/', express.urlencoded({ extended: false, limit: '8kb' }), studioInterestLimiter, async (req, res) => {
  const fromForm = Boolean(req.is('application/x-www-form-urlencoded'));
  let data;
  try {
    data = parseQuery(body, req.body);
  } catch (error) {
    if (fromForm && error instanceof HttpError) {
      return res.redirect(303, studioPageUrl(req.body?.lang === 'en' ? 'en' : 'uk', '#error'));
    }
    throw error;
  }

  // The robot is told it worked.
  if (!data.website) {
    await db
      .insert(studioInterest)
      .values({
        email: data.email,
        role: data.role,
        team_size: data.team_size,
        note: data.note ?? null,
        language: data.lang,
        wants_call: data.talk,
      })
      .onConflictDoUpdate({
        target: studioInterest.email,
        set: {
          role: sql`coalesce(excluded.role, ${studioInterest.role})`,
          team_size: sql`coalesce(excluded.team_size, ${studioInterest.team_size})`,
          note: sql`coalesce(excluded.note, ${studioInterest.note})`,
          language: sql`excluded.language`,
          wants_call: sql`(${studioInterest.wants_call} or excluded.wants_call)`,
          updated_at: sql`now()`,
        },
      });
  }

  if (fromForm) return res.redirect(303, studioPageUrl(data.lang, 'thanks/'));
  res.json({ ok: true });
});

export default router;
