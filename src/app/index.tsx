import { useMemo, useState } from 'react';
import { View } from 'react-native';

import DayTimeline, { END_HOUR, SLOT_MINUTES, START_HOUR } from '@/components/day-timeline';
import { Doctor } from '@/components/doctor-select';
import { CalendarViewMode } from '@/components/month-calendar';

const ALL_DOCTORS_ID = 'all';

const DOCTORS: Doctor[] = [
  { id: ALL_DOCTORS_ID, firstName: 'Всі', lastName: 'лікарі', color: '#9AA0A6' },
  { id: 'kovalchuk', firstName: 'Олена', lastName: 'Ковальчук', color: '#388098', specialty: 'Терапевт' },
  { id: 'petrenko', firstName: 'Ігор', lastName: 'Петренко', color: '#E1A73B', specialty: 'Невролог' },
  { id: 'shevchenko', firstName: 'Марія', lastName: 'Шевченко', color: '#8E5FE0', specialty: 'Терапевт' },
  { id: 'bondarenko', firstName: 'Тарас', lastName: 'Бондаренко', color: '#D45B7A', specialty: 'Дерматолог' },
  { id: 'moroz', firstName: 'Наталія', lastName: 'Мороз', color: '#2FA36B', specialty: 'Кардіолог' },
  { id: 'lysenko', firstName: 'Дмитро', lastName: 'Лисенко', color: '#C97C2E', specialty: 'Ортопед' },
  { id: 'tkachenko', firstName: 'Юлія', lastName: 'Ткаченко', color: '#4E7FD4', specialty: 'Стоматолог' },
  { id: 'kravets', firstName: 'Андрій', lastName: 'Кравець', color: '#B85CD9', specialty: 'Хірург' },
  { id: 'zakharchuk', firstName: 'Оксана', lastName: 'Захарчук', color: '#2E9E9E', specialty: 'Гастроентеролог' },
  { id: 'poliakova', firstName: 'Ірина', lastName: 'Полякова', color: '#6B8E23', specialty: 'Гастроентеролог' },
  { id: 'savchenko', firstName: 'Дмитро', lastName: 'Савченко', color: '#A0522D', specialty: 'Гастроентеролог' },
  { id: 'romanenko', firstName: 'Сергій', lastName: 'Романенко', color: '#C24545', specialty: 'Ендокринолог' },
];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

type AppointmentRecord = {
  id: string;
  doctorId: string;
  startMinutes: number;
  durationMinutes: number;
  title: string;
  reason: string;
  phone?: string;
};

type DemoPatient = {
  name: string;
  phone: string;
};

// Phone book of previously seen patients, keyed by the name used in DEMO_BOOKINGS,
// so the phone-number search in the booking modal has real matches to find.
const DEMO_PATIENTS: DemoPatient[] = [
  { name: 'Андрій Дідківський', phone: '+38 (097) 376-74-22' },
  { name: 'Марія Гнатюк', phone: '+38 (063) 234-56-78' },
  { name: 'Олег Сидоренко', phone: '+38 (067) 345-67-89' },
  { name: 'Христина Бабич', phone: '+38 (068) 456-78-90' },
  { name: 'Тетяна Бондар', phone: '+38 (095) 567-89-01' },
  { name: 'Андрій Мельник', phone: '+38 (096) 678-90-12' },
  { name: 'Оксана Ткаченко', phone: '+38 (097) 789-01-23' },
  { name: 'Роман Кравець', phone: '+38 (098) 890-12-34' },
  { name: 'Наталія Романюк', phone: '+38 (099) 901-23-45' },
  { name: 'Сергій Захарченко', phone: '+38 (050) 112-23-34' },
  { name: 'Юрій Гнатенко', phone: '+38 (063) 223-34-45' },
  { name: 'Ірина Савчук', phone: '+38 (067) 334-45-56' },
  { name: 'Максим Дяченко', phone: '+38 (068) 445-56-67' },
  { name: 'Владислав Гончар', phone: '+38 (068) 445-56-68' },
  { name: 'Софія Литвин', phone: '+38 (096) 667-78-89' },
  { name: 'Богдан Юрченко', phone: '+38 (097) 778-89-90' },
  { name: 'Артем Поліщук', phone: '+38 (098) 889-90-01' },
  { name: 'Валентина Кузьменко', phone: '+38 (099) 990-01-12' },
  { name: 'Руслан Кучер', phone: '+38 (050) 213-24-35' },
  { name: 'Каріна Федорчук', phone: '+38 (063) 324-35-46' },
  { name: 'Павло Гриценко', phone: '+38 (067) 435-46-57' },
  { name: 'Вікторія Овчаренко', phone: '+38 (068) 546-57-68' },
  { name: 'Микола Ковтун', phone: '+38 (095) 657-68-79' },
  { name: 'Анастасія Бабенко', phone: '+38 (096) 768-79-80' },
  { name: 'Тимур Семенюк', phone: '+38 (097) 879-80-91' },
  { name: 'Кароліна Мазур', phone: '+38 (098) 980-91-02' },
  { name: 'Едуард Пасічник', phone: '+38 (099) 091-02-13' },
  { name: 'Марта Гуменюк', phone: '+38 (050) 314-25-36' },
  { name: 'Злата Ярошенко', phone: '+38 (063) 425-36-47' },
  { name: 'Данило Шумейко', phone: '+38 (067) 536-47-58' },
  { name: 'Христина Дорошенко', phone: '+38 (068) 647-58-69' },
  { name: 'Григорій Ткач', phone: '+38 (050) 415-26-37' },
  { name: 'Яна Кузьменко', phone: '+38 (063) 526-37-48' },
  { name: 'Остап Вовк', phone: '+38 (067) 637-48-59' },
  { name: 'Діана Мазепа', phone: '+38 (068) 748-59-60' },
  { name: 'Тимофій Гончаренко', phone: '+38 (096) 859-60-71' },
  { name: 'Ярослава Кушнір', phone: '+38 (097) 960-71-82' },
];

const DEMO_PATIENT_PHONE_BY_NAME = new Map(
  DEMO_PATIENTS.map((patient) => [patient.name, patient.phone])
);

const DEMO_BOOKINGS: Omit<AppointmentRecord, 'id'>[] = [
  {
    doctorId: 'kovalchuk',
    startMinutes: 9 * 60,
    durationMinutes: 30,
    title: 'Іван Петров',
    reason: 'Консультація',
  },
  {
    doctorId: 'kovalchuk',
    startMinutes: 11 * 60 + 30,
    durationMinutes: 60,
    title: 'Марія Гнатюк',
    reason: 'Профілактичний огляд',
  },
  {
    doctorId: 'kovalchuk',
    startMinutes: 15 * 60,
    durationMinutes: 120,
    title: 'Олег Сидоренко',
    reason: 'Хірургічна процедура',
  },
  {
    doctorId: 'kovalchuk',
    startMinutes: 16 * 60,
    durationMinutes: 30,
    title: 'Христина Бабич',
    reason: 'Термінова консультація',
  },
  {
    doctorId: 'petrenko',
    startMinutes: 9 * 60,
    durationMinutes: 60,
    title: 'Тетяна Бондар',
    reason: 'Головний біль',
  },
  {
    doctorId: 'petrenko',
    startMinutes: 13 * 60,
    durationMinutes: 30,
    title: 'Андрій Мельник',
    reason: 'Вакцинація',
  },
  {
    doctorId: 'petrenko',
    startMinutes: 17 * 60 + 30,
    durationMinutes: 120,
    title: 'Оксана Ткаченко',
    reason: 'Планове обстеження',
  },
  {
    doctorId: 'shevchenko',
    startMinutes: 10 * 60 + 30,
    durationMinutes: 30,
    title: 'Роман Кравець',
    reason: 'Аналіз крові',
  },
  {
    doctorId: 'shevchenko',
    startMinutes: 13 * 60,
    durationMinutes: 60,
    title: 'Наталія Романюк',
    reason: 'УЗД',
  },
  {
    doctorId: 'shevchenko',
    startMinutes: 19 * 60,
    durationMinutes: 120,
    title: 'Сергій Захарченко',
    reason: 'Реабілітація',
  },
  {
    doctorId: 'bondarenko',
    startMinutes: 8 * 60,
    durationMinutes: 30,
    title: 'Юрій Гнатенко',
    reason: 'Огляд шкіри',
  },
  {
    doctorId: 'bondarenko',
    startMinutes: 12 * 60,
    durationMinutes: 60,
    title: 'Ірина Савчук',
    reason: 'Алергологічна проба',
  },
  {
    doctorId: 'bondarenko',
    startMinutes: 16 * 60 + 30,
    durationMinutes: 120,
    title: 'Максим Дяченко',
    reason: 'Малий хірургічний захід',
  },
  {
    doctorId: 'moroz',
    startMinutes: 7 * 60 + 30,
    durationMinutes: 60,
    title: 'Владислав Гончар',
    reason: 'ЕКГ',
  },
  {
    doctorId: 'moroz',
    startMinutes: 11 * 60,
    durationMinutes: 30,
    title: 'Софія Литвин',
    reason: 'Консультація кардіолога',
  },
  {
    doctorId: 'moroz',
    startMinutes: 18 * 60,
    durationMinutes: 120,
    title: 'Богдан Юрченко',
    reason: 'Холтерівське моніторування',
  },
  {
    doctorId: 'lysenko',
    startMinutes: 9 * 60 + 30,
    durationMinutes: 120,
    title: 'Артем Поліщук',
    reason: 'Ортопедичне обстеження',
  },
  {
    doctorId: 'lysenko',
    startMinutes: 14 * 60,
    durationMinutes: 30,
    title: 'Валентина Кузьменко',
    reason: 'Гіпсування',
  },
  {
    doctorId: 'lysenko',
    startMinutes: 20 * 60,
    durationMinutes: 60,
    title: 'Руслан Кучер',
    reason: 'Контрольний огляд',
  },
  {
    doctorId: 'tkachenko',
    startMinutes: 8 * 60 + 30,
    durationMinutes: 30,
    title: 'Каріна Федорчук',
    reason: 'Стоматологічний огляд',
  },
  {
    doctorId: 'tkachenko',
    startMinutes: 13 * 60 + 30,
    durationMinutes: 60,
    title: 'Павло Гриценко',
    reason: 'Лікування карієсу',
  },
  {
    doctorId: 'tkachenko',
    startMinutes: 21 * 60,
    durationMinutes: 120,
    title: 'Вікторія Овчаренко',
    reason: 'Протезування',
  },
  {
    doctorId: 'kravets',
    startMinutes: 7 * 60,
    durationMinutes: 60,
    title: 'Микола Ковтун',
    reason: 'Первинна консультація',
  },
  {
    doctorId: 'kravets',
    startMinutes: 10 * 60,
    durationMinutes: 120,
    title: 'Анастасія Бабенко',
    reason: 'Оперативне втручання',
  },
  {
    doctorId: 'kravets',
    startMinutes: 19 * 60 + 30,
    durationMinutes: 30,
    title: 'Тимур Семенюк',
    reason: "Перев'язка",
  },
  {
    doctorId: 'zakharchuk',
    startMinutes: 9 * 60,
    durationMinutes: 120,
    title: 'Кароліна Мазур',
    reason: 'Ендоскопія',
  },
  {
    doctorId: 'zakharchuk',
    startMinutes: 15 * 60,
    durationMinutes: 30,
    title: 'Едуард Пасічник',
    reason: 'Аналіз результатів',
  },
  {
    doctorId: 'zakharchuk',
    startMinutes: 22 * 60,
    durationMinutes: 60,
    title: 'Марта Гуменюк',
    reason: 'Вечірній прийом',
  },
  {
    doctorId: 'poliakova',
    startMinutes: 9 * 60 + 30,
    durationMinutes: 30,
    title: 'Григорій Ткач',
    reason: 'Консультація гастроентеролога',
  },
  {
    doctorId: 'poliakova',
    startMinutes: 11 * 60,
    durationMinutes: 90,
    title: 'Яна Кузьменко',
    reason: 'Колоноскопія',
  },
  {
    doctorId: 'poliakova',
    startMinutes: 14 * 60 + 30,
    durationMinutes: 60,
    title: 'Остап Вовк',
    reason: 'УЗД органів черевної порожнини',
  },
  {
    doctorId: 'savchenko',
    startMinutes: 13 * 60 + 30,
    durationMinutes: 30,
    title: 'Діана Мазепа',
    reason: 'Дихальний тест на H. pylori',
  },
  {
    doctorId: 'savchenko',
    startMinutes: 16 * 60,
    durationMinutes: 60,
    title: 'Тимофій Гончаренко',
    reason: 'Гастроскопія',
  },
  {
    doctorId: 'savchenko',
    startMinutes: 19 * 60,
    durationMinutes: 60,
    title: 'Ярослава Кушнір',
    reason: 'Диспансеризація',
  },
  {
    doctorId: 'romanenko',
    startMinutes: 12 * 60 + 30,
    durationMinutes: 30,
    title: 'Злата Ярошенко',
    reason: 'Вакцинація',
  },
  {
    doctorId: 'romanenko',
    startMinutes: 16 * 60,
    durationMinutes: 60,
    title: 'Данило Шумейко',
    reason: 'УЗД щитоподібної залози',
  },
  {
    doctorId: 'romanenko',
    startMinutes: 20 * 60 + 30,
    durationMinutes: 120,
    title: 'Христина Дорошенко',
    reason: 'Реабілітаційна терапія',
  },
];

function buildDemoAppointments(): Record<string, AppointmentRecord[]> {
  const todayKey = dateKey(new Date());
  return {
    [todayKey]: DEMO_BOOKINGS.map((booking, index) => ({
      id: `demo-${index}`,
      ...booking,
      phone: DEMO_PATIENT_PHONE_BY_NAME.get(booking.title),
    })),
  };
}

type LaidOutEvent = AppointmentRecord & { color: string };

function layoutOverlappingEvents(appointments: LaidOutEvent[]) {
  const sorted = [...appointments].sort((a, b) => a.startMinutes - b.startMinutes);
  const active: { end: number; column: number }[] = [];
  const placed = sorted.map((appointment) => {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].end <= appointment.startMinutes) {
        active.splice(i, 1);
      }
    }
    const usedColumns = new Set(active.map((slot) => slot.column));
    let column = 0;
    while (usedColumns.has(column)) {
      column += 1;
    }
    active.push({ end: appointment.startMinutes + appointment.durationMinutes, column });
    return { appointment, column, end: appointment.startMinutes + appointment.durationMinutes };
  });

  // Group into overlap clusters so unrelated (non-overlapping) events don't share a column count.
  const byStart = [...placed].sort((a, b) => a.appointment.startMinutes - b.appointment.startMinutes);
  const clusters: (typeof placed)[] = [];
  let clusterEnd = -Infinity;
  let current: typeof placed = [];
  for (const item of byStart) {
    if (item.appointment.startMinutes >= clusterEnd) {
      if (current.length > 0) {
        clusters.push(current);
      }
      current = [item];
      clusterEnd = item.end;
    } else {
      current.push(item);
      clusterEnd = Math.max(clusterEnd, item.end);
    }
  }
  if (current.length > 0) {
    clusters.push(current);
  }

  return clusters.flatMap((cluster) => {
    const columns = Math.max(...cluster.map((item) => item.column)) + 1;
    return cluster.map((item) => ({ ...item.appointment, column: item.column, columns }));
  });
}

const REAL_DOCTORS = DOCTORS.filter((doctor) => doctor.id !== ALL_DOCTORS_ID);

type Procedure = {
  id: string;
  name: string;
  durationMinutes: number;
};

// Ten example procedures per specialty, used to populate the procedure selector
// when creating or editing an appointment for a doctor of that specialty.
const SPECIALTY_PROCEDURES: Record<string, Procedure[]> = {
  Терапевт: [
    { id: 'therapist-consult', name: 'Консультація', durationMinutes: 30 },
    { id: 'therapist-checkup', name: 'Профілактичний огляд', durationMinutes: 60 },
    { id: 'therapist-urgent', name: 'Термінова консультація', durationMinutes: 30 },
    { id: 'therapist-surgical', name: 'Хірургічна процедура', durationMinutes: 90 },
    { id: 'therapist-blood', name: 'Аналіз крові', durationMinutes: 30 },
    { id: 'therapist-uzi', name: 'УЗД', durationMinutes: 60 },
    { id: 'therapist-rehab', name: 'Реабілітація', durationMinutes: 60 },
    { id: 'therapist-cert', name: 'Видача довідки', durationMinutes: 30 },
    { id: 'therapist-vaccination', name: 'Вакцинація', durationMinutes: 30 },
    { id: 'therapist-dispensary', name: 'Диспансеризація', durationMinutes: 60 },
  ],
  Невролог: [
    { id: 'neurologist-headache', name: 'Головний біль', durationMinutes: 30 },
    { id: 'neurologist-vaccination', name: 'Вакцинація', durationMinutes: 30 },
    { id: 'neurologist-planned', name: 'Планове обстеження', durationMinutes: 60 },
    { id: 'neurologist-eeg', name: 'ЕЕГ', durationMinutes: 60 },
    { id: 'neurologist-consult', name: 'Консультація невролога', durationMinutes: 30 },
    { id: 'neurologist-injury', name: 'Огляд після травми', durationMinutes: 30 },
    { id: 'neurologist-migraine', name: 'Лікування мігрені', durationMinutes: 30 },
    { id: 'neurologist-exam', name: 'Неврологічне обстеження', durationMinutes: 60 },
    { id: 'neurologist-neck-uzi', name: 'УЗД судин шиї', durationMinutes: 60 },
    { id: 'neurologist-control', name: 'Контрольний огляд', durationMinutes: 30 },
  ],
  Дерматолог: [
    { id: 'dermatologist-skin', name: 'Огляд шкіри', durationMinutes: 30 },
    { id: 'dermatologist-allergy', name: 'Алергологічна проба', durationMinutes: 60 },
    { id: 'dermatologist-minor-surgery', name: 'Малий хірургічний захід', durationMinutes: 120 },
    { id: 'dermatologist-removal', name: 'Видалення новоутворення', durationMinutes: 60 },
    { id: 'dermatologist-dermatoscopy', name: 'Дерматоскопія', durationMinutes: 30 },
    { id: 'dermatologist-consult', name: 'Консультація дерматолога', durationMinutes: 30 },
    { id: 'dermatologist-acne', name: 'Лікування акне', durationMinutes: 30 },
    { id: 'dermatologist-cryo', name: 'Кріотерапія', durationMinutes: 30 },
    { id: 'dermatologist-biopsy', name: 'Біопсія шкіри', durationMinutes: 60 },
    { id: 'dermatologist-control', name: 'Контрольний огляд', durationMinutes: 30 },
  ],
  Кардіолог: [
    { id: 'cardiologist-ecg', name: 'ЕКГ', durationMinutes: 30 },
    { id: 'cardiologist-consult', name: 'Консультація кардіолога', durationMinutes: 30 },
    { id: 'cardiologist-holter', name: 'Холтерівське моніторування', durationMinutes: 120 },
    { id: 'cardiologist-echo', name: 'Ехокардіографія', durationMinutes: 60 },
    { id: 'cardiologist-abpm', name: 'Добовий моніторинг АТ', durationMinutes: 60 },
    { id: 'cardiologist-ergometry', name: 'Велоергометрія', durationMinutes: 60 },
    { id: 'cardiologist-control', name: 'Контрольний огляд', durationMinutes: 30 },
    { id: 'cardiologist-ecg-review', name: 'Консультація з розшифровкою ЕКГ', durationMinutes: 30 },
    { id: 'cardiologist-checkup', name: 'Профілактичний огляд серця', durationMinutes: 60 },
    { id: 'cardiologist-urgent', name: 'Термінова консультація', durationMinutes: 30 },
  ],
  Ортопед: [
    { id: 'orthopedist-checkup', name: 'Ортопедичне обстеження', durationMinutes: 60 },
    { id: 'orthopedist-cast', name: 'Гіпсування', durationMinutes: 30 },
    { id: 'orthopedist-control', name: 'Контрольний огляд', durationMinutes: 30 },
    { id: 'orthopedist-xray', name: 'Рентген-консультація', durationMinutes: 30 },
    { id: 'orthopedist-block', name: 'Блокада суглоба', durationMinutes: 30 },
    { id: 'orthopedist-insoles', name: 'Підбір ортопедичних стельок', durationMinutes: 30 },
    { id: 'orthopedist-arthroscopy', name: 'Артроскопія', durationMinutes: 120 },
    { id: 'orthopedist-fracture', name: 'Лікування переломів', durationMinutes: 60 },
    { id: 'orthopedist-consult', name: 'Консультація ортопеда', durationMinutes: 30 },
    { id: 'orthopedist-rehab', name: 'Реабілітація після травми', durationMinutes: 60 },
  ],
  Стоматолог: [
    { id: 'dentist-checkup', name: 'Стоматологічний огляд', durationMinutes: 30 },
    { id: 'dentist-caries', name: 'Лікування карієсу', durationMinutes: 60 },
    { id: 'dentist-prosthetics', name: 'Протезування', durationMinutes: 120 },
    { id: 'dentist-extraction', name: 'Видалення зуба', durationMinutes: 30 },
    { id: 'dentist-cleaning', name: 'Чищення зубного каменю', durationMinutes: 60 },
    { id: 'dentist-whitening', name: 'Відбілювання', durationMinutes: 60 },
    { id: 'dentist-filling', name: 'Встановлення пломби', durationMinutes: 30 },
    { id: 'dentist-orthodontist', name: 'Консультація ортодонта', durationMinutes: 30 },
    { id: 'dentist-pulpitis', name: 'Лікування пульпіту', durationMinutes: 90 },
    { id: 'dentist-preventive', name: 'Профілактичний огляд', durationMinutes: 30 },
  ],
  Хірург: [
    { id: 'surgeon-consult', name: 'Первинна консультація', durationMinutes: 30 },
    { id: 'surgeon-operation', name: 'Оперативне втручання', durationMinutes: 120 },
    { id: 'surgeon-dressing', name: "Перев'язка", durationMinutes: 30 },
    { id: 'surgeon-preop', name: 'Консультація перед операцією', durationMinutes: 30 },
    { id: 'surgeon-removal', name: 'Видалення новоутворення', durationMinutes: 60 },
    { id: 'surgeon-stitches', name: 'Зняття швів', durationMinutes: 30 },
    { id: 'surgeon-minor', name: 'Малий хірургічний захід', durationMinutes: 60 },
    { id: 'surgeon-postop', name: 'Контрольний огляд після операції', durationMinutes: 30 },
    { id: 'surgeon-abscess', name: 'Дренування абсцесу', durationMinutes: 60 },
    { id: 'surgeon-planned', name: 'Планове обстеження', durationMinutes: 30 },
  ],
  Гастроентеролог: [
    { id: 'gastroenterologist-endoscopy', name: 'Ендоскопія', durationMinutes: 120 },
    { id: 'gastroenterologist-results', name: 'Аналіз результатів', durationMinutes: 30 },
    { id: 'gastroenterologist-evening', name: 'Вечірній прийом', durationMinutes: 30 },
    { id: 'gastroenterologist-consult', name: 'Консультація гастроентеролога', durationMinutes: 30 },
    { id: 'gastroenterologist-abdomen-uzi', name: 'УЗД органів черевної порожнини', durationMinutes: 60 },
    { id: 'gastroenterologist-colonoscopy', name: 'Колоноскопія', durationMinutes: 90 },
    { id: 'gastroenterologist-hpylori', name: 'Дихальний тест на H. pylori', durationMinutes: 30 },
    { id: 'gastroenterologist-control', name: 'Контрольний огляд', durationMinutes: 30 },
    { id: 'gastroenterologist-gastroscopy', name: 'Гастроскопія', durationMinutes: 60 },
    { id: 'gastroenterologist-dispensary', name: 'Диспансеризація', durationMinutes: 60 },
  ],
  Ендокринолог: [
    { id: 'endocrinologist-vaccination', name: 'Вакцинація', durationMinutes: 30 },
    { id: 'endocrinologist-thyroid-uzi', name: 'УЗД щитоподібної залози', durationMinutes: 60 },
    { id: 'endocrinologist-rehab', name: 'Реабілітаційна терапія', durationMinutes: 60 },
    { id: 'endocrinologist-consult', name: 'Консультація ендокринолога', durationMinutes: 30 },
    { id: 'endocrinologist-hormones', name: 'Аналіз на гормони', durationMinutes: 30 },
    { id: 'endocrinologist-sugar', name: 'Контроль рівня цукру', durationMinutes: 30 },
    { id: 'endocrinologist-biopsy', name: 'Пункція щитоподібної залози', durationMinutes: 60 },
    { id: 'endocrinologist-checkup', name: 'Профілактичний огляд', durationMinutes: 30 },
    { id: 'endocrinologist-urgent', name: 'Термінова консультація', durationMinutes: 30 },
    { id: 'endocrinologist-therapy', name: 'Підбір терапії', durationMinutes: 30 },
  ],
};

const QUICK_BOOK_DAYS_AHEAD = 7;

// Recurring weekly work-hours template per doctor for the quick-booking search.
const DOCTOR_WORK_WINDOWS: Record<string, { start: number; end: number }> = {
  kovalchuk: { start: 8 * 60, end: 16 * 60 },
  petrenko: { start: 9 * 60, end: 17 * 60 },
  shevchenko: { start: 10 * 60, end: 18 * 60 },
  bondarenko: { start: 8 * 60, end: 14 * 60 },
  moroz: { start: 12 * 60, end: 20 * 60 },
  lysenko: { start: 9 * 60, end: 15 * 60 },
  tkachenko: { start: 8 * 60, end: 16 * 60 },
  kravets: { start: 7 * 60, end: 15 * 60 },
  zakharchuk: { start: 11 * 60, end: 19 * 60 },
  poliakova: { start: 9 * 60, end: 17 * 60 },
  savchenko: { start: 13 * 60, end: 21 * 60 },
  romanenko: { start: 9 * 60, end: 17 * 60 },
};

// Days off per doctor, as JS day-of-week indices (0 = Sunday … 6 = Saturday).
const DOCTOR_DAYS_OFF: Record<string, number[]> = {
  kovalchuk: [0],
  petrenko: [0, 6],
  shevchenko: [0],
  bondarenko: [0, 6],
  moroz: [1],
  lysenko: [0, 6],
  tkachenko: [0],
  kravets: [0, 6],
  zakharchuk: [0],
  poliakova: [0, 6],
  savchenko: [1],
  romanenko: [0, 6],
};

function getDoctorWorkingRange(doctorId: string, date: Date) {
  const daysOff = DOCTOR_DAYS_OFF[doctorId] ?? [];
  if (daysOff.includes(date.getDay())) {
    return null;
  }
  return DOCTOR_WORK_WINDOWS[doctorId] ?? { start: START_HOUR * 60, end: END_HOUR * 60 };
}

export default function RecordsScreen() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [doctorFilter, setDoctorFilter] = useState<'all' | string[]>('all');
  const [openSelector, setOpenSelector] = useState<'view-mode' | 'doctor' | 'calendar' | null>(
    null
  );
  const [appointments, setAppointments] =
    useState<Record<string, AppointmentRecord[]>>(buildDemoAppointments);

  const isAllDoctors = doctorFilter === 'all';
  const customSelectedIds = isAllDoctors ? [] : doctorFilter;
  const visibleDoctorIds = isAllDoctors ? REAL_DOCTORS.map((doctor) => doctor.id) : doctorFilter;

  const handleToggleAllDoctors = () => {
    setDoctorFilter((current) => (current === 'all' ? [] : 'all'));
  };

  const selectedKey = dateKey(selectedDate);
  const dayAppointments = appointments[selectedKey] ?? [];

  const knownPatients = useMemo(() => {
    const byPhone = new Map<string, { name: string; phone: string }>();
    DEMO_PATIENTS.forEach((patient) => {
      byPhone.set(patient.phone.replace(/\D/g, ''), patient);
    });
    Object.values(appointments).forEach((dayList) => {
      dayList.forEach((appointment) => {
        const digits = appointment.phone?.replace(/\D/g, '') ?? '';
        if (digits.length > 2) {
          byPhone.set(digits, { name: appointment.title, phone: appointment.phone! });
        }
      });
    });
    return Array.from(byPhone.values());
  }, [appointments]);

  const allDoctors = REAL_DOCTORS.map((doctor) => ({
    id: doctor.id,
    label: `${doctor.firstName} ${doctor.lastName}`,
    color: doctor.color,
    specialty: doctor.specialty ?? '',
    services: SPECIALTY_PROCEDURES[doctor.specialty ?? ''] ?? [],
  }));

  const handleFindAvailableSlots = (doctorIds: string[], durationMinutes: number) => {
    const results: { date: Date; slots: { doctorId: string; startMinutes: number }[] }[] = [];
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    for (let dayOffset = 0; dayOffset < QUICK_BOOK_DAYS_AHEAD; dayOffset++) {
      const day = new Date(now);
      day.setDate(day.getDate() + dayOffset);
      const dayList = appointments[dateKey(day)] ?? [];
      const isToday = dayOffset === 0;
      const daySlots: { doctorId: string; startMinutes: number }[] = [];

      for (const doctorId of doctorIds) {
        const workingRange = getDoctorWorkingRange(doctorId, day);
        if (!workingRange) {
          continue;
        }
        const covered = dayList
          .filter((appointment) => appointment.doctorId === doctorId)
          .map((appointment) => ({
            start: appointment.startMinutes,
            end: appointment.startMinutes + appointment.durationMinutes,
          }));

        for (
          let slotStart = workingRange.start;
          slotStart + durationMinutes <= workingRange.end;
          slotStart += SLOT_MINUTES
        ) {
          if (isToday && slotStart < nowMinutes) {
            continue;
          }
          const slotEnd = slotStart + durationMinutes;
          const isFree = covered.every((range) => slotEnd <= range.start || slotStart >= range.end);
          if (isFree) {
            daySlots.push({ doctorId, startMinutes: slotStart });
          }
        }
      }

      if (daySlots.length > 0) {
        daySlots.sort(
          (a, b) => a.startMinutes - b.startMinutes || a.doctorId.localeCompare(b.doctorId)
        );
        results.push({ date: day, slots: daySlots });
      }
    }

    return results;
  };

  const doctorColumns = REAL_DOCTORS.filter((doctor) => visibleDoctorIds.includes(doctor.id)).map(
    (doctor) => {
      const doctorAppointments = dayAppointments
        .filter((appointment) => appointment.doctorId === doctor.id)
        .map((appointment) => ({ ...appointment, color: doctor.color }));
      return {
        doctorId: doctor.id,
        doctorLabel: `${doctor.firstName} ${doctor.lastName}`,
        specialty: doctor.specialty ?? '',
        color: doctor.color,
        events: layoutOverlappingEvents(doctorAppointments),
      };
    }
  );

  const handleAddSlot = (
    doctorId: string,
    startMinutes: number,
    durationMinutes: number,
    name: string,
    phone: string,
    reason: string
  ) => {
    const newAppointment: AppointmentRecord = {
      id: `${doctorId}-${startMinutes}-${Math.random().toString(36).slice(2)}`,
      doctorId,
      startMinutes,
      durationMinutes,
      title: name,
      reason,
      phone,
    };
    setAppointments((current) => ({
      ...current,
      [selectedKey]: [...(current[selectedKey] ?? []), newAppointment],
    }));
  };

  const handleRemoveEvent = (id: string) => {
    setAppointments((current) => ({
      ...current,
      [selectedKey]: (current[selectedKey] ?? []).filter((appointment) => appointment.id !== id),
    }));
  };

  const handleMoveEvent = (id: string, newStartMinutes: number) => {
    setAppointments((current) => ({
      ...current,
      [selectedKey]: (current[selectedKey] ?? []).map((appointment) =>
        appointment.id === id ? { ...appointment, startMinutes: newStartMinutes } : appointment
      ),
    }));
  };

  const handleUpdateEvent = (
    id: string,
    updates: {
      title: string;
      phone: string;
      reason: string;
      startMinutes: number;
      durationMinutes: number;
    }
  ) => {
    setAppointments((current) => ({
      ...current,
      [selectedKey]: (current[selectedKey] ?? []).map((appointment) =>
        appointment.id === id ? { ...appointment, ...updates } : appointment
      ),
    }));
  };

  return (
    <View className="h-full w-full flex-row bg-[#F1F4F5]">
      <DayTimeline
        date={selectedDate}
        doctors={doctorColumns}
        onAddSlot={handleAddSlot}
        onRemoveEvent={handleRemoveEvent}
        onMoveEvent={handleMoveEvent}
        onUpdateEvent={handleUpdateEvent}
        onSelectDate={setSelectedDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        calendarOpen={openSelector === 'calendar'}
        onCalendarOpenChange={(open) => setOpenSelector(open ? 'calendar' : null)}
        doctorSelect={{
          doctors: DOCTORS,
          allId: ALL_DOCTORS_ID,
          allSelected: isAllDoctors,
          selectedIds: customSelectedIds,
          onChangeSelected: setDoctorFilter,
          onToggleAll: handleToggleAllDoctors,
          open: openSelector === 'doctor',
          onOpenChange: (open) => setOpenSelector(open ? 'doctor' : null),
        }}
        knownPatients={knownPatients}
        allDoctors={allDoctors}
        onFindAvailableSlots={handleFindAvailableSlots}
      />
    </View>
  );
}
