-- Seed das formações táticas do futebol society para a conta borajogar
-- 7 formações: 2-3-2 (padrão), 3-2-2, 2-2-3, 1-4-2, 2-4-1, 3-3-1, 3-1-3
--
-- Coordenadas x/y (0-100%):
--   x: 0=esquerda → 100=direita
--   y: 0=linha do goleiro → 100=linha do ataque

do $$
declare
  v_account_id uuid;
  v_modality_id uuid;

  -- IDs das posições da modalidade
  p_gol  uuid; p_zag  uuid; p_ld   uuid; p_le   uuid;
  p_vol  uuid; p_mc   uuid; p_me   uuid; p_md   uuid;
  p_pd   uuid; p_pe   uuid; p_ca   uuid;

  -- IDs das formações
  f_232 uuid; f_322 uuid; f_223 uuid;
  f_142 uuid; f_241 uuid; f_331 uuid; f_313 uuid;

begin

  -- ── Conta e modalidade ───────────────────────────────────────────────────────
  select id, modality_id into v_account_id, v_modality_id
  from public.sports_accounts where slug = 'futeboldequarta';

  if v_account_id is null then
    raise notice 'Conta borajogar não encontrada — seed ignorado.';
    return;
  end if;

  -- ── Posições da modalidade ───────────────────────────────────────────────────
  select id into p_gol  from public.modality_positions where modality_id = v_modality_id and code = 'goleiro';
  select id into p_zag  from public.modality_positions where modality_id = v_modality_id and code = 'zagueiro';
  select id into p_ld   from public.modality_positions where modality_id = v_modality_id and code = 'lateral-direita';
  select id into p_le   from public.modality_positions where modality_id = v_modality_id and code = 'latera-esquerdo';
  select id into p_vol  from public.modality_positions where modality_id = v_modality_id and code = 'volante';
  select id into p_mc   from public.modality_positions where modality_id = v_modality_id and code = 'meia-central';
  select id into p_me   from public.modality_positions where modality_id = v_modality_id and code = 'meia-esquerda';
  select id into p_md   from public.modality_positions where modality_id = v_modality_id and code = 'meia-direita';
  select id into p_pd   from public.modality_positions where modality_id = v_modality_id and code = 'ponta-direito';
  select id into p_pe   from public.modality_positions where modality_id = v_modality_id and code = 'ponta-esquerda';
  select id into p_ca   from public.modality_positions where modality_id = v_modality_id and code = 'centroavante';

  -- ── Garante apenas uma formação padrão ───────────────────────────────────────
  update public.tactical_formations set is_default = false where account_id = v_account_id;

  -- ════════════════════════════════════════════════════════════════════════════
  -- 1. 2-3-2  (PADRÃO)  —  Equilibrada
  --    GOL | LE · LD | ME · MC · MD | PE · CA
  -- ════════════════════════════════════════════════════════════════════════════
  insert into public.tactical_formations (account_id, name, description, is_default, sort_order)
  values (v_account_id, '2-3-2', 'Equilibrada — meio-campo forte, boa cobertura defensiva', true, 1)
  on conflict (account_id, name) do update
    set description = excluded.description, is_default = excluded.is_default,
        sort_order  = excluded.sort_order,  updated_at  = timezone('utc', now())
  returning id into f_232;
  if f_232 is null then
    select id into f_232 from public.tactical_formations where account_id = v_account_id and name = '2-3-2';
  end if;

  delete from public.tactical_formation_slots where formation_id = f_232;
  insert into public.tactical_formation_slots (formation_id, modality_position_id, slot_label, position_x, position_y, sort_order) values
    (f_232, p_gol, 'GOL', 50.00,  5.00, 1),
    (f_232, p_le,  'LE',  20.00, 25.00, 2),
    (f_232, p_ld,  'LD',  80.00, 25.00, 3),
    (f_232, p_me,  'ME',  20.00, 52.00, 4),
    (f_232, p_mc,  'MC',  50.00, 50.00, 5),
    (f_232, p_md,  'MD',  80.00, 52.00, 6),
    (f_232, p_pe,  'PE',  30.00, 80.00, 7),
    (f_232, p_ca,  'CA',  70.00, 80.00, 8);

  -- ════════════════════════════════════════════════════════════════════════════
  -- 2. 3-2-2  —  Defensiva
  --    GOL | LE · ZAG · LD | MC · VOL | PE · CA
  -- ════════════════════════════════════════════════════════════════════════════
  insert into public.tactical_formations (account_id, name, description, is_default, sort_order)
  values (v_account_id, '3-2-2', 'Defensiva — linha de três atrás, defesa sólida', false, 2)
  on conflict (account_id, name) do update
    set description = excluded.description, sort_order = excluded.sort_order, updated_at = timezone('utc', now())
  returning id into f_322;
  if f_322 is null then
    select id into f_322 from public.tactical_formations where account_id = v_account_id and name = '3-2-2';
  end if;

  delete from public.tactical_formation_slots where formation_id = f_322;
  insert into public.tactical_formation_slots (formation_id, modality_position_id, slot_label, position_x, position_y, sort_order) values
    (f_322, p_gol, 'GOL', 50.00,  5.00, 1),
    (f_322, p_le,  'LE',  15.00, 25.00, 2),
    (f_322, p_zag, 'ZAG', 50.00, 22.00, 3),
    (f_322, p_ld,  'LD',  85.00, 25.00, 4),
    (f_322, p_mc,  'MC',  35.00, 52.00, 5),
    (f_322, p_vol, 'VOL', 65.00, 52.00, 6),
    (f_322, p_pe,  'PE',  30.00, 80.00, 7),
    (f_322, p_ca,  'CA',  70.00, 80.00, 8);

  -- ════════════════════════════════════════════════════════════════════════════
  -- 3. 2-2-3  —  Ofensiva
  --    GOL | LE · LD | ME · MD | PE · CA · PD
  -- ════════════════════════════════════════════════════════════════════════════
  insert into public.tactical_formations (account_id, name, description, is_default, sort_order)
  values (v_account_id, '2-2-3', 'Ofensiva — pressão alta, três na frente', false, 3)
  on conflict (account_id, name) do update
    set description = excluded.description, sort_order = excluded.sort_order, updated_at = timezone('utc', now())
  returning id into f_223;
  if f_223 is null then
    select id into f_223 from public.tactical_formations where account_id = v_account_id and name = '2-2-3';
  end if;

  delete from public.tactical_formation_slots where formation_id = f_223;
  insert into public.tactical_formation_slots (formation_id, modality_position_id, slot_label, position_x, position_y, sort_order) values
    (f_223, p_gol, 'GOL', 50.00,  5.00, 1),
    (f_223, p_le,  'LE',  25.00, 25.00, 2),
    (f_223, p_ld,  'LD',  75.00, 25.00, 3),
    (f_223, p_me,  'ME',  30.00, 52.00, 4),
    (f_223, p_md,  'MD',  70.00, 52.00, 5),
    (f_223, p_pe,  'PE',  15.00, 80.00, 6),
    (f_223, p_ca,  'CA',  50.00, 82.00, 7),
    (f_223, p_pd,  'PD',  85.00, 80.00, 8);

  -- ════════════════════════════════════════════════════════════════════════════
  -- 4. 1-4-2  —  Posse e construção
  --    GOL | ZAG | ME · VOL · MC · MD | PE · CA
  -- ════════════════════════════════════════════════════════════════════════════
  insert into public.tactical_formations (account_id, name, description, is_default, sort_order)
  values (v_account_id, '1-4-2', 'Posse — controle de bola, jogo apoiado', false, 4)
  on conflict (account_id, name) do update
    set description = excluded.description, sort_order = excluded.sort_order, updated_at = timezone('utc', now())
  returning id into f_142;
  if f_142 is null then
    select id into f_142 from public.tactical_formations where account_id = v_account_id and name = '1-4-2';
  end if;

  delete from public.tactical_formation_slots where formation_id = f_142;
  insert into public.tactical_formation_slots (formation_id, modality_position_id, slot_label, position_x, position_y, sort_order) values
    (f_142, p_gol, 'GOL', 50.00,  5.00, 1),
    (f_142, p_zag, 'ZAG', 50.00, 22.00, 2),
    (f_142, p_me,  'ME',  15.00, 50.00, 3),
    (f_142, p_vol, 'VOL', 38.00, 52.00, 4),
    (f_142, p_mc,  'MC',  62.00, 52.00, 5),
    (f_142, p_md,  'MD',  85.00, 50.00, 6),
    (f_142, p_pe,  'PE',  30.00, 80.00, 7),
    (f_142, p_ca,  'CA',  70.00, 80.00, 8);

  -- ════════════════════════════════════════════════════════════════════════════
  -- 5. 2-4-1  —  Com pivô forte
  --    GOL | LE · LD | ME · VOL · MC · MD | CA
  -- ════════════════════════════════════════════════════════════════════════════
  insert into public.tactical_formations (account_id, name, description, is_default, sort_order)
  values (v_account_id, '2-4-1', 'Pivô — jogo gira em torno do centroavante', false, 5)
  on conflict (account_id, name) do update
    set description = excluded.description, sort_order = excluded.sort_order, updated_at = timezone('utc', now())
  returning id into f_241;
  if f_241 is null then
    select id into f_241 from public.tactical_formations where account_id = v_account_id and name = '2-4-1';
  end if;

  delete from public.tactical_formation_slots where formation_id = f_241;
  insert into public.tactical_formation_slots (formation_id, modality_position_id, slot_label, position_x, position_y, sort_order) values
    (f_241, p_gol, 'GOL', 50.00,  5.00, 1),
    (f_241, p_le,  'LE',  25.00, 25.00, 2),
    (f_241, p_ld,  'LD',  75.00, 25.00, 3),
    (f_241, p_me,  'ME',  15.00, 50.00, 4),
    (f_241, p_vol, 'VOL', 38.00, 52.00, 5),
    (f_241, p_mc,  'MC',  62.00, 52.00, 6),
    (f_241, p_md,  'MD',  85.00, 50.00, 7),
    (f_241, p_ca,  'CA',  50.00, 82.00, 8);

  -- ════════════════════════════════════════════════════════════════════════════
  -- 6. 3-3-1  —  Compacta
  --    GOL | LE · ZAG · LD | ME · MC · MD | CA
  -- ════════════════════════════════════════════════════════════════════════════
  insert into public.tactical_formations (account_id, name, description, is_default, sort_order)
  values (v_account_id, '3-3-1', 'Compacta — muito organizada, joga por contra-ataque', false, 6)
  on conflict (account_id, name) do update
    set description = excluded.description, sort_order = excluded.sort_order, updated_at = timezone('utc', now())
  returning id into f_331;
  if f_331 is null then
    select id into f_331 from public.tactical_formations where account_id = v_account_id and name = '3-3-1';
  end if;

  delete from public.tactical_formation_slots where formation_id = f_331;
  insert into public.tactical_formation_slots (formation_id, modality_position_id, slot_label, position_x, position_y, sort_order) values
    (f_331, p_gol, 'GOL', 50.00,  5.00, 1),
    (f_331, p_le,  'LE',  15.00, 25.00, 2),
    (f_331, p_zag, 'ZAG', 50.00, 22.00, 3),
    (f_331, p_ld,  'LD',  85.00, 25.00, 4),
    (f_331, p_me,  'ME',  20.00, 52.00, 5),
    (f_331, p_mc,  'MC',  50.00, 50.00, 6),
    (f_331, p_md,  'MD',  80.00, 52.00, 7),
    (f_331, p_ca,  'CA',  50.00, 82.00, 8);

  -- ════════════════════════════════════════════════════════════════════════════
  -- 7. 3-1-3  —  Alternativa
  --    GOL | LE · ZAG · LD | MC | PE · CA · PD
  -- ════════════════════════════════════════════════════════════════════════════
  insert into public.tactical_formations (account_id, name, description, is_default, sort_order)
  values (v_account_id, '3-1-3', 'Alternativa — defesa sólida com ataque aberto', false, 7)
  on conflict (account_id, name) do update
    set description = excluded.description, sort_order = excluded.sort_order, updated_at = timezone('utc', now())
  returning id into f_313;
  if f_313 is null then
    select id into f_313 from public.tactical_formations where account_id = v_account_id and name = '3-1-3';
  end if;

  delete from public.tactical_formation_slots where formation_id = f_313;
  insert into public.tactical_formation_slots (formation_id, modality_position_id, slot_label, position_x, position_y, sort_order) values
    (f_313, p_gol, 'GOL', 50.00,  5.00, 1),
    (f_313, p_le,  'LE',  15.00, 25.00, 2),
    (f_313, p_zag, 'ZAG', 50.00, 22.00, 3),
    (f_313, p_ld,  'LD',  85.00, 25.00, 4),
    (f_313, p_mc,  'MC',  50.00, 52.00, 5),
    (f_313, p_pe,  'PE',  15.00, 80.00, 6),
    (f_313, p_ca,  'CA',  50.00, 82.00, 7),
    (f_313, p_pd,  'PD',  85.00, 80.00, 8);

end $$;
