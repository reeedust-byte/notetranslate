/** Small per-browser conveniences kept in localStorage. Every access may throw (private mode, blocked storage). */

export interface NewLectureDefaults {
  course: string;
  speechLang: string;
  outputLang: string;
  translate: boolean;
}

const KEY = "notetranslate:new-lecture";

export const DEFAULTS: NewLectureDefaults = {
  course: "",
  speechLang: "en-US",
  outputLang: "zh-CN",
  translate: true,
};

export function loadNewLectureDefaults(): NewLectureDefaults {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<NewLectureDefaults>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveNewLectureDefaults(value: NewLectureDefaults): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Not persisted; the form just starts from defaults next time.
  }
}
