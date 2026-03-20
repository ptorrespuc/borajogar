create or replace function public.current_user_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.is_super_admin = true
  );
$$;

create or replace function public.current_user_has_account_access(target_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_is_super_admin()
    or exists (
      select 1
      from public.account_memberships membership
      where membership.account_id = target_account_id
        and membership.profile_id = auth.uid()
        and membership.is_active = true
    );
$$;

create or replace function public.current_user_has_account_role(
  target_account_id uuid,
  allowed_roles public.account_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_is_super_admin()
    or exists (
      select 1
      from public.account_memberships membership
      where membership.account_id = target_account_id
        and membership.profile_id = auth.uid()
        and membership.is_active = true
        and membership.role = any(allowed_roles)
    );
$$;

create or replace function public.current_user_owns_membership(target_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.account_memberships membership
    where membership.id = target_membership_id
      and membership.profile_id = auth.uid()
      and membership.is_active = true
  );
$$;

create or replace function public.current_user_can_access_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events event
    where event.id = target_event_id
      and public.current_user_has_account_access(event.account_id)
  );
$$;

create or replace function public.current_user_can_manage_event(
  target_event_id uuid,
  allowed_roles public.account_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events event
    where event.id = target_event_id
      and public.current_user_has_account_role(event.account_id, allowed_roles)
  );
$$;

create or replace function public.current_user_can_access_poll(target_poll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_polls poll
    where poll.id = target_poll_id
      and public.current_user_can_access_event(poll.event_id)
  );
$$;

create or replace function public.current_user_can_manage_poll(
  target_poll_id uuid,
  allowed_roles public.account_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_polls poll
    where poll.id = target_poll_id
      and public.current_user_can_manage_event(poll.event_id, allowed_roles)
  );
$$;

create or replace function public.current_user_can_access_event_participant(target_event_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_participants participant
    where participant.id = target_event_participant_id
      and public.current_user_can_access_event(participant.event_id)
  );
$$;

create or replace function public.current_user_can_manage_event_participant(
  target_event_participant_id uuid,
  allowed_roles public.account_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_participants participant
    where participant.id = target_event_participant_id
      and public.current_user_can_manage_event(participant.event_id, allowed_roles)
  );
$$;

create or replace function public.current_user_owns_event_participant(target_event_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_participants participant
    join public.account_memberships membership
      on membership.id = participant.membership_id
    where participant.id = target_event_participant_id
      and membership.profile_id = auth.uid()
      and membership.is_active = true
  );
$$;

alter table public.profiles enable row level security;
alter table public.sport_modalities enable row level security;
alter table public.modality_positions enable row level security;
alter table public.sports_accounts enable row level security;
alter table public.account_schedules enable row level security;
alter table public.account_priority_groups enable row level security;
alter table public.account_memberships enable row level security;
alter table public.membership_position_preferences enable row level security;
alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.poll_templates enable row level security;
alter table public.event_polls enable row level security;
alter table public.event_poll_options enable row level security;
alter table public.event_poll_votes enable row level security;
alter table public.stat_definitions enable row level security;
alter table public.event_participant_stats enable row level security;

drop policy if exists "profiles_select_self_or_super_admin" on public.profiles;
create policy "profiles_select_self_or_super_admin"
on public.profiles
for select
to authenticated
using (
  auth.uid() = id
  or public.current_user_is_super_admin()
);

drop policy if exists "profiles_update_self_or_super_admin" on public.profiles;
create policy "profiles_update_self_or_super_admin"
on public.profiles
for update
to authenticated
using (
  auth.uid() = id
  or public.current_user_is_super_admin()
)
with check (
  auth.uid() = id
  or public.current_user_is_super_admin()
);

drop policy if exists "sport_modalities_select_authenticated" on public.sport_modalities;
create policy "sport_modalities_select_authenticated"
on public.sport_modalities
for select
to authenticated
using (true);

drop policy if exists "sport_modalities_write_super_admin" on public.sport_modalities;
create policy "sport_modalities_write_super_admin"
on public.sport_modalities
for all
to authenticated
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

drop policy if exists "modality_positions_select_authenticated" on public.modality_positions;
create policy "modality_positions_select_authenticated"
on public.modality_positions
for select
to authenticated
using (true);

drop policy if exists "modality_positions_write_super_admin" on public.modality_positions;
create policy "modality_positions_write_super_admin"
on public.modality_positions
for all
to authenticated
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

drop policy if exists "sports_accounts_select_member_or_super_admin" on public.sports_accounts;
create policy "sports_accounts_select_member_or_super_admin"
on public.sports_accounts
for select
to authenticated
using (public.current_user_has_account_access(id));

drop policy if exists "sports_accounts_write_super_admin" on public.sports_accounts;
create policy "sports_accounts_write_super_admin"
on public.sports_accounts
for all
to authenticated
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

drop policy if exists "account_schedules_select_member_or_super_admin" on public.account_schedules;
create policy "account_schedules_select_member_or_super_admin"
on public.account_schedules
for select
to authenticated
using (public.current_user_has_account_access(account_id));

drop policy if exists "account_schedules_write_super_admin" on public.account_schedules;
create policy "account_schedules_write_super_admin"
on public.account_schedules
for all
to authenticated
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

drop policy if exists "account_priority_groups_select_member_or_super_admin" on public.account_priority_groups;
create policy "account_priority_groups_select_member_or_super_admin"
on public.account_priority_groups
for select
to authenticated
using (public.current_user_has_account_access(account_id));

drop policy if exists "account_priority_groups_write_super_admin" on public.account_priority_groups;
create policy "account_priority_groups_write_super_admin"
on public.account_priority_groups
for all
to authenticated
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

drop policy if exists "account_memberships_select_own_or_account_staff" on public.account_memberships;
create policy "account_memberships_select_own_or_account_staff"
on public.account_memberships
for select
to authenticated
using (
  profile_id = auth.uid()
  or public.current_user_has_account_role(
    account_id,
    array['group_admin'::public.account_role, 'group_moderator'::public.account_role]
  )
);

drop policy if exists "account_memberships_write_super_admin_or_group_admin" on public.account_memberships;
create policy "account_memberships_write_super_admin_or_group_admin"
on public.account_memberships
for all
to authenticated
using (
  public.current_user_has_account_role(account_id, array['group_admin'::public.account_role])
)
with check (
  public.current_user_has_account_role(account_id, array['group_admin'::public.account_role])
);

drop policy if exists "membership_position_preferences_select_owner_or_staff" on public.membership_position_preferences;
create policy "membership_position_preferences_select_owner_or_staff"
on public.membership_position_preferences
for select
to authenticated
using (
  public.current_user_owns_membership(membership_id)
  or public.current_user_has_account_role(
    (
      select membership.account_id
      from public.account_memberships membership
      where membership.id = membership_position_preferences.membership_id
    ),
    array['group_admin'::public.account_role, 'group_moderator'::public.account_role]
  )
);

drop policy if exists "membership_position_preferences_write_owner_or_group_admin" on public.membership_position_preferences;
create policy "membership_position_preferences_write_owner_or_group_admin"
on public.membership_position_preferences
for all
to authenticated
using (
  public.current_user_owns_membership(membership_id)
  or public.current_user_has_account_role(
    (
      select membership.account_id
      from public.account_memberships membership
      where membership.id = membership_position_preferences.membership_id
    ),
    array['group_admin'::public.account_role]
  )
)
with check (
  public.current_user_owns_membership(membership_id)
  or public.current_user_has_account_role(
    (
      select membership.account_id
      from public.account_memberships membership
      where membership.id = membership_position_preferences.membership_id
    ),
    array['group_admin'::public.account_role]
  )
);

drop policy if exists "events_select_member_or_super_admin" on public.events;
create policy "events_select_member_or_super_admin"
on public.events
for select
to authenticated
using (public.current_user_has_account_access(account_id));

drop policy if exists "events_write_group_admin_or_super_admin" on public.events;
create policy "events_write_group_admin_or_super_admin"
on public.events
for all
to authenticated
using (
  public.current_user_has_account_role(account_id, array['group_admin'::public.account_role])
)
with check (
  public.current_user_has_account_role(account_id, array['group_admin'::public.account_role])
);

drop policy if exists "event_participants_select_member_or_super_admin" on public.event_participants;
create policy "event_participants_select_member_or_super_admin"
on public.event_participants
for select
to authenticated
using (public.current_user_can_access_event(event_id));

drop policy if exists "event_participants_write_group_admin_or_super_admin" on public.event_participants;
create policy "event_participants_write_group_admin_or_super_admin"
on public.event_participants
for all
to authenticated
using (
  public.current_user_can_manage_event(event_id, array['group_admin'::public.account_role])
)
with check (
  public.current_user_can_manage_event(event_id, array['group_admin'::public.account_role])
);

drop policy if exists "poll_templates_select_member_or_super_admin" on public.poll_templates;
create policy "poll_templates_select_member_or_super_admin"
on public.poll_templates
for select
to authenticated
using (public.current_user_has_account_access(account_id));

drop policy if exists "poll_templates_write_super_admin" on public.poll_templates;
create policy "poll_templates_write_super_admin"
on public.poll_templates
for all
to authenticated
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

drop policy if exists "event_polls_select_member_or_super_admin" on public.event_polls;
create policy "event_polls_select_member_or_super_admin"
on public.event_polls
for select
to authenticated
using (public.current_user_can_access_event(event_id));

drop policy if exists "event_polls_write_staff_or_super_admin" on public.event_polls;
create policy "event_polls_write_staff_or_super_admin"
on public.event_polls
for all
to authenticated
using (
  public.current_user_can_manage_event(
    event_id,
    array['group_admin'::public.account_role, 'group_moderator'::public.account_role]
  )
)
with check (
  public.current_user_can_manage_event(
    event_id,
    array['group_admin'::public.account_role, 'group_moderator'::public.account_role]
  )
);

drop policy if exists "event_poll_options_select_member_or_super_admin" on public.event_poll_options;
create policy "event_poll_options_select_member_or_super_admin"
on public.event_poll_options
for select
to authenticated
using (public.current_user_can_access_poll(poll_id));

drop policy if exists "event_poll_options_write_staff_or_super_admin" on public.event_poll_options;
create policy "event_poll_options_write_staff_or_super_admin"
on public.event_poll_options
for all
to authenticated
using (
  public.current_user_can_manage_poll(
    poll_id,
    array['group_admin'::public.account_role, 'group_moderator'::public.account_role]
  )
)
with check (
  public.current_user_can_manage_poll(
    poll_id,
    array['group_admin'::public.account_role, 'group_moderator'::public.account_role]
  )
);

drop policy if exists "event_poll_votes_select_member_or_super_admin" on public.event_poll_votes;
create policy "event_poll_votes_select_member_or_super_admin"
on public.event_poll_votes
for select
to authenticated
using (public.current_user_can_access_poll(poll_id));

drop policy if exists "event_poll_votes_insert_own_vote_or_staff" on public.event_poll_votes;
create policy "event_poll_votes_insert_own_vote_or_staff"
on public.event_poll_votes
for insert
to authenticated
with check (
  (
    public.current_user_owns_event_participant(voter_participant_id)
    and public.current_user_can_access_poll(poll_id)
  )
  or public.current_user_can_manage_poll(
    poll_id,
    array['group_admin'::public.account_role, 'group_moderator'::public.account_role]
  )
);

drop policy if exists "event_poll_votes_update_delete_own_vote_or_staff" on public.event_poll_votes;
create policy "event_poll_votes_update_delete_own_vote_or_staff"
on public.event_poll_votes
for all
to authenticated
using (
  public.current_user_owns_event_participant(voter_participant_id)
  or public.current_user_can_manage_poll(
    poll_id,
    array['group_admin'::public.account_role, 'group_moderator'::public.account_role]
  )
)
with check (
  public.current_user_owns_event_participant(voter_participant_id)
  or public.current_user_can_manage_poll(
    poll_id,
    array['group_admin'::public.account_role, 'group_moderator'::public.account_role]
  )
);

drop policy if exists "stat_definitions_select_member_or_super_admin" on public.stat_definitions;
create policy "stat_definitions_select_member_or_super_admin"
on public.stat_definitions
for select
to authenticated
using (public.current_user_has_account_access(account_id));

drop policy if exists "stat_definitions_write_super_admin" on public.stat_definitions;
create policy "stat_definitions_write_super_admin"
on public.stat_definitions
for all
to authenticated
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

drop policy if exists "event_participant_stats_select_member_or_super_admin" on public.event_participant_stats;
create policy "event_participant_stats_select_member_or_super_admin"
on public.event_participant_stats
for select
to authenticated
using (public.current_user_can_access_event_participant(event_participant_id));

drop policy if exists "event_participant_stats_write_staff_or_super_admin" on public.event_participant_stats;
create policy "event_participant_stats_write_staff_or_super_admin"
on public.event_participant_stats
for all
to authenticated
using (
  public.current_user_can_manage_event_participant(
    event_participant_id,
    array['group_admin'::public.account_role, 'group_moderator'::public.account_role]
  )
)
with check (
  public.current_user_can_manage_event_participant(
    event_participant_id,
    array['group_admin'::public.account_role, 'group_moderator'::public.account_role]
  )
);
