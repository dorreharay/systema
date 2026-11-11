-- The service that every order gets (kind "labor") used to start under a name taken from the work itself ("Stringing Labor", "Робота з
-- перетяжки", ...). A new account now starts with "Main Service" and its counterparts (see backend/src/utils/messages). This gives the
-- accounts that were made before the same name, in the language each was made in. A name the stringer typed or changed is not touched:
-- only a row that still has the exact old default is renamed.
UPDATE "services"
SET
	"name" = CASE "name"
		WHEN 'Робота з перетяжки' THEN 'Основна послуга'
		WHEN 'Stringing Labor' THEN 'Main Service'
		WHEN 'Bespannung' THEN 'Hauptleistung'
		WHEN 'Main-d’œuvre de cordage' THEN 'Service principal'
		WHEN 'Encordado' THEN 'Servicio principal'
		WHEN 'Incordatura' THEN 'Servizio principale'
		WHEN 'Encordoamento' THEN 'Serviço principal'
		WHEN 'ガット張り工賃' THEN '基本サービス'
		WHEN 'Naciąganie' THEN 'Usługa podstawowa'
	END,
	"updated_at" = now()
WHERE "kind" = 'labor'
	AND "name" IN (
		'Робота з перетяжки',
		'Stringing Labor',
		'Bespannung',
		'Main-d’œuvre de cordage',
		'Encordado',
		'Incordatura',
		'Encordoamento',
		'ガット張り工賃',
		'Naciąganie'
	);
