-- Install official-provider acceptance infrastructure on the existing isolated sandbox only.
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user<>'postgres' OR to_regclass('public.payment_sandbox_settings') IS NULL OR to_regclass('public.commerce_orders') IS NOT NULL THEN RAISE EXCEPTION 'Existing isolated sandbox required; commerce must be absent';END IF;
 IF NOT EXISTS(select 1 from public.payment_sandbox_settings where singleton and environment='sandbox') THEN RAISE EXCEPTION 'Sandbox identity guard failed';END IF;
END $$;
create table public.commerce_settings(singleton boolean primary key default true check(singleton),live_enabled boolean not null default false,merchant_approved boolean not null default false,provider_environment text not null default 'disabled' check(provider_environment in ('disabled','sandbox','live')),verified_currencies text[] not null default array['BDT']::text[] check(verified_currencies <@ array['BDT']::text[]));
insert into public.commerce_settings(singleton) values(true);
create table public.commerce_orders(
 id uuid primary key default gen_random_uuid(),merchant_ref varchar(30) not null unique,
 user_id uuid not null references auth.users(id),course_id text not null references public.course_catalog(id),request_key uuid not null,
 currency text not null check(currency='BDT'),amount_minor bigint not null check(amount_minor between 1000 and 50000000),price_revision integer not null check(price_revision>0),
 environment text not null check(environment in ('sandbox','live')),provider text not null default 'sslcommerz' check(provider='sslcommerz'),
 status text not null default 'initializing' check(status in ('initializing','pending','session_unknown','succeeded','failed','cancelled','review','refunded')),
 session_attempted boolean not null default false,session_key text,checkout_url text,validation_id text unique,bank_reference text unique,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),last_reconciled_at timestamptz,
 unique(user_id,request_key)
);
create unique index commerce_one_pending_order on public.commerce_orders(user_id,course_id,environment) where status in ('initializing','pending','session_unknown');
create index commerce_orders_user_created on public.commerce_orders(user_id,created_at desc);
create index commerce_orders_course on public.commerce_orders(course_id);
create table public.commerce_entitlements(user_id uuid not null,course_id text not null,order_id uuid not null unique references public.commerce_orders(id),active boolean not null default true,primary key(user_id,course_id,order_id),foreign key(user_id,course_id) references public.enrollments(user_id,course_id));
create index commerce_entitlements_course on public.commerce_entitlements(course_id);
create table public.commerce_refunds(id uuid primary key default gen_random_uuid(),order_id uuid not null unique references public.commerce_orders(id),actor uuid not null references auth.users(id),refund_trans_id varchar(30) not null unique,amount_minor bigint not null check(amount_minor>0),reason text not null check(length(reason) between 5 and 255),status text not null default 'requested' check(status in ('requested','submitting','unknown','processing','refunded','cancelled','failed')),provider_reference text unique,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index commerce_refunds_actor on public.commerce_refunds(actor);
create table public.commerce_audit(id bigint generated always as identity primary key,actor uuid,event text not null,order_id uuid references public.commerce_orders(id),details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create index commerce_audit_order on public.commerce_audit(order_id,created_at desc);
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['commerce_settings','commerce_orders','commerce_entitlements','commerce_refunds','commerce_audit'] LOOP
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);END LOOP;END $$;
revoke all on sequence public.commerce_audit_id_seq from public,anon,authenticated,service_role;
grant select on public.commerce_settings,public.commerce_orders,public.commerce_refunds,public.commerce_audit,public.academy_admins to service_role;
create or replace function public.payment_has_access(course_key text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (public.is_academy_admin() or (public.course_is_available(course_key) and (not public.payment_course_is_paid(course_key) or (exists(select 1 from public.enrollments where user_id=auth.uid() and course_id=course_key) and (not exists(select 1 from public.commerce_entitlements where user_id=auth.uid() and course_id=course_key) or exists(select 1 from public.commerce_entitlements where user_id=auth.uid() and course_id=course_key and active))))));
$$;
create or replace function public.payment_get_content(course_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$ BEGIN
 if auth.uid() is null or not public.payment_has_access(course_key) then raise exception 'Course access required' using errcode='42501';end if;
 return (select payload from public.payment_course_content where course_id=course_key and public.payment_course_is_paid(course_key));END;$$;
create or replace function public.save_academy_course(course_id text,course_payload jsonb,is_published boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 -- Shared advisory lock serializes content/pricing changes for this course.
 perform pg_advisory_xact_lock(hashtextextended(course_id,0));
 if auth.uid() is null or not public.is_academy_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if public.payment_course_is_paid(course_id) and exists(select 1 from jsonb_array_elements(course_payload->'lessons') l where l->>'content'='Enroll to access this lesson.' or l->>'question'='This lesson requires course access.') then raise exception 'Locked placeholders cannot overwrite original content';end if;
 perform public.payment_base_save_course(course_id,course_payload,is_published);
 if public.payment_course_is_paid(course_id) then
  insert into public.payment_course_content values(course_id,course_payload) on conflict on constraint payment_course_content_pkey do update set payload=excluded.payload;
  update public.academy_courses set payload=public.payment_public_payload(course_payload) where id=course_id;
 end if;
end;$$;
create or replace function public.commerce_set_prices(course_key text,is_paid boolean,price_bdt bigint,price_usd bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare original jsonb; was_paid boolean;
begin
 if auth.uid() is null or not public.is_academy_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if course_key in ('heart-foundations','ecg-essentials','prevention') and is_paid then raise exception 'Public samples remain free';end if;
 if is_paid is null or (is_paid and price_bdt is null and price_usd is null) or (price_bdt is not null and price_bdt not between 1 and 1000000000) or (price_usd is not null and price_usd not between 1 and 1000000000) then raise exception 'Invalid prices';end if;
 perform pg_advisory_xact_lock(hashtextextended(course_key,0));
 select payload into original from public.academy_courses where id=course_key for update;
 if not found then raise exception 'Managed course required';end if;
 was_paid:=public.payment_course_is_paid(course_key);
 if is_paid and not was_paid then
  insert into public.payment_course_content values(course_key,original) on conflict(course_id) do update set payload=excluded.payload;
  update public.academy_courses set payload=public.payment_public_payload(original) where id=course_key;
 elsif not is_paid and was_paid then
  update public.academy_courses set payload=(select payload from public.payment_course_content where course_id=course_key) where id=course_key;
 end if;
 insert into public.payment_course_settings values(course_key,is_paid) on conflict(course_id) do update set paid=excluded.paid;
 insert into public.payment_prices values(course_key,'BDT',price_bdt,1,now()),(course_key,'USD',price_usd,1,now())
 on conflict(course_id,currency) do update set amount_minor=excluded.amount_minor,revision=payment_prices.revision+case when payment_prices.amount_minor is distinct from excluded.amount_minor then 1 else 0 end,updated_at=case when payment_prices.amount_minor is distinct from excluded.amount_minor then now() else payment_prices.updated_at end;
 insert into public.commerce_audit(actor,event,details) values(auth.uid(),'prices.saved',jsonb_build_object('course_id',course_key,'paid',is_paid,'BDT',price_bdt,'USD',price_usd));
 return jsonb_build_object('paid',is_paid,'BDT',price_bdt,'USD',price_usd);
end;$$;
CREATE OR REPLACE FUNCTION public.academy_complete_lesson(course_key text,lesson_key text,selected_answer integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE actor uuid := auth.uid(); content jsonb; expected integer;
BEGIN
 IF actor IS NULL OR NOT public.payment_has_access(course_key) OR NOT public.course_is_available(course_key) OR NOT EXISTS(SELECT 1 FROM public.enrollments e WHERE e.user_id=actor AND e.course_id=course_key) THEN RAISE EXCEPTION 'Enroll in this course before saving progress' USING ERRCODE='42501';END IF;
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
revoke all on function public.commerce_set_prices(text,boolean,bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function public.commerce_set_prices(text,boolean,bigint,bigint) to authenticated;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- All privileged payment transitions are service-only. Client JWTs cannot execute them.
create function public.commerce_create_order(actor uuid,course_key text,selected_currency text,idempotency_key uuid,expected_environment text) returns public.commerce_orders language plpgsql security definer set search_path='' as $$
declare s public.commerce_settings;p public.payment_prices;o public.commerce_orders;new_id uuid;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirmed account required' using errcode='42501';end if;
 select * into s from public.commerce_settings where singleton for share;
 if not s.live_enabled or not s.merchant_approved or s.provider_environment<>expected_environment or expected_environment not in ('sandbox','live') then raise exception 'Checkout unavailable' using errcode='42501';end if;
 if selected_currency is null or selected_currency<>'BDT' or not(selected_currency=any(s.verified_currencies)) or idempotency_key is null then raise exception 'Currency unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||'/'||course_key,1));
 select * into o from public.commerce_orders where user_id=actor and request_key=idempotency_key;
 if found then
  if o.course_id<>course_key or o.currency<>selected_currency or o.environment<>expected_environment then raise exception 'Idempotency conflict';end if;return o;
 end if;
 if not public.course_is_available(course_key) or not public.payment_course_is_paid(course_key) then raise exception 'Paid course unavailable';end if;
 if exists(select 1 from public.enrollments where user_id=actor and course_id=course_key) and (not exists(select 1 from public.commerce_entitlements where user_id=actor and course_id=course_key) or exists(select 1 from public.commerce_entitlements where user_id=actor and course_id=course_key and active)) then raise exception 'Already enrolled';end if;
 select * into o from public.commerce_orders where user_id=actor and course_id=course_key and environment=expected_environment and status in ('initializing','pending','session_unknown','review');
 if found then return o;end if;
 if (select count(*) from public.commerce_orders where user_id=actor and created_at>now()-interval '1 hour')>=10 then raise exception 'Too many checkout attempts';end if;
 -- Same course lock as pricing prevents a torn price revision.
 perform pg_advisory_xact_lock(hashtextextended(course_key,0));
 select * into p from public.payment_prices where course_id=course_key and currency=selected_currency;
 if not found or p.amount_minor is null or p.amount_minor not between 1000 and 50000000 then raise exception 'Price unavailable for this gateway';end if;
 new_id:=gen_random_uuid();
 insert into public.commerce_orders(id,merchant_ref,user_id,course_id,request_key,currency,amount_minor,price_revision,environment) values(new_id,'CB'||substr(replace(new_id::text,'-',''),1,28),actor,course_key,idempotency_key,p.currency,p.amount_minor,p.revision,expected_environment) returning * into o;
 insert into public.commerce_audit(actor,event,order_id) values(actor,'order.created',o.id);return o;
end;$$;
create function public.commerce_order_guard() returns trigger language plpgsql set search_path='' as $$begin
 if (new.id,new.merchant_ref,new.user_id,new.course_id,new.request_key,new.currency,new.amount_minor,new.price_revision,new.environment,new.provider,new.created_at) is distinct from (old.id,old.merchant_ref,old.user_id,old.course_id,old.request_key,old.currency,old.amount_minor,old.price_revision,old.environment,old.provider,old.created_at) then raise exception 'Immutable order fields';end if;
 if (old.validation_id is not null and new.validation_id is distinct from old.validation_id) or (old.bank_reference is not null and new.bank_reference is distinct from old.bank_reference) or (old.session_key is not null and new.session_key is distinct from old.session_key) or (old.checkout_url is not null and new.checkout_url is distinct from old.checkout_url) then raise exception 'Immutable provider reference';end if;
 if new.status<>old.status and not (
  (old.status in ('initializing','pending','session_unknown') and new.status in ('pending','session_unknown','succeeded','failed','cancelled','review')) or
  (old.status in ('failed','cancelled','review') and new.status in ('succeeded','review')) or
  (old.status in ('succeeded','review') and new.status='refunded')) then raise exception 'Invalid order transition';end if;
 new.updated_at:=now();return new;end;$$;
create trigger commerce_immutable_order before update on public.commerce_orders for each row execute function public.commerce_order_guard();
create function public.commerce_claim_session(order_key uuid) returns boolean language plpgsql security definer set search_path='' as $$begin
 update public.commerce_orders set session_attempted=true where id=order_key and status='initializing' and not session_attempted;return found;end;$$;
create function public.commerce_attach_session(order_key uuid,provider_session text,provider_url text) returns public.commerce_orders language plpgsql security definer set search_path='' as $$
declare o public.commerce_orders;allowed text;begin
 select * into o from public.commerce_orders where id=order_key for update;if not found or o.status<>'initializing' then raise exception 'Session already attempted';end if;
 allowed:=case when o.environment='sandbox' then 'https://sandbox.sslcommerz.com/' else 'https://securepay.sslcommerz.com/' end;
 if length(coalesce(provider_session,'')) not between 1 and 255 or length(coalesce(provider_url,'')) not between 1 and 2000 or left(provider_url,length(allowed))<>allowed then raise exception 'Invalid hosted session';end if;
 update public.commerce_orders set session_key=provider_session,checkout_url=provider_url,status='pending' where id=o.id returning * into o;
 insert into public.commerce_audit(event,order_id) values('session.created',o.id);return o;end;$$;
create function public.commerce_session_unknown(order_key uuid) returns void language plpgsql security definer set search_path='' as $$begin
 update public.commerce_orders set status='session_unknown' where id=order_key and status='initializing';
 insert into public.commerce_audit(event,order_id) values('session.uncertain',order_key);end;$$;
create function public.commerce_claim_reconciliation(order_key uuid,actor uuid) returns boolean language plpgsql security definer set search_path='' as $$begin
 update public.commerce_orders set last_reconciled_at=now() where id=order_key and (user_id=actor or exists(select 1 from public.academy_admins where user_id=actor)) and (last_reconciled_at is null or last_reconciled_at<now()-interval '15 seconds');return found;end;$$;
create function public.commerce_record_payment(order_key uuid,merchant_transaction text,verified_amount bigint,verified_currency text,verified_environment text,verified_status text,validation_reference text,bank_transaction text) returns public.commerce_orders language plpgsql security definer set search_path='' as $$
declare o public.commerce_orders;target text;begin
 select * into o from public.commerce_orders where id=order_key for update;if not found then raise exception 'Order unavailable';end if;
 if merchant_transaction is distinct from o.merchant_ref or verified_amount is distinct from o.amount_minor or verified_currency is distinct from o.currency or verified_environment is distinct from o.environment then raise exception 'Receipt mismatch';end if;
 if verified_status not in ('succeeded','failed','cancelled','review') or verified_status is null then raise exception 'Invalid provider state';end if;
 if verified_status in ('succeeded','review') and (length(coalesce(validation_reference,'')) not between 1 and 100 or length(coalesce(bank_transaction,'')) not between 1 and 100) then raise exception 'Verified references required';end if;
 if o.status='refunded' then return o;end if;
 if o.status='succeeded' then
  if validation_reference is distinct from o.validation_id or bank_transaction is distinct from o.bank_reference then raise exception 'Conflicting settled payment';end if;return o;
 end if;
 if o.status in ('failed','cancelled','review') and verified_status in ('failed','cancelled') then return o;end if;
 target:=verified_status;
 if target='succeeded' and exists(select 1 from public.commerce_entitlements where user_id=o.user_id and course_id=o.course_id and active and order_id<>o.id) then target:='review';end if;
 if target='succeeded' and (not public.course_is_available(o.course_id) or not public.payment_course_is_paid(o.course_id)) then target:='review';end if;
 update public.commerce_orders set status=target,validation_id=coalesce(nullif(validation_reference,''),validation_id),bank_reference=coalesce(nullif(bank_transaction,''),bank_reference) where id=o.id returning * into o;
 if target='succeeded' then
  insert into public.enrollments(user_id,course_id) values(o.user_id,o.course_id) on conflict do nothing;
  insert into public.commerce_entitlements(user_id,course_id,order_id) values(o.user_id,o.course_id,o.id) on conflict do nothing;
 end if;
 insert into public.commerce_audit(event,order_id,details) values('payment.'||target,o.id,jsonb_build_object('currency',o.currency,'amount_minor',o.amount_minor));return o;end;$$;
create function public.commerce_request_refund(actor uuid,order_key uuid,reason_text text) returns public.commerce_refunds language plpgsql security definer set search_path='' as $$
declare o public.commerce_orders;r public.commerce_refunds;new_id uuid;begin
 if not exists(select 1 from public.academy_admins where user_id=actor) then raise exception 'Administrator required' using errcode='42501';end if;
 select * into o from public.commerce_orders where id=order_key for update;if not found or (o.status not in ('succeeded','review') or o.validation_id is null or o.bank_reference is null) then raise exception 'Settled order required';end if;
 select * into r from public.commerce_refunds where order_id=order_key;if found then return r;end if;
 new_id:=gen_random_uuid();insert into public.commerce_refunds(id,order_id,actor,refund_trans_id,amount_minor,reason) values(new_id,order_key,actor,'RF'||substr(replace(new_id::text,'-',''),1,28),o.amount_minor,trim(reason_text)) returning * into r;
 insert into public.commerce_audit(actor,event,order_id) values(actor,'refund.requested',order_key);return r;end;$$;
create function public.commerce_claim_refund(actor uuid,refund_key uuid) returns public.commerce_refunds language plpgsql security definer set search_path='' as $$
declare r public.commerce_refunds;begin
 if not exists(select 1 from public.academy_admins where user_id=actor) then raise exception 'Administrator required' using errcode='42501';end if;
 update public.commerce_refunds set status='submitting',updated_at=now() where id=refund_key and status='requested' returning * into r;if not found then raise exception 'Refund already attempted; reconcile instead';end if;return r;end;$$;
create function public.commerce_record_refund(refund_key uuid,provider_ref text,verified_status text) returns public.commerce_refunds language plpgsql security definer set search_path='' as $$
declare r public.commerce_refunds;begin
 select * into r from public.commerce_refunds where id=refund_key for update;if not found then raise exception 'Refund unavailable';end if;
 if verified_status is null or verified_status not in ('unknown','processing','refunded','cancelled','failed') then raise exception 'Invalid refund state';end if;
 if r.status='refunded' then return r;end if;
 if r.status not in ('submitting','unknown','processing') then raise exception 'Refund not submitted';end if;
 if r.provider_reference is not null and provider_ref is distinct from r.provider_reference then raise exception 'Conflicting refund reference';end if;
 if verified_status in ('processing','refunded') and coalesce(provider_ref,'')='' then raise exception 'Refund reference required';end if;
 update public.commerce_refunds set status=verified_status,provider_reference=coalesce(provider_ref,provider_reference),updated_at=now() where id=r.id returning * into r;
 if verified_status='refunded' then
  update public.commerce_orders set status='refunded' where id=r.order_id and status in ('succeeded','review');
  update public.commerce_entitlements set active=false where order_id=r.order_id;
 end if;
 insert into public.commerce_audit(event,order_id) values('refund.'||verified_status,r.order_id);return r;end;$$;
-- Explicit allowlist of service RPCs. Privileged trigger/helper execution is never a client API.
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' and p.proname in ('commerce_create_order','commerce_claim_session','commerce_order_guard','commerce_attach_session','commerce_session_unknown','commerce_claim_reconciliation','commerce_record_payment','commerce_request_refund','commerce_claim_refund','commerce_record_refund') LOOP
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname<>'commerce_order_guard' then execute format('grant execute on function %s to service_role',f.signature);end if;
 END LOOP;
END $$;

update public.commerce_settings set provider_environment='sandbox',merchant_approved=true,live_enabled=true where singleton;
