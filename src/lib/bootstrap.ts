import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/src/lib/supabase";
import type {
  AccountMembership,
  AccountPriorityGroup,
  Profile,
  SportsAccount,
} from "@/src/types/domain";

export type MembershipSummary = {
  membership: AccountMembership;
  account: SportsAccount;
  priorityGroup: AccountPriorityGroup | null;
};

function getErrorMessage(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

export async function getCurrentProfile(session: Session | null): Promise<Profile | null> {
  if (!session?.user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, photo_url, is_super_admin, created_at, updated_at")
    .eq("id", session.user.id)
    .maybeSingle();

  getErrorMessage(error);
  return (data as Profile | null) ?? null;
}

export async function listMyMemberships(session: Session | null): Promise<MembershipSummary[]> {
  if (!session?.user) {
    return [];
  }

  const { data: membershipData, error: membershipError } = await supabase
    .from("account_memberships")
    .select(
      "id, account_id, profile_id, role, priority_group_id, is_active, joined_at, created_at, updated_at",
    )
    .eq("profile_id", session.user.id)
    .eq("is_active", true);

  getErrorMessage(membershipError);

  const memberships = ((membershipData ?? []) as AccountMembership[]).filter((item) => item.is_active);

  if (memberships.length === 0) {
    return [];
  }

  const accountIds = [...new Set(memberships.map((membership) => membership.account_id))];
  const priorityGroupIds = [
    ...new Set(
      memberships
        .map((membership) => membership.priority_group_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const [{ data: accountData, error: accountError }, { data: priorityGroupData, error: priorityGroupError }] =
    await Promise.all([
      supabase
        .from("sports_accounts")
        .select(
          "id, name, slug, modality_id, timezone, max_players_per_event, confirmation_open_hours_before, confirmation_close_minutes_before, auto_notify_confirmation_open, auto_notify_waitlist_changes, auto_notify_event_updates, created_by, created_at, updated_at",
        )
        .in("id", accountIds),
      priorityGroupIds.length > 0
        ? supabase
            .from("account_priority_groups")
            .select(
              "id, account_id, name, priority_rank, color_hex, is_active, created_at, updated_at",
            )
            .in("id", priorityGroupIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  getErrorMessage(accountError);
  getErrorMessage(priorityGroupError);

  const accountMap = new Map(((accountData ?? []) as SportsAccount[]).map((account) => [account.id, account]));
  const priorityGroupMap = new Map(
    ((priorityGroupData ?? []) as AccountPriorityGroup[]).map((group) => [group.id, group]),
  );

  return memberships
    .map((membership) => {
      const account = accountMap.get(membership.account_id);

      if (!account) {
        return null;
      }

      return {
        membership,
        account,
        priorityGroup: membership.priority_group_id
          ? priorityGroupMap.get(membership.priority_group_id) ?? null
          : null,
      } satisfies MembershipSummary;
    })
    .filter((item): item is MembershipSummary => item !== null)
    .sort((first, second) => first.account.name.localeCompare(second.account.name));
}

export async function loadAppBootstrap(session: Session | null) {
  const [profile, memberships] = await Promise.all([
    getCurrentProfile(session),
    listMyMemberships(session),
  ]);

  return {
    profile,
    memberships,
  };
}
