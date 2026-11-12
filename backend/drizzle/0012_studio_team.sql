CREATE TABLE "workshop_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"role" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshop_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "accepted_by_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "assignee_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workshop_invites" ADD CONSTRAINT "workshop_invites_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_members" ADD CONSTRAINT "workshop_members_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_members" ADD CONSTRAINT "workshop_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workshop_invites_code_idx" ON "workshop_invites" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "workshop_invites_owner_idx" ON "workshop_invites" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workshop_members_user_idx" ON "workshop_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workshop_members_owner_idx" ON "workshop_members" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_accepted_by_id_users_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_user_assignee_idx" ON "orders" USING btree ("user_id","assignee_id");--> statement-breakpoint
-- Until now every order in an account was taken in by the account's one person.
UPDATE "orders" SET "accepted_by_id" = "user_id";
