import type { StudySet } from "@automated-study-system/shared";

const STUDY_SET_CACHE_PREFIX = "study-sphere.study-set-cache:";
const memoryCache = new Map<string, StudySet>();

type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function getStudySetCacheKey(studySetId: string) {
  return `${STUDY_SET_CACHE_PREFIX}${studySetId}`;
}

export function readCachedStudySet(studySetId: string): StudySet | null {
  const memoryValue = memoryCache.get(studySetId);

  if (memoryValue) {
    return memoryValue;
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(getStudySetCacheKey(studySetId));

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StudySet;
    memoryCache.set(studySetId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function scheduleStorageWrite(studySet: StudySet) {
  const browserWindow = window as IdleWindow;
  const persist = () => {
    window.sessionStorage.setItem(getStudySetCacheKey(studySet.id), JSON.stringify(studySet));
  };

  if (typeof browserWindow.requestIdleCallback === "function") {
    browserWindow.requestIdleCallback(() => {
      persist();
    });
    return;
  }

  window.setTimeout(persist, 0);
}

export function writeCachedStudySet(studySet: StudySet) {
  if (typeof window === "undefined") {
    return;
  }

  memoryCache.set(studySet.id, studySet);
  scheduleStorageWrite(studySet);
}
