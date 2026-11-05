CREATE TABLE "applied_operations" (
	"user_id" uuid NOT NULL,
	"op_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applied_operations_user_id_op_id_pk" PRIMARY KEY("user_id","op_id")
);
--> statement-breakpoint
ALTER TABLE "applied_operations" ADD CONSTRAINT "applied_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applied_operations_created_idx" ON "applied_operations" USING btree ("created_at");