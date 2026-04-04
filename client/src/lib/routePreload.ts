const preloadCache = new Map<string, Promise<unknown>>();

function memoizePreload<T>(key: string, loader: () => Promise<T>) {
  return () => {
    const cached = preloadCache.get(key);

    if (cached) {
      return cached as Promise<T>;
    }

    const nextPromise = loader().catch((error) => {
      preloadCache.delete(key);
      throw error;
    });

    preloadCache.set(key, nextPromise as Promise<unknown>);
    return nextPromise;
  };
}

export const loadHomePage = memoizePreload("home", () => import("../pages/HomePage"));
export const loadAuthPage = memoizePreload("auth", () => import("../pages/AuthPage"));
export const loadCreateStudySetPage = memoizePreload("create", () => import("../pages/CreateStudySetPage"));
export const loadSavedStudySetsPage = memoizePreload("saved", () => import("../pages/SavedStudySetsPage"));
export const loadStudySetPage = memoizePreload("study-set", () => import("../pages/StudySetPage"));
export const loadExamPage = memoizePreload("exam", () => import("../pages/ExamPage"));

export function preloadRoute(pathname: string) {
  if (pathname === "/") {
    return loadHomePage();
  }

  if (pathname === "/auth") {
    return loadAuthPage();
  }

  if (pathname === "/create") {
    return loadCreateStudySetPage();
  }

  if (pathname === "/saved") {
    return loadSavedStudySetsPage();
  }

  if (pathname.startsWith("/study-sets/") && pathname.endsWith("/exam")) {
    return loadExamPage();
  }

  if (pathname.startsWith("/study-sets/")) {
    return loadStudySetPage();
  }

  return Promise.resolve(null);
}
