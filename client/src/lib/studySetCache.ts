import type { StudySet } from "@automated-study-system/shared";

const STUDY_SET_CACHE_PREFIX = "study-sphere.study-set-cache:";

export function getStudySetCacheKey(studySetId: string) {
  return `${STUDY_SET_CACHE_PREFIX}${studySetId}`;
}

export function readCachedStudySet(studySetId: string): StudySet | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(getStudySetCacheKey(studySetId));

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as StudySet;
  } catch {
    return null;
  }
}

export function writeCachedStudySet(studySet: StudySet) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(getStudySetCacheKey(studySet.id), JSON.stringify(studySet));
}
