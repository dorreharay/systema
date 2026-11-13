# The daily database backup on Railway: a cron service that runs backup.sh once and exits (see README.md). Deploy only this folder.
# The image brings pg_dump, pg_restore and a Postgres server for the throw-away restore check. Its major version must be the
# database's or newer, so change the tag when the Postgres service moves to a newer major version.
FROM postgres:18-alpine

RUN apk add --no-cache aws-cli curl

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

# The base image starts a database server by default. Run the backup instead, as the unprivileged user that initdb needs.
ENTRYPOINT ["/usr/local/bin/backup.sh"]
USER postgres
