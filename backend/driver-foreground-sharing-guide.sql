begin;
select pg_advisory_xact_lock(1744899272);

insert into public.admin_rule_revisions(sections,changed_section,summary)
select jsonb_set(sections,'{05_tracking,body}',to_jsonb(
 sections->'05_tracking'->>'body'||E'\n\nيظهر خيار السماح بمشاركة الموقع مباشرةً في الرحلة الحالية إذا لم يسبق للسائق تفعيله على هذا الجهاز. في المتصفح، أو إذا تعذّر بدء المشاركة في الخلفية على أندرويد، يحاول التطبيق إرسال موقع حديث إلى الزبون أثناء بقاء شاشة الرحلة مفتوحة ومع توفر إذن الموقع والاتصال.'
)),
'05_tracking','إظهار خيار مشاركة موقع السائق واستخدام المشاركة أثناء فتح التطبيق عند تعذّر تشغيلها بالخلفية'
from (
 select sections from public.admin_rule_revisions order by id desc limit 1
) latest
where sections->'05_tracking'->>'body' not like '%يظهر خيار السماح بمشاركة الموقع مباشرةً%';

commit;
