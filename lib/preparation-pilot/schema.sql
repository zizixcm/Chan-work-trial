-- Harness only. Deliberately outside application migrations.
CREATE TABLE preparation_pilot (
  application_id text NOT NULL,
  user_id text NOT NULL,
  state jsonb NOT NULL,
  PRIMARY KEY(application_id,user_id)
);
