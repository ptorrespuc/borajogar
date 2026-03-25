export type AccountRole = "group_admin" | "group_moderator" | "player";

export type EventStatus = "draft" | "published" | "completed" | "cancelled";

export type ParticipantResponseStatus = "pending" | "confirmed" | "declined";

export type ParticipantSelectionStatus = "active" | "waitlisted" | "removed";

export type PollSelectionMode = "predefined_options" | "event_participant";

export type PollStatus = "draft" | "open" | "closed" | "archived";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  photo_url: string | null;
  is_super_admin: boolean;
  created_at: string;
  updated_at: string;
};

export type SportModality = {
  id: string;
  name: string;
  slug: string;
  players_per_team: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ModalityPosition = {
  id: string;
  modality_id: string;
  name: string;
  code: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type SportsAccount = {
  id: string;
  name: string;
  slug: string;
  modality_id: string;
  timezone: string;
  max_players_per_event: number;
  confirmation_open_hours_before: number;
  confirmation_close_minutes_before: number;
  auto_notify_confirmation_open: boolean;
  auto_notify_waitlist_changes: boolean;
  auto_notify_event_updates: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountSchedule = {
  id: string;
  account_id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AccountPriorityGroup = {
  id: string;
  account_id: string;
  name: string;
  priority_rank: number;
  color_hex: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AccountMembership = {
  id: string;
  account_id: string;
  profile_id: string;
  account_player_id: string | null;
  role: AccountRole;
  priority_group_id: string | null;
  is_active: boolean;
  joined_at: string;
  created_at: string;
  updated_at: string;
};

export type AccountPlayer = {
  id: string;
  account_id: string;
  linked_profile_id: string | null;
  full_name: string;
  email: string | null;
  photo_url: string | null;
  priority_group_id: string | null;
  is_default_for_weekly_list: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountPlayerPositionPreference = {
  id: string;
  account_player_id: string;
  modality_position_id: string;
  preference_order: number;
  created_at: string;
};

export type MembershipPositionPreference = {
  id: string;
  membership_id: string;
  modality_position_id: string;
  preference_order: number;
  created_at: string;
};

export type Event = {
  id: string;
  account_id: string;
  schedule_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  confirmation_opens_at: string;
  confirmation_closes_at: string | null;
  max_players: number;
  status: EventStatus;
  notes: string | null;
  created_by: string | null;
  published_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EventParticipant = {
  id: string;
  event_id: string;
  membership_id: string | null;
  account_player_id: string | null;
  priority_group_id: string | null;
  priority_rank_snapshot: number;
  roster_order: number;
  response_status: ParticipantResponseStatus;
  selection_status: ParticipantSelectionStatus;
  response_at: string | null;
  selection_changed_at: string;
  added_by: string | null;
  removed_reason: string | null;
  waitlist_notified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PollTemplate = {
  id: string;
  account_id: string;
  title: string;
  description: string | null;
  selection_mode: PollSelectionMode;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EventPoll = {
  id: string;
  event_id: string;
  template_id: string | null;
  title: string;
  description: string | null;
  selection_mode: PollSelectionMode;
  status: PollStatus;
  opens_at: string | null;
  closes_at: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EventPollOption = {
  id: string;
  poll_id: string;
  target_participant_id: string | null;
  label: string;
  description: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EventPollVote = {
  id: string;
  poll_id: string;
  voter_participant_id: string;
  option_id: string | null;
  target_participant_id: string | null;
  created_at: string;
};

export type StatDefinition = {
  id: string;
  account_id: string;
  name: string;
  code: string;
  unit: string;
  sort_order: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EventParticipantStat = {
  id: string;
  event_participant_id: string;
  stat_definition_id: string;
  value: number;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
};
