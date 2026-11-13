// Tests backup.sh against a local Postgres and a fake S3 server: dump, size check, restore check, rotation and failures.
// Needs psql, createdb, dropdb, pg_dump, pg_restore, initdb, pg_ctl, curl and the aws CLI on PATH, and a local Postgres the
// current user can create databases in. It makes its own scratch databases (named restring_bt_*) and drops them at the end.
// Run it from the repository root: node backup/test.mjs
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), 'backup.sh');
const suffix = String(process.pid);
const db = {
	source: `restring_bt_source_${suffix}`,
	empty: `restring_bt_empty_${suffix}`,
	restored: `restring_bt_restored_${suffix}`,
};
const BUCKET = 'test-bucket';

// ---- a fake S3: just what the AWS CLI calls in backup.sh (put, copy, head, list, delete), path style, no signatures ----

function unchunk(body) {
	// aws-chunked bodies: "<hex size>;chunk-signature=...\r\n<data>\r\n" ... a chunk of size 0 ends the data
	const parts = [];
	let at = 0;
	while (at < body.length) {
		const eol = body.indexOf('\r\n', at);
		const size = Number.parseInt(body.subarray(at, eol).toString().split(';')[0], 16);
		if (!size) break;
		parts.push(body.subarray(eol + 2, eol + 2 + size));
		at = eol + 2 + size + 2;
	}
	return Buffer.concat(parts);
}

async function startFakeS3() {
	const objects = new Map(); // "bucket/key" -> Buffer
	const pings = [];
	const faults = { truncate: false }; // store only the first half of an upload, as a broken network could
	const server = createServer((req, res) => {
		const chunks = [];
		req.on('data', (chunk) => chunks.push(chunk));
		req.on('end', () => {
			const url = new URL(req.url, 'http://fake');
			const path = decodeURIComponent(url.pathname).replace(/^\//, '');
			if (path === 'ping') {
				pings.push(Date.now());
				res.end('ok');
				return;
			}
			const slash = path.indexOf('/');
			const bucket = slash === -1 ? path : path.slice(0, slash);
			const key = slash === -1 ? '' : path.slice(slash + 1);
			const where = `${bucket}/${key}`;
			if (req.method === 'GET' && !key) {
				const prefix = url.searchParams.get('prefix') ?? '';
				const keys = [...objects.keys()]
					.filter((k) => k.startsWith(`${bucket}/${prefix}`))
					.map((k) => k.slice(bucket.length + 1))
					.sort();
				const contents = keys
					.map(
						(k) =>
							`<Contents><Key>${k}</Key><LastModified>2026-01-01T00:00:00.000Z</LastModified><ETag>&quot;x&quot;</ETag><Size>${objects.get(`${bucket}/${k}`).length}</Size><StorageClass>STANDARD</StorageClass></Contents>`,
					)
					.join('');
				res.setHeader('content-type', 'application/xml');
				res.end(
					`<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${bucket}</Name><Prefix>${prefix}</Prefix><KeyCount>${keys.length}</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`,
				);
			} else if (req.method === 'PUT' && req.headers['x-amz-copy-source']) {
				const from = decodeURIComponent(String(req.headers['x-amz-copy-source'])).replace(/^\//, '');
				if (!objects.has(from)) {
					res.statusCode = 404;
					res.end('<Error><Code>NoSuchKey</Code></Error>');
					return;
				}
				objects.set(where, objects.get(from));
				res.setHeader('content-type', 'application/xml');
				res.end(
					'<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult><LastModified>2026-01-01T00:00:00.000Z</LastModified><ETag>&quot;x&quot;</ETag></CopyObjectResult>',
				);
			} else if (req.method === 'PUT') {
				let body = Buffer.concat(chunks);
				const sha = String(req.headers['x-amz-content-sha256'] ?? '');
				if (sha.startsWith('STREAMING') || String(req.headers['content-encoding'] ?? '').includes('aws-chunked')) {
					body = unchunk(body);
				}
				objects.set(where, faults.truncate ? body.subarray(0, Math.floor(body.length / 2)) : body);
				res.setHeader('etag', '"x"');
				res.end();
			} else if (req.method === 'HEAD' || req.method === 'GET') {
				if (!objects.has(where)) {
					res.statusCode = 404;
					res.end();
					return;
				}
				res.setHeader('content-length', objects.get(where).length);
				res.setHeader('etag', '"x"');
				res.setHeader('last-modified', 'Thu, 01 Jan 2026 00:00:00 GMT'); // the CLI reads it when it copies inside a bucket
				res.end(req.method === 'GET' ? objects.get(where) : undefined);
			} else if (req.method === 'DELETE') {
				objects.delete(where);
				res.statusCode = 204;
				res.end();
			} else {
				res.statusCode = 405;
				res.end();
			}
		});
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address();
	return {
		url: `http://127.0.0.1:${port}`,
		objects,
		pings,
		faults,
		folder: (name) =>
			[...objects.keys()]
				.filter((k) => k.startsWith(`${BUCKET}/${name}/`))
				.map((k) => k.split('/').pop())
				.sort(),
		close: () => new Promise((resolve) => server.close(resolve)),
	};
}

// ---- helpers ----

function local(cmd, args, input) {
	const result = spawnSync(cmd, args, { encoding: 'utf8', input });
	assert.equal(result.status, 0, `${cmd} ${args.join(' ')} failed: ${result.stderr}`);
	return result.stdout.trim();
}

const sql = (database, text) => local('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', database, '-tA', '-c', text]);

function runBackup(base, extra = {}) {
	// Async on purpose: the fake S3 lives in this process and has to answer while the script runs.
	return new Promise((resolve) => {
		const child = spawn('sh', [script], {
			env: { ...process.env, ...base, ...extra },
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let out = '';
		child.stdout.on('data', (data) => (out += data));
		child.stderr.on('data', (data) => (out += data));
		child.on('close', (code) => resolve({ code, out }));
	});
}

const fingerprint = (database) =>
	sql(
		database,
		`select md5(
			(select string_agg(id || ':' || name || ':' || coalesce(note, '-'), ',' order by id) from clients) ||
			(select string_agg(id || ':' || encode(data, 'hex'), ',' order by id) from photos) ||
			(select string_agg(label, ',' order by id) from other.things))`,
	);

const scratchDir = mkdtempSync(join(tmpdir(), 'backup-test-'));
let s3;

try {
	for (const name of [db.source, db.empty]) local('createdb', [name]);
	sql(
		db.source,
		`create table clients (id serial primary key, name text not null, note text);
		 insert into clients (name, note) select 'Client ' || g, case when g % 3 = 0 then null else repeat('x', 50) end from generate_series(1, 500) g;
		 create table photos (id serial primary key, client_id int references clients(id), data bytea not null);
		 insert into photos (client_id, data) select g, decode(md5(g::text) || md5((g * 7)::text), 'hex') from generate_series(1, 100) g;
		 create schema other;
		 create table other.things (id int primary key, label text);
		 insert into other.things values (1, 'ü ж 日本');`,
	);

	s3 = await startFakeS3();
	const base = {
		DATABASE_URL: `postgresql:///${db.source}`,
		BUCKET,
		ENDPOINT: s3.url,
		ACCESS_KEY_ID: 'test',
		SECRET_ACCESS_KEY: 'test',
		S3_ADDRESSING_STYLE: 'path',
		KEEP_DAILY: '3',
		KEEP_WEEKLY: '2',
		KEEP_MONTHLY: '2',
		VERIFY_RESTORE: '0',
	};

	// Files that do not follow the naming pattern must never be touched, whatever the rotation does
	const strays = ['README.txt', 'restring-manual.dump'];
	for (const stray of strays) s3.objects.set(`${BUCKET}/daily/${stray}`, Buffer.from('put here by hand'));
	const dumps = (name) => s3.folder(name).filter((file) => !strays.includes(file));

	// 1. Rotation over eight days of 2026: [date, weekday (Mon = 1 .. Sun = 7), day of the month]
	const days = [
		['20260901', 2, '01'],
		['20260906', 7, '06'],
		['20260913', 7, '13'],
		['20260920', 7, '20'],
		['20261001', 4, '01'],
		['20261004', 7, '04'],
		['20261005', 1, '05'],
		['20261101', 7, '01'],
	];
	for (const [date, weekday, monthday] of days) {
		const run = await runBackup(base, {
			BACKUP_STAMP: `${date}T010000Z`,
			BACKUP_WEEKDAY: String(weekday),
			BACKUP_MONTHDAY: monthday,
		});
		assert.equal(run.code, 0, `the run of ${date} failed:\n${run.out}`);
	}
	const named = (...dates) => dates.map((d) => `restring-${d}T010000Z.dump`);
	assert.deepEqual(dumps('daily'), named('20261004', '20261005', '20261101'), 'the three newest daily dumps stay');
	assert.deepEqual(s3.folder('weekly'), named('20261004', '20261101'), 'the two newest Sundays stay');
	assert.deepEqual(s3.folder('monthly'), named('20261001', '20261101'), 'the two newest first-of-the-month dumps stay');
	for (const stray of strays) assert.ok(s3.objects.has(`${BUCKET}/daily/${stray}`), `${stray} was left alone`);
	assert.equal(s3.objects.size, 7 + strays.length, 'nothing else is in the bucket');

	// 2. A full run, restore check included, and the ping of the health check
	const full = await runBackup(base, {
		BACKUP_STAMP: '20261102T010000Z',
		BACKUP_WEEKDAY: '1',
		BACKUP_MONTHDAY: '02',
		VERIFY_RESTORE: '1',
		HEALTHCHECK_URL: `${s3.url}/ping`,
	});
	assert.equal(full.code, 0, `the full run failed:\n${full.out}`);
	assert.match(full.out, /restore check: 3 tables/, 'the throw-away server restored all three tables');
	assert.equal(s3.pings.length, 1, 'one ping after a good run');
	assert.deepEqual(dumps('daily'), named('20261005', '20261101', '20261102'));

	// 3. The stored dump restores into a fresh database with the same content, byte for byte
	const dumpFile = join(scratchDir, 'latest.dump');
	writeFileSync(dumpFile, s3.objects.get(`${BUCKET}/daily/restring-20261102T010000Z.dump`));
	local('createdb', [db.restored]);
	local('pg_restore', ['--no-owner', '--exit-on-error', `--dbname=${db.restored}`, dumpFile]);
	assert.equal(fingerprint(db.restored), fingerprint(db.source), 'the restored data equals the original');

	// 4. Failures: nothing is uploaded, deleted or pinged
	const before = JSON.stringify([...s3.objects.keys()].sort());
	const pingsBefore = s3.pings.length;
	const failures = [
		['an empty database', { DATABASE_URL: `postgresql:///${db.empty}` }, /no table data|only \d+ bytes/],
		['a database that does not exist', { DATABASE_URL: 'postgresql:///restring_bt_missing' }, /does not exist|pg_dump/],
		['KEEP_DAILY=0', { KEEP_DAILY: '0' }, /KEEP_DAILY must be at least 1/],
		['KEEP_DAILY=08', { KEEP_DAILY: '08' }, /KEEP_DAILY must be a whole number/],
		['no bucket', { BUCKET: '' }, /BUCKET is not set/],
	];
	for (const [label, extra, pattern] of failures) {
		const run = await runBackup(base, {
			BACKUP_STAMP: '20270101T010000Z',
			BACKUP_WEEKDAY: '5',
			BACKUP_MONTHDAY: '01',
			HEALTHCHECK_URL: `${s3.url}/ping`,
			...extra,
		});
		assert.notEqual(run.code, 0, `${label}: the run must fail`);
		assert.match(run.out, pattern, `${label}: ${run.out}`);
	}
	assert.equal(JSON.stringify([...s3.objects.keys()].sort()), before, 'failed runs changed nothing in the bucket');
	assert.equal(s3.pings.length, pingsBefore, 'failed runs sent no ping');

	// 4b. The bucket cannot be reached: the run fails, and the bucket (which is down) is not asked to delete anything
	const down = await runBackup(base, {
		BACKUP_STAMP: '20270103T010000Z',
		BACKUP_WEEKDAY: '7',
		BACKUP_MONTHDAY: '03',
		ENDPOINT: 'http://127.0.0.1:9',
		AWS_MAX_ATTEMPTS: '1',
	});
	assert.notEqual(down.code, 0, 'an unreachable bucket fails the run');
	assert.equal(JSON.stringify([...s3.objects.keys()].sort()), before, 'nothing changed');

	// 4c. An upload that arrives cut in half: the size check catches it, nothing is pruned, nothing is pinged
	s3.faults.truncate = true;
	const cut = await runBackup(base, {
		BACKUP_STAMP: '20270102T010000Z',
		BACKUP_WEEKDAY: '6',
		BACKUP_MONTHDAY: '02',
		HEALTHCHECK_URL: `${s3.url}/ping`,
	});
	s3.faults.truncate = false;
	assert.notEqual(cut.code, 0, 'a truncated upload fails the run');
	assert.match(cut.out, /the bucket holds \d+ bytes of daily\/restring-20270102T010000Z\.dump/);
	assert.equal(dumps('daily').length, 4, 'the three good dumps and the cut one are all still there: nothing was pruned');
	assert.equal(s3.pings.length, pingsBefore, 'no ping after the failure');

	// 5. A restore check that cannot run (initdb replaced by a stub that fails): the dump stays, nothing else happens
	const stubs = join(scratchDir, 'stubs');
	local('mkdir', [stubs]);
	writeFileSync(join(stubs, 'initdb'), '#!/bin/sh\necho "stub initdb: no" >&2\nexit 1\n');
	chmodSync(join(stubs, 'initdb'), 0o755);
	const broken = await runBackup(base, {
		BACKUP_STAMP: '20270801T010000Z',
		BACKUP_WEEKDAY: '7',
		BACKUP_MONTHDAY: '01',
		VERIFY_RESTORE: '1',
		HEALTHCHECK_URL: `${s3.url}/ping`,
		PATH: `${stubs}:${process.env.PATH}`,
	});
	assert.notEqual(broken.code, 0, 'a restore check that cannot run fails the run');
	assert.match(broken.out, /initdb of the throw-away server failed/);
	assert.ok(s3.folder('daily').includes('restring-20270801T010000Z.dump'), 'the dump itself was uploaded before the check');
	assert.equal(dumps('daily').length, 5, 'nothing was pruned after either failure');
	assert.ok(!s3.folder('weekly').includes('restring-20270801T010000Z.dump'), 'no weekly copy after the failure');
	assert.ok(!s3.folder('monthly').includes('restring-20270801T010000Z.dump'), 'no monthly copy after the failure');
	assert.equal(s3.pings.length, pingsBefore, 'no ping after the failure');
} finally {
	await s3?.close();
	for (const name of Object.values(db)) spawnSync('dropdb', ['--if-exists', name]);
	rmSync(scratchDir, { recursive: true, force: true });
}

console.log('backup: ok');
