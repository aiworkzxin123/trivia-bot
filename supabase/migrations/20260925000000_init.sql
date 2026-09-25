-- Trivia Bot schema.
--
-- Players can only READ rows. Every change goes through the `game` server
-- function, which uses the service role. Answers stay in question_secrets,
-- which no player can read, until the server copies them into
-- questions.revealed_answer at the reveal.

create table public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null,
  status text not null check (status in ('lobby', 'starting', 'question', 'reveal', 'finished')),
  settings jsonb not null,
  current_index int not null default -1,
  question_count int not null default 0,
  question_started_at timestamptz,
  question_ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index games_host_created_idx on public.games (host_id, created_at);
create index games_created_idx on public.games (created_at);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null,
  nickname text not null,
  score int not null default 0,
  rtt_ms int not null default 0,
  joined_at timestamptz not null default now(),
  unique (game_id, user_id)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  idx int not null,
  category text not null,
  text text not null,
  difficulty text,
  source_note text,
  limit_ms int not null,
  revealed_answer text,
  unique (game_id, idx)
);

create table public.question_secrets (
  question_id uuid primary key references public.questions (id) on delete cascade,
  answer text not null,
  answerline text not null
);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  given text not null,
  verdict text not null check (verdict in ('correct', 'prompt', 'wrong', 'late', 'overridden')),
  points int not null default 0,
  elapsed_ms int not null,
  created_at timestamptz not null default now()
);
create index answers_question_idx on public.answers (question_id);

-- One row per question: whoever inserts it first gets the first-correct bonus.
create table public.question_firsts (
  question_id uuid primary key references public.questions (id) on delete cascade,
  player_id uuid not null
);

create table public.feed_events (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null,
  nickname text not null,
  kind text not null check (kind in ('correct', 'override')),
  elapsed_ms int not null,
  points int not null,
  created_at timestamptz not null default now()
);
create index feed_events_game_idx on public.feed_events (game_id);

-- Deleted when the game ends. Only shared_interests() reads it, and it returns names only.
create table public.player_interests (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  interest text not null,
  primary key (player_id, interest)
);

-- ---------- helpers ----------

create function public.is_player(p_game uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.players where game_id = p_game and user_id = auth.uid())
$$;

create function public.add_score(p_player uuid, p_delta int) returns void
language sql security definer set search_path = ''
as $$
  update public.players set score = score + p_delta where id = p_player
$$;

create function public.shared_interests(p_game uuid) returns setof text
language sql stable security definer set search_path = ''
as $$
  select interest from public.player_interests
  where game_id = p_game
  group by interest
  having count(*) >= 2
  order by count(*) desc, interest
$$;

revoke execute on function public.add_score(uuid, int) from public, anon, authenticated;
revoke execute on function public.shared_interests(uuid) from public, anon, authenticated;
grant execute on function public.add_score(uuid, int) to service_role;
grant execute on function public.shared_interests(uuid) to service_role;

-- ---------- row level security ----------

alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.questions enable row level security;
alter table public.question_secrets enable row level security;
alter table public.answers enable row level security;
alter table public.question_firsts enable row level security;
alter table public.feed_events enable row level security;
alter table public.player_interests enable row level security;

-- Belt and braces: players never write directly.
revoke insert, update, delete on all tables in schema public from anon, authenticated;

create policy "Players read their game" on public.games
  for select to authenticated using (public.is_player(id));

create policy "Players read who is in their game" on public.players
  for select to authenticated using (public.is_player(game_id));

-- Only questions that have been opened, so nobody can read ahead.
create policy "Players read opened questions" on public.questions
  for select to authenticated using (
    public.is_player(game_id)
    and exists (
      select 1 from public.games g
      where g.id = questions.game_id
        and g.status in ('question', 'reveal', 'finished')
        and questions.idx <= g.current_index
    )
  );

-- Your own answers any time; everyone's once the question is revealed.
create policy "Players read answers after the reveal" on public.answers
  for select to authenticated using (
    exists (select 1 from public.players p where p.id = answers.player_id and p.user_id = auth.uid())
    or (
      public.is_player(game_id)
      and exists (select 1 from public.questions q where q.id = answers.question_id and q.revealed_answer is not null)
    )
  );

create policy "Players read their game's feed" on public.feed_events
  for select to authenticated using (public.is_player(game_id));

-- question_secrets, question_firsts and player_interests have no policies:
-- only the server function can read them.

-- ---------- realtime ----------

alter publication supabase_realtime add table public.games, public.players, public.feed_events;
