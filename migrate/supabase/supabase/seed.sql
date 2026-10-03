begin;

insert into public.school_groups (grade, section)
values
  (1, 'A'), (1, 'B'), (1, 'C'), (1, 'D'),
  (2, 'A'), (2, 'B'), (2, 'C'),
  (3, 'A'), (3, 'B'), (3, 'C')
on conflict (grade, section) do nothing;

create temporary table seed_schedule (
  group_name text not null,
  day text not null,
  subject_name text not null
) on commit drop;

insert into seed_schedule (group_name, day, subject_name)
select source.group_name, day_item.key, subject_item.value
from jsonb_to_recordset($seed$
[
  {"group_name":"1A","schedule":{"lunes":["Matemáticas","Geografía","Historia","Español","Biología","Tecno/Artes","Música"],"martes":["Formación C y E","Tecno/Artes","Matemáticas","Historia","Español","Geografía","Biología"],"miércoles":["Inglés","Español","Biología","Geografía","Matemáticas","Formación C y E"],"jueves":["Inglés","Tecno/Artes","Matemáticas","Español","Biología","Música"],"viernes":["Tecno/Artes","Geografía","Matemáticas","Inglés","Español","Música"]}},
  {"group_name":"1B","schedule":{"lunes":["Música","Español","Tecno/Artes","Matemáticas","Geografía","Historia","Biología"],"martes":["Tecno/Artes","Biología","Matemáticas","Formación C y E","Español"],"miércoles":["Inglés","Tecno/Artes","Biología","Historia","Español","Geografía","Matemáticas"],"jueves":["Inglés","Matemáticas","Español","Biología","Geografía","Tecno/Artes","Música"],"viernes":["Geografía","Español","Matemáticas","Tecno/Artes","Inglés","Música","Formación C y E"]}},
  {"group_name":"1C","schedule":{"lunes":["Música","Español","Tecno/Artes","Matemáticas","Geografía","Historia","Biología","Formación C y E"],"martes":["Geografía","Tecno/Artes","Biología","Matemáticas","Español","Formación C y E"],"miércoles":["Inglés","Tecno/Artes","Matemáticas","Historia","Español","Geografía"],"jueves":["Inglés","Tecno/Artes","Matemáticas","Música","Español","Biología"],"viernes":["Español","Tecno/Artes","Inglés","Biología","Música","Matemáticas","Geografía"]}},
  {"group_name":"1D","schedule":{"lunes":["Música","Tecno/Artes","Formación C y E","Matemáticas","Español","Geografía"],"martes":["Biología","Español","Historia","Formación C y E","Matemáticas","Geografía"],"miércoles":["Inglés","Geografía","Español","Tecno/Artes","Matemáticas","Biología","Historia"],"jueves":["Inglés","Biología","Tecno/Artes","Español","Matemáticas","Geografía","Música"],"viernes":["Matemáticas","Español","Música","Inglés","Tecno/Artes","Biología"]}},
  {"group_name":"2A","schedule":{"lunes":["Tecno/Artes","Música","Historia","Español","Física","Matemáticas"],"martes":["Tecno/Artes","Física","Formación C y E","Inglés","Español","Matemáticas","Historia"],"miércoles":["Tecno/Artes","Física","Formación C y E","Matemáticas","Español"],"jueves":["Tecno/Artes","Matemáticas","Inglés","Español","Física","Música"],"viernes":["Tecno/Artes","Inglés","Física","Música","Matemáticas","Español","Historia"]}},
  {"group_name":"2B","schedule":{"lunes":["Física","Tecno/Artes","Música","Español","Matemáticas","Historia"],"martes":["Matemáticas","Tecno/Artes","Física","Español","Historia","Inglés"],"miércoles":["Matemáticas","Tecno/Artes","Física","Español","Historia","Formación C y E"],"jueves":["Tecno/Artes","Física","Inglés","Matemáticas","Música","Español","Formación C y E"],"viernes":["Inglés","Historia","Música","Física","Matemáticas","Español","Tecno/Artes"]}},
  {"group_name":"2C","schedule":{"lunes":["Historia","Matemáticas","Música","Tecno/Artes","Formación C y E","Español"],"martes":["Historia","Física","Inglés","Tecno/Artes","Matemáticas","Español"],"miércoles":["Tecno/Artes","Matemáticas","Formación C y E","Español","Física"],"jueves":["Física","Inglés","Música","Matemáticas","Español","Historia"],"viernes":["Inglés","Matemáticas","Historia","Música","Tecno/Artes","Español","Física"]}},
  {"group_name":"3A","schedule":{"lunes":["Química","Música","Inglés","Matemáticas","Tecno/Artes","Español"],"martes":["Español","Química","Formación C y E","Tecno/Artes","Historia"],"miércoles":["Tecno/Artes","Inglés","Química","Historia","Tecno/Artes","Español","Matemáticas"],"jueves":["Química","Español","Matemáticas","Música","Historia","Formación C y E"],"viernes":["Matemáticas","Inglés","Español","Química","Tecno/Artes","Música","Historia"]}},
  {"group_name":"3B","schedule":{"lunes":["Tecno/Artes","Música","Inglés","Matemáticas","Química","Español"],"martes":["Matemáticas","Historia","Química","Formación C y E","Español","Tecno/Artes"],"miércoles":["Historia","Inglés","Tecno/Artes","Español","Matemáticas","Química"],"jueves":["Tecno/Artes","Español","Historia","Química","Matemáticas","Música"],"viernes":["Historia","Inglés","Tecno/Artes","Español","Formación C y E","Matemáticas","Música"]}},
  {"group_name":"3C","schedule":{"lunes":["Matemáticas","Inglés","Español","Formación C y E","Historia","Tecno/Artes","Música"],"martes":["Tecno/Artes","Español","Química","Matemáticas","Historia","Tecno/Artes","Química"],"miércoles":["Español","Inglés","Historia","Química","Tecno/Artes","Matemáticas","Tecno/Artes"],"jueves":["Música","Español","Historia","Química","Tecno/Artes","Tecno/Artes","Formación C y E","Matemáticas"],"viernes":["Tecno/Artes","Inglés","Química","Matemáticas","Química","Español","Música"]}}
]
$seed$::jsonb) as source(group_name text, schedule jsonb)
cross join lateral jsonb_each(source.schedule) as day_item(key, value)
cross join lateral jsonb_array_elements_text(day_item.value) as subject_item(value);

insert into public.subjects (name)
select distinct btrim(subject_name)
from seed_schedule
on conflict (name) do nothing;

insert into public.schedule (group_id, day, subject_id)
select distinct school_group.id, seed.day, subject.id
from seed_schedule as seed
join public.school_groups as school_group on school_group.group_name = seed.group_name
join public.subjects as subject on subject.name = btrim(seed.subject_name)
on conflict (group_id, day, subject_id) do nothing;

commit;
