-- Loved is now a toggle; record the household taking it back.
alter table public.household_events
  drop constraint household_events_kind_check,
  add constraint household_events_kind_check check (kind in ('settings','like','skip','undo','block','unblock','cooked','loved','unloved','plan','swap','pin','confirm','pantry','grocery','recipe','bookmark','new_week'));
