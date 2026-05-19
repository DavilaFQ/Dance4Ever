-- Functions for reordering / inserting / deleting participants with position compaction.
-- Run once in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION reorder_participant(p_id bigint, new_pos int)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_id uuid;
  v_old_pos int;
  v_max int;
BEGIN
  SELECT event_id, position INTO v_event_id, v_old_pos
    FROM participants WHERE id = p_id;
  IF v_event_id IS NULL OR v_old_pos = new_pos THEN RETURN; END IF;

  SELECT COALESCE(MAX(position), 0) INTO v_max FROM participants WHERE event_id = v_event_id;
  IF new_pos < 1 THEN new_pos := 1; END IF;
  IF new_pos > v_max THEN new_pos := v_max; END IF;

  -- Park the moving row at 0 to avoid clashes during shift.
  UPDATE participants SET position = 0 WHERE id = p_id;

  IF new_pos > v_old_pos THEN
    UPDATE participants SET position = position - 1
      WHERE event_id = v_event_id AND position > v_old_pos AND position <= new_pos;
  ELSE
    UPDATE participants SET position = position + 1
      WHERE event_id = v_event_id AND position >= new_pos AND position < v_old_pos;
  END IF;

  UPDATE participants SET position = new_pos WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION insert_participant(
  p_event_id uuid,
  p_position int,
  p_name text,
  p_academy text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_style text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_coach_id uuid DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_max int;
  v_pos int;
  new_id bigint;
BEGIN
  SELECT COALESCE(MAX(position), 0) INTO v_max FROM participants WHERE event_id = p_event_id;
  v_pos := p_position;
  IF v_pos < 1 THEN v_pos := 1; END IF;
  IF v_pos > v_max + 1 THEN v_pos := v_max + 1; END IF;

  UPDATE participants SET position = position + 1
    WHERE event_id = p_event_id AND position >= v_pos;

  INSERT INTO participants (event_id, position, name, academy, category, type, style, city, coach_id, present)
    VALUES (p_event_id, v_pos, p_name, p_academy, p_category, p_type, p_style, p_city, p_coach_id, false)
    RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION delete_participant_compact(p_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_id uuid;
  v_pos int;
BEGIN
  SELECT event_id, position INTO v_event_id, v_pos FROM participants WHERE id = p_id;
  IF v_event_id IS NULL THEN RETURN; END IF;

  DELETE FROM participants WHERE id = p_id;

  UPDATE participants SET position = position - 1
    WHERE event_id = v_event_id AND position > v_pos;
END;
$$;
