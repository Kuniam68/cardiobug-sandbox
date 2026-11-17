-- Additive sandbox-only trial completion. Original course payloads/prices are not modified.
DO $guard$ BEGIN
 IF current_user<>'postgres' OR NOT EXISTS(SELECT 1 FROM public.payment_sandbox_settings WHERE singleton AND environment='sandbox' AND NOT enabled) THEN RAISE EXCEPTION 'Expected disabled sandbox owner context';END IF;
 IF md5((SELECT payload::text FROM public.payment_course_content WHERE course_id='test-paid-course')) IS DISTINCT FROM 'becc28e47cc0ce45bf4f7a621331d9f8' THEN RAISE EXCEPTION 'Protected content drift';END IF;
 IF EXISTS(SELECT 1 FROM public.lesson_progress) THEN RAISE EXCEPTION 'Review existing progress before migration';END IF;
 IF to_regprocedure('public.academy_complete_lesson(text,text,integer)') IS NOT NULL OR to_regprocedure('public.academy_admin_enrollments()') IS NOT NULL THEN RAISE EXCEPTION 'Trial functions already installed';END IF;
END $guard$;
ALTER TABLE public.lesson_progress ADD COLUMN quiz_score smallint, ADD COLUMN quiz_total smallint;
ALTER TABLE public.lesson_progress ADD CONSTRAINT lesson_progress_score_valid CHECK ((quiz_score IS NULL AND quiz_total IS NULL) OR (quiz_score IS NOT NULL AND quiz_total IS NOT NULL AND quiz_total=1 AND quiz_score=1));
CREATE FUNCTION public.academy_complete_lesson(course_key text,lesson_key text,selected_answer integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE actor uuid := auth.uid(); content jsonb; expected integer;
BEGIN
 IF actor IS NULL OR NOT public.course_is_available(course_key) OR NOT EXISTS(SELECT 1 FROM public.enrollments e WHERE e.user_id=actor AND e.course_id=course_key) THEN RAISE EXCEPTION 'Enroll in this course before saving progress' USING ERRCODE='42501';END IF;
 IF selected_answer IS NULL OR selected_answer NOT BETWEEN 0 AND 2 THEN RAISE EXCEPTION 'Choose a valid quiz answer' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.course_lessons l WHERE l.course_id=course_key AND l.lesson_id=lesson_key) THEN RAISE EXCEPTION 'Lesson not found' USING ERRCODE='22023';END IF;
 IF public.payment_course_is_paid(course_key) THEN
  SELECT p.payload INTO content FROM public.payment_course_content p WHERE p.course_id=course_key;
 ELSE
  SELECT c.payload INTO content FROM public.academy_courses c WHERE c.id=course_key;
 END IF;
 IF content IS NOT NULL THEN
  SELECT (l->>'answer')::integer INTO expected FROM jsonb_array_elements(content->'lessons') l WHERE l->>'id'=lesson_key;
 ELSE
  -- Existing bundled free samples: preserve their completion behavior.
  expected := CASE course_key||'/'||lesson_key
   WHEN 'heart-foundations/chambers' THEN 2 WHEN 'heart-foundations/valves' THEN 0 WHEN 'heart-foundations/coronary' THEN 0
   WHEN 'ecg-essentials/electrical' THEN 1 WHEN 'ecg-essentials/waves' THEN 0 WHEN 'ecg-essentials/approach' THEN 1
   WHEN 'prevention/risk' THEN 1 WHEN 'prevention/measurements' THEN 1 WHEN 'prevention/habits' THEN 1 END;
 END IF;
 IF expected IS NULL OR expected NOT BETWEEN 0 AND 2 THEN RAISE EXCEPTION 'Quiz is unavailable' USING ERRCODE='22023';END IF;
 IF selected_answer<>expected THEN RETURN jsonb_build_object('correct',false,'score',0,'total',1,'saved',false);END IF;
 INSERT INTO public.lesson_progress(user_id,course_id,lesson_id,quiz_score,quiz_total) VALUES(actor,course_key,lesson_key,1,1)
 ON CONFLICT(user_id,course_id,lesson_id) DO UPDATE SET quiz_score=1,quiz_total=1;
 RETURN jsonb_build_object('correct',true,'score',1,'total',1,'saved',true);
END;$function$;
REVOKE ALL ON FUNCTION public.academy_complete_lesson(text,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_complete_lesson(text,text,integer) TO authenticated;
-- All new completion writes are verified against enrollment and the original quiz on the server.
REVOKE INSERT ON public.lesson_progress FROM authenticated;
CREATE FUNCTION public.academy_admin_enrollments()
RETURNS TABLE(user_id uuid,course_id text,enrolled_at timestamptz,completed_lessons integer,lesson_total integer,quiz_score integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_academy_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501';END IF;
 RETURN QUERY SELECT e.user_id,e.course_id,e.created_at,count(lp.lesson_id)::integer,
 coalesce(jsonb_array_length(c.payload->'lessons'),(SELECT count(*)::integer FROM public.course_lessons cl WHERE cl.course_id=e.course_id)),
 coalesce(sum(lp.quiz_score),0)::integer
 FROM public.enrollments e LEFT JOIN public.academy_courses c ON c.id=e.course_id
 LEFT JOIN public.lesson_progress lp ON lp.user_id=e.user_id AND lp.course_id=e.course_id
 GROUP BY e.user_id,e.course_id,e.created_at,c.payload ORDER BY e.created_at DESC;
END;$function$;
REVOKE ALL ON FUNCTION public.academy_admin_enrollments() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_admin_enrollments() TO authenticated;
