#!/bin/sh
# Daily backup of the production database. See README.md.
#
#   1. pg_dump in the custom format (compressed; pg_restore of the same or a newer major version reads it).
#   2. Check the file: not tiny, readable by pg_restore, holds table data.
#   3. Upload it as daily/restring-<UTC time>.dump and compare the stored size with the local file.
#   4. Restore it into a throw-away Postgres server started inside this container and compare the tables
#      (VERIFY_RESTORE=0 skips this).
#   5. On Sundays (UTC) keep a copy under weekly/, on the 1st of a month under monthly/ (a copy inside the bucket).
#   6. Delete everything but the newest KEEP_DAILY, KEEP_WEEKLY and KEEP_MONTHLY files of each folder.
#   7. Ping HEALTHCHECK_URL if it is set, so a monitor notices a day without a good backup.
#
# A failed step ends the run with a non-zero code (Railway shows the run as failed). After a failure nothing is copied to
# weekly/ or monthly/, nothing is deleted and nothing is pinged.
#
# BACKUP_STAMP, BACKUP_WEEKDAY (1 Monday .. 7 Sunday) and BACKUP_MONTHDAY (01..31) replace the clock; the tests use them.
set -eu
umask 077

die() {
	echo "backup failed: $*" >&2
	exit 1
}

: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${BUCKET:?BUCKET is not set}"
: "${ENDPOINT:?ENDPOINT is not set}"
: "${ACCESS_KEY_ID:?ACCESS_KEY_ID is not set}"
: "${SECRET_ACCESS_KEY:?SECRET_ACCESS_KEY is not set}"

# A whole number without a leading zero (the shell would read 08 as octal): name, value, smallest allowed value.
number() {
	case "$2" in
		'' | *[!0-9]* | 0?*) die "$1 must be a whole number without a leading zero, got '$2'" ;;
	esac
	[ "$2" -ge "$3" ] || die "$1 must be at least $3, got $2"
}

KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${KEEP_MONTHLY:-0}"
number KEEP_DAILY "$KEEP_DAILY" 1
number KEEP_WEEKLY "$KEEP_WEEKLY" 0
number KEEP_MONTHLY "$KEEP_MONTHLY" 0

STAMP="${BACKUP_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
WEEKDAY="${BACKUP_WEEKDAY:-$(date -u +%u)}"
MONTHDAY="${BACKUP_MONTHDAY:-$(date -u +%d)}"
NAME="restring-$STAMP.dump"
KEY="daily/$NAME"

WORK="$(mktemp -d)"
SCRATCH="$WORK/scratch"
SOCKET="$WORK/socket"
SCRATCH_PORT=54329
cleanup() {
	if [ -f "$SCRATCH/postmaster.pid" ]; then
		pg_ctl --pgdata="$SCRATCH" --mode=immediate --wait stop > /dev/null 2>&1 || true
	fi
	rm -rf "$WORK"
}
trap cleanup EXIT

# The S3 side. The keys come from the bucket's Railway variables; the config file only sets how the bucket is addressed
# (Railway's buckets answer at <bucket>.<endpoint>; S3_ADDRESSING_STYLE=path switches to <endpoint>/<bucket>). The
# checksum settings keep newer AWS CLI versions from sending checksums that S3-compatible stores may not know.
export AWS_ACCESS_KEY_ID="$ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${REGION:-auto}"
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
export AWS_EC2_METADATA_DISABLED=true
export AWS_PAGER=
export AWS_CONFIG_FILE="$WORK/aws-config"
export AWS_SHARED_CREDENTIALS_FILE="$WORK/aws-credentials"
printf '[default]\ns3 =\n    addressing_style = %s\n' "${S3_ADDRESSING_STYLE:-virtual}" > "$AWS_CONFIG_FILE"

aws_s3() {
	aws s3 "$@" --endpoint-url "$ENDPOINT" --only-show-errors --cli-connect-timeout 30 --cli-read-timeout 300
}

aws_api() {
	aws s3api "$@" --endpoint-url "$ENDPOINT" --cli-connect-timeout 30 --cli-read-timeout 300
}

# Run a Postgres client tool against the throw-away server: tool, then its own arguments.
on_scratch() {
	tool="$1"
	shift
	"$tool" --host="$SOCKET" --port="$SCRATCH_PORT" --username=scratch "$@"
}

verify_restore() {
	mkdir "$SOCKET"
	# LC_ALL=C: a server started under an odd locale setting can stop with "postmaster became multithreaded" (seen on macOS)
	LC_ALL=C initdb --pgdata="$SCRATCH" --username=scratch --auth=trust --encoding=UTF8 --locale=C > "$WORK/initdb.log" 2>&1 || {
		cat "$WORK/initdb.log" >&2
		die "initdb of the throw-away server failed"
	}
	LC_ALL=C pg_ctl --pgdata="$SCRATCH" --log="$WORK/scratch.log" --wait --timeout=60 \
		-o "-p $SCRATCH_PORT -c listen_addresses='' -c unix_socket_directories=$SOCKET -c fsync=off -c shared_buffers=32MB -c max_connections=10 -c dynamic_shared_memory_type=mmap" \
		start > /dev/null || {
		cat "$WORK/scratch.log" >&2
		die "the throw-away server did not start"
	}
	on_scratch createdb restored
	on_scratch pg_restore --dbname=restored --no-owner --exit-on-error "$FILE" || die "restoring the dump into the throw-away server failed"
	expected="$(grep -E '^[0-9]+; [0-9]+ [0-9]+ TABLE ' "$WORK/toc.txt" | grep -vc 'TABLE DATA' || true)"
	restored="$(on_scratch psql --dbname=restored --no-psqlrc --tuples-only --no-align --command "select count(*) from pg_tables where schemaname not in ('pg_catalog', 'information_schema')")"
	[ "$restored" = "$expected" ] || die "the restored copy has $restored tables, the dump lists $expected"
	RESTORED_TABLES="$restored"
}

# Keep the newest $2 dumps of folder $1, delete the rest. Only names of our own pattern are ever touched.
prune() {
	folder="$1"
	keep="$2"
	keys="$(aws_api list-objects-v2 --bucket "$BUCKET" --prefix "$folder/" --query 'Contents[].Key' --output text)"
	[ "$keys" != None ] || return 0
	old="$(printf '%s\n' "$keys" | tr '\t' '\n' | grep -E "^$folder/restring-[0-9]{8}T[0-9]{6}Z\.dump\$" | sort -r | tail -n +"$((keep + 1))")"
	for key in $old; do
		echo "removing $key"
		aws_s3 rm "s3://$BUCKET/$key"
	done
}

FILE="$WORK/$NAME"
echo "dumping the database"
PGCONNECT_TIMEOUT=30 pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$FILE"

SIZE="$(wc -c < "$FILE" | tr -d ' ')"
[ "$SIZE" -ge 4096 ] || die "the dump is only $SIZE bytes"
pg_restore --list "$FILE" > "$WORK/toc.txt" || die "pg_restore cannot read the dump"
TABLES="$(grep -c 'TABLE DATA' "$WORK/toc.txt" || true)"
[ "$TABLES" -ge 1 ] || die "the dump holds no table data"

echo "uploading $KEY ($SIZE bytes, $TABLES tables with data)"
aws_s3 cp "$FILE" "s3://$BUCKET/$KEY"
STORED="$(aws_api head-object --bucket "$BUCKET" --key "$KEY" --query ContentLength --output text)"
[ "$STORED" = "$SIZE" ] || die "the bucket holds $STORED bytes of $KEY, the dump has $SIZE"

RESTORED_TABLES="not checked"
if [ "${VERIFY_RESTORE:-1}" = 1 ]; then
	echo "restoring the dump into a throw-away server to check it"
	verify_restore
fi

if [ "$WEEKDAY" = 7 ] && [ "$KEEP_WEEKLY" -gt 0 ]; then
	aws_s3 cp "s3://$BUCKET/$KEY" "s3://$BUCKET/weekly/$NAME"
fi
if [ "$MONTHDAY" = 01 ] && [ "$KEEP_MONTHLY" -gt 0 ]; then
	aws_s3 cp "s3://$BUCKET/$KEY" "s3://$BUCKET/monthly/$NAME"
fi

prune daily "$KEEP_DAILY"
prune weekly "$KEEP_WEEKLY"
prune monthly "$KEEP_MONTHLY"

if [ -n "${HEALTHCHECK_URL:-}" ]; then
	curl --fail --silent --show-error --max-time 15 --retry 3 --output /dev/null "$HEALTHCHECK_URL" || echo "warning: could not ping the health check" >&2
fi

echo "backup ok: $KEY, $SIZE bytes, restore check: $RESTORED_TABLES tables"
