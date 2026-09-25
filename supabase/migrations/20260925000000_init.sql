-- Trivia Bot schema.
--
-- Players can only READ rows, and only rows of games they're in. Every change
-- goes through the `game` server function, which uses the service role.
-- Answers, full tossup text and tournament names stay in question_secrets,
-- which no player can read, until the server copies them into `questions` at
-- the reveal. Tossup words are released a few at a time through question_chunks.

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
create unique index players_game_nickname_idx on public.players (game_id, lower(nickname));

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  idx int not null,
  category text not null,
  -- Empty for tossups until the reveal.
  text text not null,
  difficulty text,
  -- Null until the reveal.
  source_note text,
  limit_ms int not null,
  word_count int,
  power_index int,
  revealed_answer text,
  unique (game_id, idx)
);

create table public.question_secrets (
  question_id uuid primary key references public.questions (id) on delete cascade,
  answer text not null,
  answerline text not null,
  full_text text not null,
  source_note text
);

create table public.question_chunks (
  question_id uuid not null references public.questions (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  idx int not null,
  offset_ms int not null,
  text text not null,
  primary key (question_id, idx)
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
create index answers_question_player_idx on public.answers (question_id, player_id);

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

-- Deleted when the game starts. Only shared_interests() reads it, and it returns names only.
create table public.player_interests (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  interest text not null,
  primary key (player_id, interest)
);

-- ---------- functions ----------

create function public.is_player(p_game uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.players where game_id = p_game and user_id = auth.uid())
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

-- Caps players per game. The lock makes simultaneous joins wait their turn.
create function public.enforce_player_cap() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.game_id::text));
  if (select count(*) from public.players where game_id = new.game_id) >= 50 then
    raise exception 'game_full' using errcode = 'P0001';
  end if;
  return new;
end
$$;
create trigger players_cap before insert on public.players
  for each row execute function public.enforce_player_cap();

-- Checks the limits, records an answer, claims the first-correct bonus and
-- updates the score in one transaction. Locking the player's row makes
-- answers sent at the same moment go one at a time.
create function public.record_answer(
  p_game uuid, p_question uuid, p_player uuid, p_given text, p_elapsed_ms int,
  p_verdict text, p_points int, p_wrong_points int, p_bonus int,
  p_max_attempts int, p_max_submits int, p_max_prompts int
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_total int;
  v_wrong int;
  v_prompts int;
  v_done boolean;
  v_verdict text := p_verdict;
  v_points int := p_points;
begin
  perform 1 from public.players where id = p_player for update;

  select count(*),
         count(*) filter (where verdict = 'wrong'),
         count(*) filter (where verdict = 'prompt'),
         coalesce(bool_or(verdict in ('correct', 'overridden', 'late')), false)
    into v_total, v_wrong, v_prompts, v_done
    from public.answers
   where question_id = p_question and player_id = p_player;

  if v_done or v_wrong >= p_max_attempts then
    return jsonb_build_object('ok', false, 'reason', 'done');
  end if;
  if v_total >= p_max_submits then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  if v_verdict = 'prompt' and v_prompts >= p_max_prompts then
    v_verdict := 'wrong';
    v_points := p_wrong_points;
  end if;

  if v_verdict = 'correct' then
    insert into public.question_firsts (question_id, player_id) values (p_question, p_player)
      on conflict do nothing;
    if found then
      v_points := v_points + p_bonus;
    end if;
  end if;

  insert into public.answers (game_id, question_id, player_id, given, verdict, points, elapsed_ms)
  values (p_game, p_question, p_player, p_given, v_verdict, v_points, p_elapsed_ms);

  if v_points <> 0 then
    update public.players set score = score + v_points where id = p_player;
  end if;
  if v_verdict = 'wrong' then
    v_wrong := v_wrong + 1;
  end if;

  return jsonb_build_object('ok', true, 'verdict', v_verdict, 'points', v_points, 'wrong_count', v_wrong);
end
$$;

-- Accepts a wrong answer once, and only if the player has no correct answer yet.
create function public.override_answer(p_answer uuid, p_points int) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_player uuid;
  v_question uuid;
  v_old int;
begin
  select player_id, question_id into v_player, v_question from public.answers where id = p_answer;
  if v_player is null then
    return false;
  end if;
  perform 1 from public.players where id = v_player for update;

  if exists (
    select 1 from public.answers
     where question_id = v_question and player_id = v_player and verdict in ('correct', 'overridden')
  ) then
    return false;
  end if;

  select points into v_old from public.answers where id = p_answer and verdict = 'wrong';
  if not found then
    return false;
  end if;
  update public.answers set verdict = 'overridden', points = p_points where id = p_answer;
  -- Replacing the old points also refunds a tossup penalty.
  update public.players set score = score + (p_points - v_old) where id = v_player;
  return true;
end
$$;

-- ---------- permissions ----------

-- Players read five tables and write nothing; the function uses the service role.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.games, public.players, public.questions, public.question_chunks,
  public.answers, public.feed_events to authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

revoke execute on function public.shared_interests(uuid) from public, anon, authenticated;
revoke execute on function public.enforce_player_cap() from public, anon, authenticated;
revoke execute on function public.record_answer(uuid, uuid, uuid, text, int, text, int, int, int, int, int, int) from public, anon, authenticated;
revoke execute on function public.override_answer(uuid, int) from public, anon, authenticated;
grant execute on function public.shared_interests(uuid) to service_role;
grant execute on function public.record_answer(uuid, uuid, uuid, text, int, text, int, int, int, int, int, int) to service_role;
grant execute on function public.override_answer(uuid, int) to service_role;

-- ---------- row level security ----------

alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.questions enable row level security;
alter table public.question_secrets enable row level security;
alter table public.question_chunks enable row level security;
alter table public.answers enable row level security;
alter table public.question_firsts enable row level security;
alter table public.feed_events enable row level security;
alter table public.player_interests enable row level security;

create policy "Players read their game" on public.games
  for select to authenticated using (public.is_player(id));

create policy "Players read who is in their game" on public.players
  for select to authenticated using (public.is_player(game_id));

-- Past questions, and the current one once its start time has passed (not during the countdown).
create policy "Players read opened questions" on public.questions
  for select to authenticated using (
    public.is_player(game_id)
    and exists (
      select 1 from public.games g
      where g.id = questions.game_id
        and g.status in ('question', 'reveal', 'finished')
        and (
          questions.idx < g.current_index
          or (questions.idx = g.current_index and (g.status <> 'question' or now() >= g.question_started_at))
        )
    )
  );

-- Each chunk of the current tossup becomes readable when its words would be read aloud.
create policy "Players read tossup words as they are read" on public.question_chunks
  for select to authenticated using (
    public.is_player(game_id)
    and exists (
      select 1 from public.questions q
      join public.games g on g.id = q.game_id
      where q.id = question_chunks.question_id
        and g.status in ('question', 'reveal', 'finished')
        and (
          q.idx < g.current_index
          or (
            q.idx = g.current_index
            and (g.status <> 'question' or now() >= g.question_started_at + make_interval(secs => question_chunks.offset_ms / 1000.0))
          )
        )
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
