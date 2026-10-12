export interface LanguageOption {
  code: string;
  label: string;
  /** Name used when instructing the model. */
  promptName: string;
}

/** Languages the professor may lecture in (speech recognition). */
export const SPEECH_LANGUAGES: LanguageOption[] = [
  { code: "en-US", label: "英语（美国）", promptName: "English" },
  { code: "en-GB", label: "英语（英国）", promptName: "English" },
  { code: "zh-CN", label: "中文（普通话）", promptName: "Simplified Chinese" },
  { code: "zh-TW", label: "中文（台湾）", promptName: "Traditional Chinese" },
  { code: "ja-JP", label: "日语", promptName: "Japanese" },
  { code: "ko-KR", label: "韩语", promptName: "Korean" },
  { code: "fr-FR", label: "法语", promptName: "French" },
  { code: "de-DE", label: "德语", promptName: "German" },
  { code: "es-ES", label: "西班牙语", promptName: "Spanish" },
];

/** Languages for notes, summaries, quizzes and translation. */
export const OUTPUT_LANGUAGES: LanguageOption[] = [
  { code: "zh-CN", label: "简体中文", promptName: "Simplified Chinese" },
  { code: "zh-TW", label: "繁體中文", promptName: "Traditional Chinese" },
  { code: "en", label: "English", promptName: "English" },
  { code: "ja", label: "日本語", promptName: "Japanese" },
  { code: "ko", label: "한국어", promptName: "Korean" },
];

export function promptLanguageName(code: string): string {
  const all = [...OUTPUT_LANGUAGES, ...SPEECH_LANGUAGES];
  return all.find((l) => l.code === code)?.promptName ?? code;
}

/** True when transcripts in speechLang are already in outputLang, so translating them is pointless. */
export function sameLanguage(speechLang: string, outputLang: string): boolean {
  return promptLanguageName(speechLang) === promptLanguageName(outputLang);
}
