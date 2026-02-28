alter table public.arena_threads
  add column if not exists title text;

update public.arena_threads
set title = ''
where title is null;

update public.arena_threads t
set title = concat(
  coalesce(nullif(trim(t.snapshot -> 'metric' ->> 'name'), ''), 'Thread'),
  ' (',
  coalesce(nullif(trim(t.snapshot -> 'range' ->> 'start_ts'), ''), t.start_ts::text),
  ' → ',
  coalesce(nullif(trim(t.snapshot -> 'range' ->> 'end_ts'), ''), t.end_ts::text),
  ')'
)
where length(trim(t.title)) = 0;

alter table public.arena_threads
  alter column title set not null;
