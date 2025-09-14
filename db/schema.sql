
-- Core
create table if not exists clients(
  id serial primary key,
  name text not null,
  orgnr text,
  contact_email text,
  phone text
);
create table if not exists consultants(
  id serial primary key,
  code text unique,
  name text not null,
  role text,
  hourly_wage numeric
);
create table if not exists recruitments(
  id serial primary key,
  client_id int references clients(id) on delete set null,
  role text,
  candidate_name text,
  monthly_salary numeric,
  stage text
);
create table if not exists assignments(
  id serial primary key,
  client_id int references clients(id) on delete set null,
  consultant_id int references consultants(id) on delete set null,
  start_ts timestamptz,
  end_ts timestamptz,
  hours numeric,
  place text,
  schedule text
);
create table if not exists invoices(
  id serial primary key,
  client_id int references clients(id) on delete set null,
  date date default now(),
  amount numeric,
  type text,
  payload jsonb
);
create table if not exists payroll(
  id serial primary key,
  consultant_id int references consultants(id) on delete set null,
  month text,
  gross numeric,
  status text
);
-- Jobs & Candidates
create table if not exists jobs(
  id serial primary key,
  title text not null,
  client text,
  description text,
  created_at timestamptz default now()
);
create table if not exists candidates(
  id serial primary key,
  job_id int references jobs(id) on delete cascade,
  name text not null,
  email text,
  cv_url text,
  rating int,
  notes text,
  created_at timestamptz default now()
);
