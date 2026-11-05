begin;

create table public.admin_rule_revisions (
 id integer generated always as identity primary key,
 sections jsonb not null check (jsonb_typeof(sections)='object'),
 changed_section text,
 summary text not null check (length(btrim(summary)) between 1 and 400),
 published_at timestamptz not null default now()
);
alter table public.admin_rule_revisions enable row level security;
revoke all on public.admin_rule_revisions from public,anon,authenticated;
grant select on public.admin_rule_revisions to authenticated;
create policy admin_reads_rule_revisions on public.admin_rule_revisions
 for select to authenticated using ((select public.is_staff_admin()));

create function ride_request_private.revise_admin_rules(
 p_expected_id integer,p_section text,p_body text,p_summary text
) returns integer language plpgsql security definer set search_path='' as $$
declare current_doc public.admin_rule_revisions%rowtype; new_id integer;
begin
 if not public.is_staff_admin() then raise sqlstate '42501' using message='not_admin'; end if;
 if p_section is null or p_body is null or length(btrim(p_body)) not between 1 and 6000
    or p_summary is null or length(btrim(p_summary)) not between 1 and 400 then
  raise sqlstate '22023' using message='invalid_rule_revision';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(1744899272);
 select * into strict current_doc from public.admin_rule_revisions order by id desc limit 1;
 if current_doc.id is distinct from p_expected_id then
  raise sqlstate 'YR001' using message='rule_revision_conflict';
 end if;
 if not (current_doc.sections ? p_section) then
  raise sqlstate '22023' using message='unknown_rule_section';
 end if;
 if current_doc.sections->p_section->>'body'=btrim(p_body) then return current_doc.id; end if;
 insert into public.admin_rule_revisions(sections,changed_section,summary)
 values(jsonb_set(current_doc.sections,array[p_section,'body'],to_jsonb(btrim(p_body))),p_section,btrim(p_summary))
 returning id into new_id;
 return new_id;
end;
$$;

create function public.revise_admin_rules(p_expected_id integer,p_section text,p_body text,p_summary text)
returns integer language sql security invoker set search_path='' as $$
 select ride_request_private.revise_admin_rules(p_expected_id,p_section,p_body,p_summary);
$$;
revoke all on function ride_request_private.revise_admin_rules(integer,text,text,text) from public,anon,authenticated;
revoke all on function public.revise_admin_rules(integer,text,text,text) from public,anon,authenticated;
grant execute on function ride_request_private.revise_admin_rules(integer,text,text,text) to authenticated;
grant execute on function public.revise_admin_rules(integer,text,text,text) to authenticated;

insert into public.admin_rule_revisions(sections,summary)
values ($guide$
{
 "01_booking":{"title":"إنشاء الطلب","body":"الراكب يحدد الوجهة والمنطقة وفئة السيارة. نقطة الانطلاق هي موقع الهاتف الحالي.\nقبل تأكيد الطلب يُراجع التطبيق موقع الانطلاق. إذا ابتعد الموقع أكثر من ٣٠ مترًا عن الموقع المستخدم في التقدير، يُعاد حساب الأجرة قبل الإرسال.\nلكل محاولة إرسال معرّف ثابت. إذا ضاع الرد أو أعاد الراكب إرسال المحاولة نفسها، يرجع السيرفر نفس الرحلة المسجّلة. لكل راكب طلب أو رحلة نشطة واحدة."},
 "02_fare":{"title":"حساب الأجرة","body":"الأجرة التقديرية بالليرة السورية = (فتح العداد + مسافة رحلة الراكب بالكيلومتر × سعر الكيلومتر + مدة الرحلة بالدقيقة × سعر الدقيقة) × معامل الذروة. يُقرّب الناتج لأقرب ليرة.\nالسيرفر يأخذ مسافة القيادة ومدتها من Google، والتسعيرة من لوحة الإدارة. طريق السائق إلى الراكب منفصل عن أجرة الرحلة.\nالتقدير صالح ١٥ دقيقة ويُربط بالحساب ونقطتي الرحلة. عند تسجيل الطلب تظهر للسائق نفس الأجرة التقديرية. تفاصيل الطريق تُحسب عند العرض، والدفع نقدًا."},
 "03_offers":{"title":"من يرى الطلب وكم يبقى؟","body":"يرى الطلبَ السائقُ المعتمد الذي فعّل الاستقبال ويطابق منطقة الطلب وفئة السيارة. الطلبات بانتظار سائق تظهر بالأقدم أولًا، من دون ترتيب حسب الأقرب.\nمهلة القبول ثلاث دقائق من إرسال الطلب أو من إعادته للبحث. تظهر المدة المتبقية، ويرفض السيرفر أي قبول متأخر.\nأول قبول صالح يسجله السيرفر يعيّن السائق. عند تحديث القائمة يختفي العرض عن الآخرين. رفض العرض يخفيه عن السائق الرافض وحده. لكل سائق رحلة نشطة واحدة."},
 "04_trip":{"title":"من القبول حتى نهاية الرحلة","body":"المراحل: بانتظار سائق ← السائق في الطريق ← وصل السائق ← الرحلة جارية ← مكتملة.\nالسائق المعيّن يضغط «وصلت إلى الزبون». بعدها يؤكد الراكب ركوب السيارة من حسابه، ثم يستطيع السائق بدء الرحلة. لا يلزم رمز للركوب.\nالراكب يستطيع إلغاء الطلب قبل بدء الرحلة. السائق يستطيع إعادته للبحث قبل بدء الرحلة. إذا انتهت مهلة البحث بلا قبول، يظهر للراكب أن البحث انتهى ويمكنه إرسال طلب جديد."},
 "05_tracking":{"title":"الملاحة وموقع التاكسي","body":"خريطة الراكب تعرض موقع التاكسي بعد القبول وطوال توجه السائق إلى نقطة الالتقاء، عند توفر موقع حديث والتطبيق مفتوح لدى السائق.\nتظهر مدة مرور الوقت منذ آخر تحديث. بعد ٣٠ ثانية دون موقع جديد، يظهر تنبيه ويظل آخر موقع معروف ظاهرًا. تتوقف مشاركة الموقع عند الوصول أو الإلغاء أو إعادة الطلب للبحث."},
 "06_driver":{"title":"شاشة السائق والسجل","body":"خارج العمل يظهر زر بدء استقبال الطلبات. أثناء الاستقبال تظهر الطلبات أولًا، مع الأجرة ومسافة الطريق للزبون وزري القبول والرفض. بعد القبول تظهر الرحلة الحالية وتعليمة الملاحة والزر المناسب للمرحلة.\nأسفل الشاشة أزرار ثابتة للمنجزة والملغاة وغير المكتملة. الطلبات غير المكتملة هنا هي التي قبلها السائق ثم أعادها للبحث أو انتقلت منه إلى سائق آخر قبل بدء الرحلة."},
 "07_connection":{"title":"انقطاع الإنترنت وإعادة المحاولة","body":"إذا ضاع رد إرسال الطلب أو قبوله، يظهر «جارٍ التحقق». عند عودة الاتصال يقرأ التطبيق النتيجة من السيرفر. يمكن إعادة إرسال الطلب نفسه دون إنشاء نسخة ثانية.\nإذا تعذّر تحميل الطريق، تبقى بطاقة الطلب والأجرة المسجلة وإجراءات العرض متاحة، وتظهر تفاصيل الطريق عند وصولها."}
}
$guide$::jsonb,'النسخة المرجعية الأولى للقواعد المنشورة في يلا نروح، بما فيها مهلة العرض وسجل السائق.');

commit;
