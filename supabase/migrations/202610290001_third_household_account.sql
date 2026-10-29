alter table public.household_access
  drop constraint household_access_slot_check,
  add constraint household_access_slot_check check (slot in (1, 2, 3));
