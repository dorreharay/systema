/**
 * Prints the Studio list of the website (the table `studio_interest`, filled by POST /api/studio-interest, see routes/studio.js): how many
 * people are on it, by role and by team size, and then who they are. For the owner to read it where there is no database client: in
 * production the server's own container has the database address, so
 *
 *   railway ssh -s api -e production -p <project id> -- node /app/src/scripts/studio-interest.js
 *
 * and here, against the database of backend/.env:
 *
 *   npm run studio:interest
 *
 * `--call` keeps only the people who ticked "ready for a short conversation", `--csv` prints the rows as CSV, to paste into a spreadsheet.
 */
import { asc, eq } from 'drizzle-orm';
import { studioInterest } from '../db/schema.js';
import { fillMissingEnv } from '../utils/containerEnv.js';

const args = new Set(process.argv.slice(2));

// Inside the container a shell may lack the service's variables (the database address among them): take them from the server's process.
// The database is loaded after that, not at the top, because it reads the variables when it is loaded.
if (!process.env.DATABASE_URL) fillMissingEnv();
const { db, pool } = await import('../db/index.js');

/** A cell of CSV: one line, quoted when it holds a comma or a quote, and never a formula (a note is typed by a stranger). */
function cell(value) {
  let text = value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim();
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const day = (date) => date.toISOString().slice(0, 16).replace('T', ' ');

/** `owner 3, master 1`, most common first; what was left empty is "not said". */
function tally(rows, key) {
  const counts = new Map();
  for (const row of rows) counts.set(row[key] ?? 'not said', (counts.get(row[key] ?? 'not said') ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} ${n}`).join(', ') || 'nobody';
}

try {
  const rows = await db
    .select()
    .from(studioInterest)
    .where(args.has('--call') ? eq(studioInterest.wants_call, true) : undefined)
    .orderBy(asc(studioInterest.created_at));

  if (args.has('--csv')) {
    console.log('created_at (UTC),email,role,team_size,wants_call,language,note');
    for (const row of rows) {
      console.log([day(row.created_at), row.email, row.role, row.team_size, row.wants_call ? 'yes' : '', row.language, row.note].map(cell).join(','));
    }
  } else if (rows.length === 0) {
    console.log(args.has('--call') ? 'Nobody on the Studio list is ready for a conversation yet.' : 'Nobody is on the Studio list yet.');
  } else {
    const ready = rows.filter((row) => row.wants_call).length;
    console.log(`Studio list: ${rows.length} ${rows.length === 1 ? 'address' : 'addresses'}${args.has('--call') ? '' : `, ${ready} ready for a conversation`}`);
    console.log(`by role: ${tally(rows, 'role')}`);
    console.log(`by team size: ${tally(rows, 'team_size')}`);
    const head = ['created (UTC)', 'email', 'role', 'team', 'call', 'lang', 'note'];
    const table = rows.map((row) => [
      day(row.created_at),
      row.email,
      row.role ?? '',
      row.team_size ?? '',
      row.wants_call ? 'yes' : '',
      row.language ?? '',
      (row.note ?? '').replace(/\s+/g, ' ').slice(0, 60),
    ]);
    const widths = head.map((name, i) => Math.max(name.length, ...table.map((line) => line[i].length)));
    const show = (line) => line.map((text, i) => text.padEnd(widths[i])).join('  ').trimEnd();
    console.log('');
    console.log(show(head));
    console.log(widths.map((width) => '-'.repeat(width)).join('  '));
    for (const line of table) console.log(show(line));
    console.log('');
    console.log('Whole notes: add --csv. Only those ready for a conversation: add --call.');
  }
} catch (err) {
  console.error('Could not read the Studio list:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
