import { Candidate, PipelineStage, Vacancy } from '../types/hrm';

/** Columns every new vacancy starts with; they can be renamed, reordered, removed or extended. */
export const defaultPipelineStages = (): PipelineStage[] => [
  { id: 'new', name: 'Yangi arizalar' },
  { id: 'screening', name: 'Skoring' },
  { id: 'interview', name: 'Suhbat' },
  { id: 'test', name: 'Test topshirig‘i' },
  { id: 'offer', name: 'Offer' },
  { id: 'hired', name: 'Qabul qilindi', outcome: 'hired' },
  { id: 'rejected', name: 'Rad etildi', outcome: 'rejected' },
];

/** True while the candidate sits in a non-final column of their vacancy. */
export const isCandidateInProgress = (candidate: Candidate, vacancies: Vacancy[]): boolean => {
  const vacancy = vacancies.find((v) => v.id === candidate.vacancyId);
  const stage = vacancy?.stages.find((s) => s.id === candidate.stageId);
  return !!stage && !stage.outcome;
};
