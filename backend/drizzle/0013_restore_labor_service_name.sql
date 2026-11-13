-- The service that every order gets (kind "labor") goes back to a name taken from the work itself ("Робота з перетяжки", "Stringing
-- Labor", ...), the one it had before migration 0007 renamed it to "Main Service" and its counterparts. A new account now starts with
-- that name again (see backend/src/utils/messages). This gives the accounts that were made meanwhile the same name, in the language each
-- was made in. A name the stringer typed or changed is not touched: only a row that still has the exact name of the last default is
-- renamed.
UPDATE "services"
SET
	"name" = CASE "name"
		WHEN 'Основна послуга' THEN 'Робота з перетяжки'
		WHEN 'Main Service' THEN 'Stringing Labor'
		WHEN 'Hauptleistung' THEN 'Bespannung'
		WHEN 'Service principal' THEN 'Main-d’œuvre de cordage'
		WHEN 'Servicio principal' THEN 'Encordado'
		WHEN 'Servizio principale' THEN 'Incordatura'
		WHEN 'Serviço principal' THEN 'Encordoamento'
		WHEN '基本サービス' THEN 'ガット張り工賃'
		WHEN 'Usługa podstawowa' THEN 'Naciąganie'
	END,
	"updated_at" = now()
WHERE "kind" = 'labor'
	AND "name" IN (
		'Основна послуга',
		'Main Service',
		'Hauptleistung',
		'Service principal',
		'Servicio principal',
		'Servizio principale',
		'Serviço principal',
		'基本サービス',
		'Usługa podstawowa'
	);
